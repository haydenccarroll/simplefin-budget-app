package simplefin

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"net/http"
	"strings"

	"budget-app/apps/budget-api/internal/membership"
	"budget-app/apps/budget-api/internal/queries"
	sf "budget-app/apps/budget-api/internal/simplefin"
)

// loadConnection returns the budget's bank connection, or nil if it has none.
func (h *Handler) loadConnection(ctx context.Context, budgetID int32) (*queries.BankConnection, error) {
	conn, err := h.queries.GetBankConnectionForBudget(ctx, budgetID)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	} else if err != nil {
		return nil, fmt.Errorf("load bank connection: %w", err)
	}
	return &conn, nil
}

type connectRequest struct {
	// SetupToken is the token from the owner's SimpleFIN bridge. It works once:
	// the API claims it for an access URL and keeps only that.
	SetupToken string `json:"setup_token"`
}

// Connect links the budget to a bank by claiming a SimpleFIN setup token. The
// budget's owner is the only one who can, and the connection is then shared by
// every member. Submitting another token replaces the connection.
//
// @Summary      Connect the budget to SimpleFIN with a setup token
// @Tags         simplefin
// @Accept       json
// @Produce      json
// @Param        token body connectRequest true "SimpleFIN setup token"
// @Success      200 {object} connectionStatusResponse
// @Failure      400
// @Failure      403
// @Failure      422
// @Failure      502
// @Router       /v1/simplefin/connection [put]
func (h *Handler) Connect(w http.ResponseWriter, r *http.Request) {
	access, ok := membership.Require(w, r, h.queries, h.logger)
	if !ok {
		return
	}
	if !access.IsOwner {
		writeError(w, http.StatusForbidden, "only the budget's owner can connect a bank")
		return
	}
	var req connectRequest
	if err := decodeJSON(r, &req); err != nil || strings.TrimSpace(req.SetupToken) == "" {
		writeError(w, http.StatusBadRequest, "setup_token is required")
		return
	}
	ctx := r.Context()

	accessURL, err := h.provider.ClaimAccessURL(ctx, req.SetupToken)
	if errors.Is(err, sf.ErrInvalidToken) {
		h.logger.WarnContext(ctx, "simplefin token rejected", "error", err, "user_id", access.UserID)
		writeError(w, http.StatusUnprocessableEntity, "SimpleFIN rejected that token: "+err.Error())
		return
	} else if err != nil {
		h.logger.ErrorContext(ctx, "failed to claim simplefin access url", "error", err, "user_id", access.UserID)
		writeError(w, http.StatusBadGateway, "could not reach the SimpleFIN bridge; try again")
		return
	}

	if err := h.queries.UpsertBankConnection(ctx, queries.UpsertBankConnectionParams{
		BudgetID:  access.BudgetID,
		UserID:    access.UserID,
		AccessUrl: accessURL,
	}); err != nil {
		// A setup token can be claimed only once, so this one is spent: say so.
		h.logger.ErrorContext(ctx, "failed to save bank connection", "error", err, "user_id", access.UserID)
		writeError(w, http.StatusInternalServerError, "SimpleFIN accepted the token but we couldn't save the connection; create a new token and try again")
		return
	}

	// Best effort: list the accounts now so they show up straight away. If it
	// fails, the first sync fills them in.
	if conn, err := h.loadConnection(ctx, access.BudgetID); err == nil && conn != nil {
		if result, err := h.provider.FetchAccounts(ctx, accessURL); err != nil {
			h.logger.WarnContext(ctx, "failed to fetch accounts for new connection", "error", err)
			h.recordFailure(ctx, conn.ID, err)
		} else {
			// Not marked as synced: no transactions have been imported yet, so the
			// next sync must not be held off.
			h.recordAccounts(ctx, conn.ID, result.Accounts)
		}
	}

	h.writeConnectionStatus(w, r, access)
}

// Disconnect removes the budget's bank connection. Expenses and income already
// imported stay. Owner only.
//
// @Summary      Disconnect the budget from SimpleFIN
// @Tags         simplefin
// @Success      204
// @Failure      403
// @Router       /v1/simplefin/connection [delete]
func (h *Handler) Disconnect(w http.ResponseWriter, r *http.Request) {
	access, ok := membership.Require(w, r, h.queries, h.logger)
	if !ok {
		return
	}
	if !access.IsOwner {
		writeError(w, http.StatusForbidden, "only the budget's owner can disconnect the bank")
		return
	}
	if _, err := h.queries.DeleteBankConnectionForBudget(r.Context(), access.BudgetID); err != nil {
		h.logger.ErrorContext(r.Context(), "failed to remove bank connection", "error", err)
		writeError(w, http.StatusInternalServerError, "failed to disconnect the bank")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
