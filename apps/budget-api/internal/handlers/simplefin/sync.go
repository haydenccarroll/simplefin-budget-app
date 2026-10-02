package simplefin

import (
	"context"
	"database/sql"
	"errors"
	"net/http"
	"time"

	"budget-app/apps/budget-api/internal/membership"
	"budget-app/apps/budget-api/internal/queries"
	sf "budget-app/apps/budget-api/internal/simplefin"
)

const monthLayout = "2006-01"

// syncMinInterval is how long a successful sync holds off the next sync of the same month: the app asks for
// a sync every time it loads or refreshes, and the bank bridge limits how often it can be
// asked. It is written into the BudgetMonthSyncedRecently query too.
const syncMinInterval = 15 * time.Minute

// maxDescriptionLength matches the VARCHAR(255) description/name columns.
const maxDescriptionLength = 255

type syncResponse struct {
	ExpensesImported int `json:"expenses_imported"`
	IncomeImported   int `json:"income_imported"`
	Skipped          int `json:"skipped_duplicates"`
	// TransfersSkipped counts transactions left out because their description
	// reads as a transfer or card payment.
	TransfersSkipped int `json:"transfers_skipped"`
	// ExpensesCategorizing is how many of the month's uncategorized expenses
	// (new or not) were queued for the worker to categorize with the LLM; their
	// categories appear shortly after.
	ExpensesCategorizing int `json:"expenses_categorizing"`
	// Warnings are non-fatal notes reported by the bridge (e.g. one
	// institution needs re-authentication) while the rest synced fine.
	Warnings []string `json:"warnings"`
	// Throttled is true when the month was synced less than 15 minutes ago, so nothing was
	// fetched and the counts above are all zero.
	Throttled bool `json:"throttled"`
}

// Sync pulls transactions from the budget's SimpleFIN connection for the given
// budget month and imports them: outflows become unassigned expenses,
// inflows become income items with their actual amount set. Transactions
// already imported (matched by external_id) are silently skipped, so
// syncing the same month twice is safe.
//
// Transactions whose description looks like a transfer or a credit card
// payment (see sf.LooksLikeTransfer) are left out, and any already-imported
// one is removed. Per-account settings apply first: a flipped account has
// its signs inverted, and aliases name the source.
//
// A budget month that was successfully synced in the last 15 minutes is not synced again: the
// call returns at once with throttled set. The app calls this on every load and refresh.
//
// @Summary      Sync bank transactions into a budget month
// @Tags         simplefin
// @Produce      json
// @Param        month path string true "Month, formatted YYYY-MM"
// @Success      200 {object} syncResponse
// @Failure      400
// @Failure      404
// @Failure      502
// @Router       /v1/budget-month/{month}/sync [post]
func (h *Handler) Sync(w http.ResponseWriter, r *http.Request) {
	access, ok := membership.Require(w, r, h.queries, h.logger)
	if !ok {
		return
	}

	rawMonth, err := time.Parse(monthLayout, r.PathValue("month"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "month must be formatted as YYYY-MM")
		return
	}
	month := time.Date(rawMonth.Year(), rawMonth.Month(), 1, 0, 0, 0, 0, time.UTC)

	ctx := r.Context()
	bm, err := h.queries.GetBudgetMonth(ctx, queries.GetBudgetMonthParams{BudgetID: access.BudgetID, Month: month})
	if errors.Is(err, sql.ErrNoRows) {
		writeError(w, http.StatusNotFound, "budget month not started")
		return
	} else if err != nil {
		h.logger.ErrorContext(ctx, "failed to get budget month", "error", err)
		writeError(w, http.StatusInternalServerError, "failed to sync")
		return
	}

	conn, err := h.loadConnection(ctx, access.BudgetID)
	if err != nil {
		h.logger.ErrorContext(ctx, "failed to load bank connection", "error", err)
		writeError(w, http.StatusInternalServerError, "failed to sync")
		return
	}
	if conn == nil {
		message := "no bank connection: add your SimpleFIN token"
		if !access.IsOwner {
			message = "no bank connection: ask the budget's owner to add their SimpleFIN token"
		}
		writeError(w, http.StatusBadRequest, message)
		return
	}

	recent, err := h.queries.BudgetMonthSyncedRecently(ctx, bm.ID)
	if err != nil {
		h.logger.ErrorContext(ctx, "failed to check last sync", "error", err)
		writeError(w, http.StatusInternalServerError, "failed to sync")
		return
	}
	if recent > 0 {
		h.logger.InfoContext(ctx, "sync throttled: month synced within the last 15 minutes, nothing fetched",
			"month", rawMonthString(month), "bank_connection_id", conn.ID)
		writeJSON(w, http.StatusOK, syncResponse{Warnings: []string{}, Throttled: true})
		return
	}

	// SimpleFIN's end-date is exclusive.
	start := month
	end := month.AddDate(0, 1, 0)

	h.logger.InfoContext(ctx, "sync fetching from bridge", "month", rawMonthString(month), "bank_connection_id", conn.ID,
		"start", start.Format(time.RFC3339), "end", end.Format(time.RFC3339), "start_unix", start.Unix(), "end_unix", end.Unix())
	result, err := h.provider.FetchTransactions(ctx, conn.AccessUrl, start, end)
	if err != nil {
		h.logger.ErrorContext(ctx, "failed to fetch transactions", "error", err)
		h.recordFailure(ctx, conn.ID, err)
		writeError(w, http.StatusBadGateway, "failed to fetch bank transactions: "+userFacingError(err))
		return
	}
	h.logSyncFetch(ctx, month, result)
	h.recordAccounts(ctx, conn.ID, result.Accounts)
	if err := h.queries.MarkBankConnectionSynced(ctx, conn.ID); err != nil {
		h.logger.ErrorContext(ctx, "failed to mark bank connection synced", "error", err)
	}
	if err := h.queries.MarkBudgetMonthSynced(ctx, bm.ID); err != nil {
		h.logger.ErrorContext(ctx, "failed to mark budget month synced", "error", err)
	}

	settings, err := h.accountSettings(ctx, access.BudgetID)
	if err != nil {
		h.logger.ErrorContext(ctx, "failed to load bank account settings", "error", err)
		writeError(w, http.StatusInternalServerError, "failed to sync")
		return
	}
	txns := result.Transactions
	for i := range txns {
		if s, ok := settings[txns[i].AccountID]; ok {
			if s.InvertAmounts {
				txns[i].Amount = -txns[i].Amount
			}
			if s.Alias.Valid {
				txns[i].AccountName = s.Alias.String
			}
		}
	}

	// Anything already imported by an earlier sync that looks like a transfer
	// is removed (soft-deleted, so it isn't re-imported).
	transfers := make(map[string]bool)
	for _, t := range txns {
		if !sf.LooksLikeTransfer(t.Description) {
			continue
		}
		transfers[t.ExternalID] = true
		id := sql.NullString{String: t.ExternalID, Valid: true}
		if err := h.queries.RemoveSyncedExpense(ctx, queries.RemoveSyncedExpenseParams{ExternalID: id, BudgetID: access.BudgetID}); err != nil {
			h.logger.ErrorContext(ctx, "failed to remove transfer expense", "error", err, "external_id", t.ExternalID)
		}
		if err := h.queries.RemoveSyncedIncomeItem(ctx, queries.RemoveSyncedIncomeItemParams{ExternalID: id, BudgetID: access.BudgetID}); err != nil {
			h.logger.ErrorContext(ctx, "failed to remove transfer income", "error", err, "external_id", t.ExternalID)
		}
	}

	existingIncome, err := h.queries.ListIncomeItemsByMonth(ctx, bm.ID)
	if err != nil {
		h.logger.ErrorContext(ctx, "failed to list income items", "error", err)
		writeError(w, http.StatusInternalServerError, "failed to sync")
		return
	}
	nextSortOrder := int32(len(existingIncome))

	resp := syncResponse{Warnings: result.Warnings}
	if resp.Warnings == nil {
		resp.Warnings = []string{}
	}
	for _, t := range txns {
		if transfers[t.ExternalID] {
			resp.TransfersSkipped++
			continue
		}
		externalID := sql.NullString{String: t.ExternalID, Valid: t.ExternalID != ""}
		sourceAccount := sql.NullString{String: truncate(t.AccountName, maxDescriptionLength), Valid: t.AccountName != ""}

		if t.Amount < 0 {
			result, err := h.queries.CreateExpenseFromSync(ctx, queries.CreateExpenseFromSyncParams{
				BudgetMonthID:     bm.ID,
				Description:       truncate(t.Description, maxDescriptionLength),
				Amount:            formatAmount(-t.Amount),
				TransactedAt:      sql.NullTime{Time: t.Date, Valid: true},
				Note:              sql.NullString{String: "Imported via SimpleFIN", Valid: true},
				ExternalID:        externalID,
				SourceAccountName: sourceAccount,
			})
			if err != nil {
				h.logger.ErrorContext(ctx, "failed to import expense", "error", err, "external_id", t.ExternalID)
				continue
			}
			if affected, _ := result.RowsAffected(); affected > 0 {
				resp.ExpensesImported++
			} else {
				resp.Skipped++
			}
			continue
		}

		result, err := h.queries.CreateIncomeItemFromSync(ctx, queries.CreateIncomeItemFromSyncParams{
			BudgetMonthID:     bm.ID,
			Name:              truncate(t.Description, maxDescriptionLength),
			PlannedAmount:     formatAmount(t.Amount),
			ReceivedAt:        sql.NullTime{Time: t.Date, Valid: true},
			SortOrder:         nextSortOrder,
			ExternalID:        externalID,
			SourceAccountName: sourceAccount,
		})
		if err != nil {
			h.logger.ErrorContext(ctx, "failed to import income", "error", err, "external_id", t.ExternalID)
			continue
		}
		if affected, _ := result.RowsAffected(); affected > 0 {
			resp.IncomeImported++
			nextSortOrder++
		} else {
			resp.Skipped++
		}
	}

	if h.classifier.Enabled() {
		// Every uncategorized expense in the month is queued, not just the ones
		// this sync imported: anything still uncategorized (say, because queueing
		// failed when it was added) gets another try. The
		// jobs go on a durable queue and the worker does the categorizing, so the
		// sync itself stays fast and nothing is lost if a pod restarts.
		queued, err := h.classifier.EnqueueUnassigned(ctx, bm.ID)
		resp.ExpensesCategorizing = queued
		if err != nil {
			h.logger.ErrorContext(ctx, "failed to queue categorization", "error", err, "queued", queued)
			resp.Warnings = append(resp.Warnings, "Couldn't queue automatic categorization; it will be retried on the next sync.")
		}
	}

	h.logger.InfoContext(ctx, "sync finished", "month", rawMonthString(month), "fetched", len(txns),
		"expenses_imported", resp.ExpensesImported, "income_imported", resp.IncomeImported,
		"skipped_duplicates", resp.Skipped, "transfers_skipped", resp.TransfersSkipped,
		"categorizing", resp.ExpensesCategorizing, "warnings", resp.Warnings)
	writeJSON(w, http.StatusOK, resp)
}

func rawMonthString(month time.Time) string { return month.Format(monthLayout) }

// logSyncFetch logs what the bridge returned for a sync: per-account counts and date
// ranges, bridge-reported errors, and what the client dropped.
func (h *Handler) logSyncFetch(ctx context.Context, month time.Time, result sf.Result) {
	d := result.Diagnostics
	h.logger.InfoContext(ctx, "sync bridge response", "month", rawMonthString(month),
		"accounts", len(result.Accounts), "transactions", len(result.Transactions),
		"dropped_pending", d.Pending, "dropped_no_posted_date", d.NoPostedDate, "dropped_bad_amount", d.BadAmount,
		"bridge_errors", d.BridgeErrors)
	for _, a := range d.Accounts {
		h.logger.InfoContext(ctx, "sync bridge account", "month", rawMonthString(month), "account_id", a.ID,
			"account", a.Name, "transactions", a.Transactions,
			"earliest", a.Earliest.Format(time.DateOnly), "latest", a.Latest.Format(time.DateOnly))
	}
	if len(d.BridgeErrors) > 0 {
		h.logger.WarnContext(ctx, "bridge reported errors during sync", "month", rawMonthString(month), "errors", d.BridgeErrors)
	}
}

// truncate shortens s to at most n runes.
func truncate(s string, n int) string {
	if r := []rune(s); len(r) > n {
		return string(r[:n])
	}
	return s
}

// accountSettings loads per-account settings keyed by the bridge's account ID.
func (h *Handler) accountSettings(ctx context.Context, budgetID int32) (map[string]queries.ListBankAccountSettingsRow, error) {
	rows, err := h.queries.ListBankAccountSettings(ctx, budgetID)
	if err != nil {
		return nil, err
	}
	settings := make(map[string]queries.ListBankAccountSettingsRow, len(rows))
	for _, r := range rows {
		settings[r.ExternalID] = r
	}
	return settings, nil
}
