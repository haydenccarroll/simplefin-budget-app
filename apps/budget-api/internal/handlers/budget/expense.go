package budget

import (
	"database/sql"
	"errors"
	"net/http"
	"strconv"

	"budget-app/apps/budget-api/internal/membership"
	"budget-app/apps/budget-api/internal/queries"
)

const dateLayout = "2006-01-02"

func expenseResponse(id int64, categoryGroupID sql.NullInt32, description, amount string, transactedAt sql.NullTime, note, createdByName, externalID, sourceAccount, categoryName sql.NullString, autoCategorized bool) ExpenseResponse {
	resp := ExpenseResponse{
		ID:           id,
		Description:  description,
		TransactedAt: formatOptionalDate(transactedAt),
	}
	resp.Attribution = attribution(createdByName, externalID, sourceAccount)
	resp.AutoCategorized = autoCategorized
	if categoryName.Valid {
		resp.CategoryName = &categoryName.String
	}
	amt, _ := parseAmount(amount)
	resp.Amount = amt
	if categoryGroupID.Valid {
		v := int64(categoryGroupID.Int32)
		resp.CategoryGroupID = &v
	}
	if note.Valid {
		resp.Note = &note.String
	}
	return resp
}

type paginatedExpenses struct {
	Data       []ExpenseResponse `json:"data"`
	Page       int               `json:"page"`
	PageSize   int               `json:"page_size"`
	TotalCount int64             `json:"total_count"`
	TotalPages int               `json:"total_pages"`
}

// ListExpenses returns paginated expenses for a budget month, most recent first.
//
// @Summary      List expenses
// @Tags         budget
// @Produce      json
// @Param        month path string true "Month, formatted YYYY-MM"
// @Param        page query int false "Page number" default(1)
// @Param        page_size query int false "Page size" default(20)
// @Success      200 {object} paginatedExpenses
// @Failure      404
// @Failure      500
// @Router       /v1/budget-month/{month}/expenses [get]
func (h *Handler) ListExpenses(w http.ResponseWriter, r *http.Request) {
	access, ok := membership.Require(w, r, h.queries, h.logger)
	if !ok {
		return
	}
	month, err := parseMonth(r.PathValue("month"))
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	page, _ := strconv.Atoi(r.URL.Query().Get("page"))
	if page < 1 {
		page = 1
	}
	pageSize, _ := strconv.Atoi(r.URL.Query().Get("page_size"))
	if pageSize < 1 || pageSize > 100 {
		pageSize = 20
	}

	ctx := r.Context()
	bm, err := h.queries.GetBudgetMonth(ctx, queries.GetBudgetMonthParams{BudgetID: access.BudgetID, Month: month})
	if errors.Is(err, sql.ErrNoRows) {
		writeError(w, http.StatusNotFound, "budget month not found")
		return
	} else if err != nil {
		h.logger.ErrorContext(ctx, "failed to get budget month", "error", err)
		writeError(w, http.StatusInternalServerError, "failed to list expenses")
		return
	}

	totalCount, err := h.queries.CountExpensesByMonth(ctx, bm.ID)
	if err != nil {
		h.logger.ErrorContext(ctx, "failed to count expenses", "error", err)
		writeError(w, http.StatusInternalServerError, "failed to list expenses")
		return
	}

	rows, err := h.queries.ListExpensesByMonth(ctx, queries.ListExpensesByMonthParams{
		BudgetMonthID: bm.ID,
		Limit:         int64(pageSize),
		Offset:        int64((page - 1) * pageSize),
	})
	if err != nil {
		h.logger.ErrorContext(ctx, "failed to list expenses", "error", err)
		writeError(w, http.StatusInternalServerError, "failed to list expenses")
		return
	}

	data := make([]ExpenseResponse, len(rows))
	for i, e := range rows {
		data[i] = expenseResponse(int64(e.ID), e.CategoryGroupID, e.Description, e.Amount, e.TransactedAt, e.Note, e.CreatedByName, e.ExternalID, e.SourceAccountName, e.CategoryName, e.AutoCategorized)
	}

	writeJSON(w, http.StatusOK, paginatedExpenses{
		Data:       data,
		Page:       page,
		PageSize:   pageSize,
		TotalCount: totalCount,
		TotalPages: int((totalCount + int64(pageSize) - 1) / int64(pageSize)),
	})
}

type createExpenseRequest struct {
	CategoryGroupID *int64  `json:"category_group_id"`
	Description     string  `json:"description"`
	Amount          float64 `json:"amount"`
	TransactedAt    *string `json:"transacted_at"` // optional; null or blank means no date
	Note            *string `json:"note"`
	// ClientID is set by the app for an expense entered offline, so that sending it
	// again (after a dropped connection) doesn't add it twice. Optional.
	ClientID *string `json:"client_id"`
}

// CreateExpense logs a real expense against a budget month, optionally assigned to a category group.
// An expense created without a category group is queued to be categorized automatically.
//
// @Summary      Create expense
// @Tags         budget
// @Accept       json
// @Produce      json
// @Param        month path string true "Month, formatted YYYY-MM"
// @Param        expense body createExpenseRequest true "Expense"
// @Success      201 {object} ExpenseResponse
// @Success      200 {object} ExpenseResponse "an expense with this client_id was already saved"
// @Failure      400
// @Failure      404
// @Failure      409 "an expense with this client_id was saved and has since been deleted"
// @Failure      500
// @Router       /v1/budget-month/{month}/expense [post]
func (h *Handler) CreateExpense(w http.ResponseWriter, r *http.Request) {
	access, ok := membership.Require(w, r, h.queries, h.logger)
	if !ok {
		return
	}
	month, err := parseMonth(r.PathValue("month"))
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	var req createExpenseRequest
	if err := decodeJSON(r, &req); err != nil || req.Description == "" {
		writeError(w, http.StatusBadRequest, "description is required")
		return
	}
	transactedAt, err := parseOptionalDate(req.TransactedAt)
	if err != nil {
		writeError(w, http.StatusBadRequest, "transacted_at must be formatted as YYYY-MM-DD")
		return
	}

	ctx := r.Context()
	bm, err := h.queries.GetBudgetMonth(ctx, queries.GetBudgetMonthParams{BudgetID: access.BudgetID, Month: month})
	if errors.Is(err, sql.ErrNoRows) {
		writeError(w, http.StatusNotFound, "budget month not found")
		return
	} else if err != nil {
		h.logger.ErrorContext(ctx, "failed to get budget month", "error", err)
		writeError(w, http.StatusInternalServerError, "failed to create expense")
		return
	}

	clientID := sql.NullString{}
	if req.ClientID != nil && *req.ClientID != "" {
		if !validClientID(*req.ClientID) {
			writeError(w, http.StatusBadRequest, "client_id must be a UUID")
			return
		}
		clientID = sql.NullString{String: *req.ClientID, Valid: true}
		// A repeat of an entry that already went through: return what was saved.
		if existingID, err := h.queries.GetExpenseIDByClientID(ctx, queries.GetExpenseIDByClientIDParams{BudgetMonthID: bm.ID, ClientID: clientID}); err == nil {
			e, err := h.queries.GetExpenseInBudget(ctx, queries.GetExpenseInBudgetParams{ID: existingID, BudgetID: access.BudgetID})
			if err == nil {
				writeJSON(w, http.StatusOK, expenseResponse(int64(e.ID), e.CategoryGroupID, e.Description, e.Amount, e.TransactedAt, e.Note, e.CreatedByName, e.ExternalID, e.SourceAccountName, e.CategoryName, e.AutoCategorized))
				return
			}
		} else if !errors.Is(err, sql.ErrNoRows) {
			h.logger.ErrorContext(ctx, "failed to look up client id", "error", err)
			writeError(w, http.StatusInternalServerError, "failed to create expense")
			return
		}
	}

	// A category belongs to one month, and so must the expense filed under it.
	categoryGroupID := sql.NullInt32{}
	categoryName := sql.NullString{}
	if req.CategoryGroupID != nil {
		group, err := h.queries.GetCategoryGroup(ctx, queries.GetCategoryGroupParams{ID: int32(*req.CategoryGroupID), BudgetID: access.BudgetID})
		if errors.Is(err, sql.ErrNoRows) || (err == nil && group.BudgetMonthID != bm.ID) {
			writeError(w, http.StatusNotFound, "category group not found")
			return
		} else if err != nil {
			h.logger.ErrorContext(ctx, "failed to get category group", "error", err)
			writeError(w, http.StatusInternalServerError, "failed to create expense")
			return
		}
		categoryGroupID = sql.NullInt32{Int32: int32(*req.CategoryGroupID), Valid: true}
		categoryName = sql.NullString{String: group.Name, Valid: true}
	}

	note := sql.NullString{}
	if req.Note != nil {
		note = sql.NullString{String: *req.Note, Valid: true}
	}

	result, err := h.queries.CreateExpense(ctx, queries.CreateExpenseParams{
		BudgetMonthID:   bm.ID,
		CategoryGroupID: categoryGroupID,
		Description:     req.Description,
		Amount:          formatAmount(req.Amount),
		TransactedAt:    transactedAt,
		Note:            note,
		CreatedByUserID: sql.NullString{String: access.UserID, Valid: true},
		ClientID:        clientID,
	})
	if err != nil && clientID.Valid && isDuplicateKey(err) {
		writeError(w, http.StatusConflict, "that expense was already saved and then deleted")
		return
	}
	if err != nil {
		h.logger.ErrorContext(ctx, "failed to create expense", "error", err)
		writeError(w, http.StatusInternalServerError, "failed to create expense")
		return
	}
	id, err := result.LastInsertId()
	if err != nil {
		h.logger.ErrorContext(ctx, "failed to get new expense id", "error", err)
		writeError(w, http.StatusInternalServerError, "failed to create expense")
		return
	}

	// An expense with no category is sorted into one automatically, in the background.
	// The expense is saved either way, so a queueing failure only costs the automatic jar.
	if !categoryGroupID.Valid && h.classifier.Enabled() {
		if _, err := h.classifier.Enqueue(ctx, []int32{int32(id)}); err != nil {
			h.logger.WarnContext(ctx, "failed to queue categorization", "error", err, "expense_id", id)
		}
	}

	firstName, err := h.queries.GetUserFirstName(ctx, access.UserID)
	if err != nil {
		h.logger.WarnContext(ctx, "failed to look up creator name", "error", err)
	}
	writeJSON(w, http.StatusCreated, expenseResponse(id, categoryGroupID, req.Description, formatAmount(req.Amount), transactedAt, note, sql.NullString{String: firstName, Valid: err == nil}, sql.NullString{}, sql.NullString{}, categoryName, false))
}

type updateExpenseRequest struct {
	CategoryGroupID *int64  `json:"category_group_id"`
	Description     string  `json:"description"`
	Amount          float64 `json:"amount"`
	TransactedAt    *string `json:"transacted_at"` // optional; null or blank means no date
	Note            *string `json:"note"`
}

// UpdateExpense updates an expense's description, amount, date, note, or category group assignment.
//
// @Summary      Update expense
// @Tags         budget
// @Accept       json
// @Produce      json
// @Param        id path int true "Expense ID"
// @Param        expense body updateExpenseRequest true "Expense"
// @Success      200 {object} ExpenseResponse
// @Failure      400
// @Failure      404
// @Failure      500
// @Router       /v1/expense/{id} [patch]
func (h *Handler) UpdateExpense(w http.ResponseWriter, r *http.Request) {
	access, ok := membership.Require(w, r, h.queries, h.logger)
	if !ok {
		return
	}
	id, ok := parsePathID(w, r)
	if !ok {
		return
	}
	var req updateExpenseRequest
	if err := decodeJSON(r, &req); err != nil || req.Description == "" {
		writeError(w, http.StatusBadRequest, "description is required")
		return
	}
	transactedAt, err := parseOptionalDate(req.TransactedAt)
	if err != nil {
		writeError(w, http.StatusBadRequest, "transacted_at must be formatted as YYYY-MM-DD")
		return
	}

	ctx := r.Context()
	existing, err := h.queries.GetExpenseInBudget(ctx, queries.GetExpenseInBudgetParams{ID: id, BudgetID: access.BudgetID})
	if errors.Is(err, sql.ErrNoRows) {
		writeError(w, http.StatusNotFound, "expense not found")
		return
	} else if err != nil {
		h.logger.ErrorContext(ctx, "failed to get expense", "error", err)
		writeError(w, http.StatusInternalServerError, "failed to update expense")
		return
	}

	categoryGroupID := sql.NullInt32{}
	categoryName := sql.NullString{}
	if req.CategoryGroupID != nil {
		group, err := h.queries.GetCategoryGroup(ctx, queries.GetCategoryGroupParams{ID: int32(*req.CategoryGroupID), BudgetID: access.BudgetID})
		if errors.Is(err, sql.ErrNoRows) || (err == nil && group.BudgetMonthID != existing.BudgetMonthID) {
			writeError(w, http.StatusNotFound, "category group not found")
			return
		} else if err != nil {
			h.logger.ErrorContext(ctx, "failed to get category group", "error", err)
			writeError(w, http.StatusInternalServerError, "failed to update expense")
			return
		}
		categoryGroupID = sql.NullInt32{Int32: int32(*req.CategoryGroupID), Valid: true}
		categoryName = sql.NullString{String: group.Name, Valid: true}
	}

	note := sql.NullString{}
	if req.Note != nil {
		note = sql.NullString{String: *req.Note, Valid: true}
	}

	if err := h.queries.UpdateExpense(ctx, queries.UpdateExpenseParams{
		ID:              id,
		CategoryGroupID: categoryGroupID,
		Description:     req.Description,
		Amount:          formatAmount(req.Amount),
		TransactedAt:    transactedAt,
		Note:            note,
	}); err != nil {
		h.logger.ErrorContext(ctx, "failed to update expense", "error", err)
		writeError(w, http.StatusInternalServerError, "failed to update expense")
		return
	}

	writeJSON(w, http.StatusOK, expenseResponse(int64(id), categoryGroupID, req.Description, formatAmount(req.Amount), transactedAt, note, existing.CreatedByName, existing.ExternalID, existing.SourceAccountName, categoryName,
		false)) // saving confirms the category, so it is no longer automatic
}

// DeleteExpense removes an expense.
//
// @Summary      Delete expense
// @Param        id path int true "Expense ID"
// @Success      204
// @Failure      404
// @Failure      500
// @Router       /v1/expense/{id} [delete]
func (h *Handler) DeleteExpense(w http.ResponseWriter, r *http.Request) {
	access, ok := membership.Require(w, r, h.queries, h.logger)
	if !ok {
		return
	}
	id, ok := parsePathID(w, r)
	if !ok {
		return
	}

	ctx := r.Context()
	if _, err := h.queries.GetExpenseInBudget(ctx, queries.GetExpenseInBudgetParams{ID: id, BudgetID: access.BudgetID}); errors.Is(err, sql.ErrNoRows) {
		writeError(w, http.StatusNotFound, "expense not found")
		return
	} else if err != nil {
		h.logger.ErrorContext(ctx, "failed to get expense", "error", err)
		writeError(w, http.StatusInternalServerError, "failed to delete expense")
		return
	}

	if err := h.queries.DeleteExpense(ctx, id); err != nil {
		h.logger.ErrorContext(ctx, "failed to delete expense", "error", err)
		writeError(w, http.StatusInternalServerError, "failed to delete expense")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
