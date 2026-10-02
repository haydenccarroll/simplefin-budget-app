package budget

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"net/http"
	"time"

	"budget-app/apps/budget-api/internal/membership"
	"budget-app/apps/budget-api/internal/queries"
)

// GetBudgetMonth returns the full nested budget view for a month (income,
// category groups, spent/remaining, and totals). It does NOT create the
// month if it doesn't exist yet — callers should use StartBudgetMonth for
// that, which is what powers the "Start Budget" flow.
//
// @Summary      Get budget month
// @Description  Returns the full nested budget for a month that has already been started
// @Tags         budget
// @Produce      json
// @Param        month path string true "Month, formatted YYYY-MM"
// @Success      200 {object} BudgetMonthResponse
// @Failure      400
// @Failure      404
// @Failure      500
// @Router       /v1/budget-month/{month} [get]
func (h *Handler) GetBudgetMonth(w http.ResponseWriter, r *http.Request) {
	access, ok := membership.Require(w, r, h.queries, h.logger)
	if !ok {
		return
	}

	month, err := parseMonth(r.PathValue("month"))
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	ctx := r.Context()
	row, err := h.queries.GetBudgetMonth(ctx, queries.GetBudgetMonthParams{BudgetID: access.BudgetID, Month: month})
	if errors.Is(err, sql.ErrNoRows) {
		writeError(w, http.StatusNotFound, "budget month not started")
		return
	} else if err != nil {
		h.logger.ErrorContext(ctx, "failed to get budget month", "error", err)
		writeError(w, http.StatusInternalServerError, "failed to load budget month")
		return
	}

	resp, err := h.buildBudgetMonthResponse(ctx, row.ID, month)
	if err != nil {
		h.logger.ErrorContext(ctx, "failed to build budget month response", "error", err)
		writeError(w, http.StatusInternalServerError, "failed to load budget month")
		return
	}
	writeJSON(w, http.StatusOK, resp)
}

// StartBudgetMonth creates a budget month, copying category groups and
// income items forward from the most recent prior month (if any) with
// planned amounts intact and no expenses. This is the "Start Budget" action.
//
// @Summary      Start budget month
// @Description  Creates a budget month, autopopulating it from the previous month
// @Tags         budget
// @Produce      json
// @Param        month path string true "Month, formatted YYYY-MM"
// @Success      201 {object} BudgetMonthResponse
// @Failure      400
// @Failure      409
// @Failure      500
// @Router       /v1/budget-month/{month}/start [post]
func (h *Handler) StartBudgetMonth(w http.ResponseWriter, r *http.Request) {
	access, ok := membership.Require(w, r, h.queries, h.logger)
	if !ok {
		return
	}

	month, err := parseMonth(r.PathValue("month"))
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	ctx := r.Context()
	if _, err := h.queries.GetBudgetMonth(ctx, queries.GetBudgetMonthParams{BudgetID: access.BudgetID, Month: month}); err == nil {
		writeError(w, http.StatusConflict, "budget month already started")
		return
	} else if !errors.Is(err, sql.ErrNoRows) {
		h.logger.ErrorContext(ctx, "failed to get budget month", "error", err)
		writeError(w, http.StatusInternalServerError, "failed to start budget month")
		return
	}

	budgetMonthID, err := h.createBudgetMonth(ctx, access, month)
	if err != nil {
		h.logger.ErrorContext(ctx, "failed to create budget month", "error", err)
		writeError(w, http.StatusInternalServerError, "failed to start budget month")
		return
	}

	resp, err := h.buildBudgetMonthResponse(ctx, budgetMonthID, month)
	if err != nil {
		h.logger.ErrorContext(ctx, "failed to build budget month response", "error", err)
		writeError(w, http.StatusInternalServerError, "failed to load budget month")
		return
	}
	writeJSON(w, http.StatusCreated, resp)
}

// ListBudgetMonths returns the months that exist, most recent first. Budgets
// are shared by all users.
//
// @Summary      List budget months
// @Tags         budget
// @Produce      json
// @Success      200 {array} BudgetMonthSummary
// @Failure      500
// @Router       /v1/budget-months [get]
func (h *Handler) ListBudgetMonths(w http.ResponseWriter, r *http.Request) {
	access, ok := membership.Require(w, r, h.queries, h.logger)
	if !ok {
		return
	}

	rows, err := h.queries.ListBudgetMonths(r.Context(), access.BudgetID)
	if err != nil {
		h.logger.ErrorContext(r.Context(), "failed to list budget months", "error", err)
		writeError(w, http.StatusInternalServerError, "failed to list budget months")
		return
	}

	resp := make([]BudgetMonthSummary, len(rows))
	for i, row := range rows {
		resp[i] = BudgetMonthSummary{ID: int64(row.ID), Month: formatMonth(row.Month)}
	}
	writeJSON(w, http.StatusOK, resp)
}

// createBudgetMonth inserts a new budget month and, if a prior month exists
// for the budget, copies its category groups and income items forward
// (planned amounts only — actuals and expenses start fresh).
func (h *Handler) createBudgetMonth(ctx context.Context, access membership.Access, month time.Time) (int32, error) {
	result, err := h.queries.CreateBudgetMonth(ctx, queries.CreateBudgetMonthParams{
		BudgetID: access.BudgetID,
		UserID:   access.UserID,
		Month:    month,
	})
	if err != nil {
		return 0, fmt.Errorf("create budget month: %w", err)
	}
	id, err := result.LastInsertId()
	if err != nil {
		return 0, fmt.Errorf("get new budget month id: %w", err)
	}
	newBudgetMonthID := int32(id)

	prev, err := h.queries.GetLatestBudgetMonthBefore(ctx, queries.GetLatestBudgetMonthBeforeParams{BudgetID: access.BudgetID, Month: month})
	if errors.Is(err, sql.ErrNoRows) {
		return newBudgetMonthID, nil
	} else if err != nil {
		return 0, fmt.Errorf("find previous budget month: %w", err)
	}

	if err := h.copyForward(ctx, prev.ID, newBudgetMonthID, month, access.UserID); err != nil {
		return 0, fmt.Errorf("copy forward previous month: %w", err)
	}

	return newBudgetMonthID, nil
}

// copyForward copies category groups and income items from one budget
// month to another. Copied income items are dated to the first of the new
// month, since the original received date no longer applies.
func (h *Handler) copyForward(ctx context.Context, fromBudgetMonthID, toBudgetMonthID int32, toMonth time.Time, startedByUserID string) error {
	groups, err := h.queries.ListCategoryGroupsByMonth(ctx, fromBudgetMonthID)
	if err != nil {
		return fmt.Errorf("list category groups: %w", err)
	}
	incomeItems, err := h.queries.ListIncomeItemsByMonth(ctx, fromBudgetMonthID)
	if err != nil {
		return fmt.Errorf("list income items: %w", err)
	}

	for _, g := range groups {
		if _, err := h.queries.CreateCategoryGroup(ctx, queries.CreateCategoryGroupParams{
			BudgetMonthID: toBudgetMonthID,
			Name:          g.Name,
			PlannedAmount: g.PlannedAmount,
			SortOrder:     g.SortOrder,
			Description:   g.Description,
		}); err != nil {
			return fmt.Errorf("copy category group: %w", err)
		}
	}

	for _, ii := range incomeItems {
		receivedAt := ii.ReceivedAt
		if receivedAt.Valid {
			receivedAt = sql.NullTime{Time: toMonth, Valid: true}
		}
		createdBy := ii.CreatedByUserID
		if !createdBy.Valid {
			createdBy = sql.NullString{String: startedByUserID, Valid: true}
		}
		if _, err := h.queries.CreateIncomeItem(ctx, queries.CreateIncomeItemParams{
			BudgetMonthID:   toBudgetMonthID,
			Name:            ii.Name,
			PlannedAmount:   ii.PlannedAmount,
			ReceivedAt:      receivedAt,
			SortOrder:       ii.SortOrder,
			CreatedByUserID: createdBy,
		}); err != nil {
			return fmt.Errorf("copy income item: %w", err)
		}
	}

	return nil
}
