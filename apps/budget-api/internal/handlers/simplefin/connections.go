package simplefin

import (
	"context"
	"database/sql"
	"errors"
	"net/http"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"budget-app/apps/budget-api/internal/membership"
	"budget-app/apps/budget-api/internal/queries"
	sf "budget-app/apps/budget-api/internal/simplefin"
)

// maxAliasLength matches the bank_account_settings.alias column.
const maxAliasLength = 100

type accountResponse struct {
	ID int32 `json:"id"`
	// Name is the bank's name for the account; Alias is the user's own name
	// for it (null if unset) and DisplayName is whichever should be shown.
	Name        string     `json:"name"`
	Alias       *string    `json:"alias"`
	DisplayName string     `json:"display_name"`
	OrgName     string     `json:"org_name"`
	Currency    string     `json:"currency"`
	Balance     *string    `json:"balance"`
	BalanceDate *time.Time `json:"balance_date"`
	// InvertAmounts flips income and expenses for accounts (some credit
	// cards) whose bank reports purchases as positive.
	InvertAmounts bool `json:"invert_amounts"`
}

type connectionResponse struct {
	LastSyncedAt *time.Time        `json:"last_synced_at"`
	LastError    *string           `json:"last_error"`
	Accounts     []accountResponse `json:"accounts"`
}

type connectionStatusResponse struct {
	// IsOwner is whether the caller owns the budget. Only the owner connects or
	// disconnects the bank, so members are told to ask the owner instead.
	IsOwner bool `json:"is_owner"`
	// Connection is null when the budget has no bank connection.
	Connection *connectionResponse `json:"connection"`
}

func toConnectionResponse(c queries.BankConnection, accounts []queries.ListBankAccountsRow) *connectionResponse {
	resp := &connectionResponse{Accounts: make([]accountResponse, 0, len(accounts))}
	if c.LastSyncedAt.Valid {
		resp.LastSyncedAt = &c.LastSyncedAt.Time
	}
	if c.LastError.Valid {
		resp.LastError = &c.LastError.String
	}
	for _, a := range accounts {
		resp.Accounts = append(resp.Accounts, toAccountResponse(a))
	}
	return resp
}

func toAccountResponse(a queries.ListBankAccountsRow) accountResponse {
	acct := accountResponse{
		ID:            a.ID,
		Name:          a.Name,
		DisplayName:   a.Name,
		OrgName:       a.OrgName,
		Currency:      a.Currency,
		InvertAmounts: a.InvertAmounts,
	}
	if a.Alias.Valid {
		acct.Alias = &a.Alias.String
		acct.DisplayName = a.Alias.String
	}
	if a.Balance.Valid {
		acct.Balance = &a.Balance.String
	}
	if a.BalanceDate.Valid {
		acct.BalanceDate = &a.BalanceDate.Time
	}
	return acct
}

// GetConnection returns the bank accounts linked to the caller's budget,
// read-only. They come from the connection the budget's owner made with their
// SimpleFIN token (see Connect). Accounts come from the last snapshot taken
// when we talked to the bridge, not a live fetch, to stay inside its request
// quota.
//
// @Summary      View linked bank accounts
// @Tags         simplefin
// @Produce      json
// @Success      200 {object} connectionStatusResponse
// @Router       /v1/simplefin/connection [get]
func (h *Handler) GetConnection(w http.ResponseWriter, r *http.Request) {
	access, ok := membership.Require(w, r, h.queries, h.logger)
	if !ok {
		return
	}
	h.writeConnectionStatus(w, r, access)
}

// writeConnectionStatus answers with the caller's view of the budget's bank
// connection.
func (h *Handler) writeConnectionStatus(w http.ResponseWriter, r *http.Request, access membership.Access) {
	ctx := r.Context()
	conn, err := h.loadConnection(ctx, access.BudgetID)
	if err != nil {
		h.logger.ErrorContext(ctx, "failed to load bank connection", "error", err)
		writeError(w, http.StatusInternalServerError, "failed to load bank connection")
		return
	}

	resp := connectionStatusResponse{IsOwner: access.IsOwner}
	if conn != nil {
		accounts, err := h.queries.ListBankAccounts(ctx, conn.ID)
		if err != nil {
			h.logger.ErrorContext(ctx, "failed to list bank accounts", "error", err)
			writeError(w, http.StatusInternalServerError, "failed to load bank connection")
			return
		}
		resp.Connection = toConnectionResponse(*conn, accounts)
	}
	writeJSON(w, http.StatusOK, resp)
}

type updateAccountRequest struct {
	// Alias is the user's name for the account; null or blank clears it.
	Alias         *string `json:"alias"`
	InvertAmounts bool    `json:"invert_amounts"`
}

type updateAccountResponse struct {
	accountResponse
	// ResyncNeeded is set when the account's imported transactions were
	// removed (because its sign was flipped) and need a fresh sync.
	ResyncNeeded bool `json:"resync_needed"`
}

// UpdateAccount sets a bank account's alias and whether its income/expense
// sign is flipped. Which accounts exist is controlled at SimpleFIN, so this
// is the only thing that can be changed about one. Renaming relabels the
// account's already-imported transactions; flipping removes them so the next
// sync re-imports them with the right sign.
//
// @Summary      Update a bank account's alias or sign
// @Tags         simplefin
// @Accept       json
// @Produce      json
// @Param        id path int true "Account ID"
// @Param        account body updateAccountRequest true "Account settings"
// @Success      200 {object} updateAccountResponse
// @Failure      400
// @Failure      404
// @Router       /v1/simplefin/accounts/{id} [patch]
func (h *Handler) UpdateAccount(w http.ResponseWriter, r *http.Request) {
	access, ok := membership.Require(w, r, h.queries, h.logger)
	if !ok {
		return
	}
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 32)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid account id")
		return
	}
	var req updateAccountRequest
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	alias := sql.NullString{}
	if req.Alias != nil {
		if trimmed := strings.TrimSpace(*req.Alias); trimmed != "" {
			if utf8.RuneCountInString(trimmed) > maxAliasLength {
				writeError(w, http.StatusBadRequest, "alias must be at most 100 characters")
				return
			}
			alias = sql.NullString{String: trimmed, Valid: true}
		}
	}

	ctx := r.Context()
	before, err := h.queries.GetBankAccount(ctx, queries.GetBankAccountParams{ID: int32(id), BudgetID: access.BudgetID})
	if errors.Is(err, sql.ErrNoRows) {
		writeError(w, http.StatusNotFound, "account not found")
		return
	} else if err != nil {
		h.logger.ErrorContext(ctx, "failed to load bank account", "error", err)
		writeError(w, http.StatusInternalServerError, "failed to update account")
		return
	}

	if err := h.queries.UpsertBankAccountSettings(ctx, queries.UpsertBankAccountSettingsParams{
		BudgetID:      access.BudgetID,
		ExternalID:    before.ExternalID,
		Alias:         alias,
		InvertAmounts: req.InvertAmounts,
	}); err != nil {
		h.logger.ErrorContext(ctx, "failed to save bank account settings", "error", err)
		writeError(w, http.StatusInternalServerError, "failed to update account")
		return
	}

	displayName := before.Name
	if alias.Valid {
		displayName = alias.String
	}
	resp := updateAccountResponse{ResyncNeeded: req.InvertAmounts != before.InvertAmounts}
	if resp.ResyncNeeded {
		if err := h.queries.PurgeSyncedExpensesForAccount(ctx, queries.PurgeSyncedExpensesForAccountParams{AccountID: before.ExternalID, BudgetID: access.BudgetID}); err != nil {
			h.logger.ErrorContext(ctx, "failed to remove synced expenses", "error", err)
		}
		if err := h.queries.PurgeSyncedIncomeItemsForAccount(ctx, queries.PurgeSyncedIncomeItemsForAccountParams{AccountID: before.ExternalID, BudgetID: access.BudgetID}); err != nil {
			h.logger.ErrorContext(ctx, "failed to remove synced income", "error", err)
		}
		// The removed transactions come back on the next sync, which must not be held off.
		if err := h.queries.ClearBankConnectionSynced(ctx, access.BudgetID); err != nil {
			h.logger.ErrorContext(ctx, "failed to clear last sync time", "error", err)
		}
	}
	if alias != before.Alias {
		name := sql.NullString{String: displayName, Valid: true}
		if err := h.queries.RenameSyncedExpenses(ctx, queries.RenameSyncedExpensesParams{Name: name, AccountID: before.ExternalID, BudgetID: access.BudgetID}); err != nil {
			h.logger.ErrorContext(ctx, "failed to relabel synced expenses", "error", err)
		}
		if err := h.queries.RenameSyncedIncomeItems(ctx, queries.RenameSyncedIncomeItemsParams{Name: name, AccountID: before.ExternalID, BudgetID: access.BudgetID}); err != nil {
			h.logger.ErrorContext(ctx, "failed to relabel synced income", "error", err)
		}
	}

	after, err := h.queries.GetBankAccount(ctx, queries.GetBankAccountParams{ID: int32(id), BudgetID: access.BudgetID})
	if err != nil {
		h.logger.ErrorContext(ctx, "failed to reload bank account", "error", err)
		writeError(w, http.StatusInternalServerError, "failed to update account")
		return
	}
	resp.accountResponse = toAccountResponse(queries.ListBankAccountsRow(after))
	writeJSON(w, http.StatusOK, resp)
}

// recordAccounts snapshots the accounts a bridge returned and drops any the
// user has since unlinked. An empty list is ignored: it more likely means a
// bridge hiccup than that every account was removed.
func (h *Handler) recordAccounts(ctx context.Context, connID int32, accounts []sf.Account) {
	if len(accounts) == 0 {
		return
	}
	ids := make([]string, 0, len(accounts))
	for _, a := range accounts {
		ids = append(ids, a.ID)
		params := queries.UpsertBankAccountParams{
			BankConnectionID: connID,
			ExternalID:       a.ID,
			Name:             a.Name,
			OrgName:          a.OrgName,
			Currency:         a.Currency,
		}
		if _, err := strconv.ParseFloat(a.Balance, 64); err == nil {
			params.Balance = sql.NullString{String: a.Balance, Valid: true}
		}
		if !a.BalanceDate.IsZero() && a.BalanceDate.Unix() > 0 {
			params.BalanceDate = sql.NullTime{Time: a.BalanceDate, Valid: true}
		}
		if err := h.queries.UpsertBankAccount(ctx, params); err != nil {
			h.logger.ErrorContext(ctx, "failed to store bank account", "error", err, "connection_id", connID)
		}
	}
	if err := h.queries.DeleteBankAccountsNotIn(ctx, queries.DeleteBankAccountsNotInParams{
		BankConnectionID: connID,
		ExternalIds:      ids,
	}); err != nil {
		h.logger.ErrorContext(ctx, "failed to prune bank accounts", "error", err, "connection_id", connID)
	}
}

// recordFailure stores a user-presentable reason a connection last failed.
func (h *Handler) recordFailure(ctx context.Context, connID int32, cause error) {
	msg := userFacingError(cause)
	if err := h.queries.MarkBankConnectionFailed(ctx, queries.MarkBankConnectionFailedParams{
		LastError: sql.NullString{String: msg, Valid: true},
		ID:        connID,
	}); err != nil {
		h.logger.ErrorContext(ctx, "failed to record bank connection failure", "error", err)
	}
}

// userFacingError maps a provider error to a message safe to show the user
// (bridge errors can contain internals, so unknown ones are generalized).
func userFacingError(err error) string {
	switch {
	case errors.Is(err, sf.ErrAccessRevoked):
		return sf.ErrAccessRevoked.Error()
	case errors.Is(err, sf.ErrPaymentRequired):
		return sf.ErrPaymentRequired.Error()
	default:
		return "could not reach the SimpleFIN bridge"
	}
}
