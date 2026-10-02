package budget

import (
	"database/sql"
	"errors"
	"net/http"
	"strings"
	"unicode/utf8"

	"budget-app/apps/budget-api/internal/membership"
	"budget-app/apps/budget-api/internal/queries"
)

// maxCategoryDescriptionLength matches the category_groups.description column.
const maxCategoryDescriptionLength = 500

// normalizeDescription trims a category description; blank means none.
func normalizeDescription(raw *string) (sql.NullString, error) {
	if raw == nil {
		return sql.NullString{}, nil
	}
	trimmed := strings.TrimSpace(*raw)
	if utf8.RuneCountInString(trimmed) > maxCategoryDescriptionLength {
		return sql.NullString{}, errors.New("description must be at most 500 characters")
	}
	return sql.NullString{String: trimmed, Valid: trimmed != ""}, nil
}

func descriptionPtr(d sql.NullString) *string {
	if !d.Valid {
		return nil
	}
	return &d.String
}

type categoryGroupResponseSlim struct {
	ID            int64   `json:"id"`
	Name          string  `json:"name"`
	PlannedAmount float64 `json:"planned_amount"`
	SortOrder     int32   `json:"sort_order"`
	// Description says what belongs in the category; the LLM that categorizes
	// expenses reads it.
	Description *string `json:"description"`
}

type createCategoryGroupRequest struct {
	Name          string  `json:"name"`
	PlannedAmount float64 `json:"planned_amount"`
	Description   *string `json:"description"`
}

// CreateCategoryGroup adds a category group (e.g. "Giving", "Housing") to a budget month.
//
// @Summary      Create category group
// @Tags         budget
// @Accept       json
// @Produce      json
// @Param        month path string true "Month, formatted YYYY-MM"
// @Param        group body createCategoryGroupRequest true "Category group"
// @Success      201 {object} categoryGroupResponseSlim
// @Failure      400
// @Failure      404
// @Failure      500
// @Router       /v1/budget-month/{month}/category-group [post]
func (h *Handler) CreateCategoryGroup(w http.ResponseWriter, r *http.Request) {
	access, ok := membership.Require(w, r, h.queries, h.logger)
	if !ok {
		return
	}
	month, err := parseMonth(r.PathValue("month"))
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	var req createCategoryGroupRequest
	if err := decodeJSON(r, &req); err != nil || req.Name == "" {
		writeError(w, http.StatusBadRequest, "name is required")
		return
	}

	description, err := normalizeDescription(req.Description)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	ctx := r.Context()
	bm, err := h.queries.GetBudgetMonth(ctx, queries.GetBudgetMonthParams{BudgetID: access.BudgetID, Month: month})
	if errors.Is(err, sql.ErrNoRows) {
		writeError(w, http.StatusNotFound, "budget month not found")
		return
	} else if err != nil {
		h.logger.ErrorContext(ctx, "failed to get budget month", "error", err)
		writeError(w, http.StatusInternalServerError, "failed to load budget month")
		return
	}

	existing, err := h.queries.ListCategoryGroupsByMonth(ctx, bm.ID)
	if err != nil {
		h.logger.ErrorContext(ctx, "failed to list category groups", "error", err)
		writeError(w, http.StatusInternalServerError, "failed to create category group")
		return
	}

	result, err := h.queries.CreateCategoryGroup(ctx, queries.CreateCategoryGroupParams{
		BudgetMonthID: bm.ID,
		Name:          req.Name,
		PlannedAmount: formatAmount(req.PlannedAmount),
		SortOrder:     int32(len(existing)),
		Description:   description,
	})
	if err != nil {
		h.logger.ErrorContext(ctx, "failed to create category group", "error", err)
		writeError(w, http.StatusInternalServerError, "failed to create category group")
		return
	}
	id, err := result.LastInsertId()
	if err != nil {
		h.logger.ErrorContext(ctx, "failed to get new category group id", "error", err)
		writeError(w, http.StatusInternalServerError, "failed to create category group")
		return
	}

	writeJSON(w, http.StatusCreated, categoryGroupResponseSlim{
		ID:            id,
		Name:          req.Name,
		PlannedAmount: roundCents(req.PlannedAmount),
		SortOrder:     int32(len(existing)),
		Description:   descriptionPtr(description),
	})
}

type updateCategoryGroupRequest struct {
	Name          string  `json:"name"`
	PlannedAmount float64 `json:"planned_amount"`
	SortOrder     int32   `json:"sort_order"`
	Description   *string `json:"description"`
}

// UpdateCategoryGroup renames, reorders, or updates the planned amount of a category group.
//
// @Summary      Update category group
// @Tags         budget
// @Accept       json
// @Produce      json
// @Param        id path int true "Category group ID"
// @Param        group body updateCategoryGroupRequest true "Category group"
// @Success      200 {object} categoryGroupResponseSlim
// @Failure      400
// @Failure      404
// @Failure      500
// @Router       /v1/category-group/{id} [patch]
func (h *Handler) UpdateCategoryGroup(w http.ResponseWriter, r *http.Request) {
	access, ok := membership.Require(w, r, h.queries, h.logger)
	if !ok {
		return
	}
	id, ok := parsePathID(w, r)
	if !ok {
		return
	}
	var req updateCategoryGroupRequest
	if err := decodeJSON(r, &req); err != nil || req.Name == "" {
		writeError(w, http.StatusBadRequest, "name is required")
		return
	}

	description, err := normalizeDescription(req.Description)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	ctx := r.Context()
	if _, err := h.queries.GetCategoryGroup(ctx, queries.GetCategoryGroupParams{ID: id, BudgetID: access.BudgetID}); errors.Is(err, sql.ErrNoRows) {
		writeError(w, http.StatusNotFound, "category group not found")
		return
	} else if err != nil {
		h.logger.ErrorContext(ctx, "failed to get category group", "error", err)
		writeError(w, http.StatusInternalServerError, "failed to update category group")
		return
	}

	if err := h.queries.UpdateCategoryGroup(ctx, queries.UpdateCategoryGroupParams{
		ID:            id,
		Name:          req.Name,
		PlannedAmount: formatAmount(req.PlannedAmount),
		SortOrder:     req.SortOrder,
		Description:   description,
	}); err != nil {
		h.logger.ErrorContext(ctx, "failed to update category group", "error", err)
		writeError(w, http.StatusInternalServerError, "failed to update category group")
		return
	}

	writeJSON(w, http.StatusOK, categoryGroupResponseSlim{
		ID:            int64(id),
		Name:          req.Name,
		PlannedAmount: roundCents(req.PlannedAmount),
		SortOrder:     req.SortOrder,
		Description:   descriptionPtr(description),
	})
}

// DeleteCategoryGroup removes a category group.
//
// @Summary      Delete category group
// @Param        id path int true "Category group ID"
// @Success      204
// @Failure      404
// @Failure      500
// @Router       /v1/category-group/{id} [delete]
func (h *Handler) DeleteCategoryGroup(w http.ResponseWriter, r *http.Request) {
	access, ok := membership.Require(w, r, h.queries, h.logger)
	if !ok {
		return
	}
	id, ok := parsePathID(w, r)
	if !ok {
		return
	}

	ctx := r.Context()
	if _, err := h.queries.GetCategoryGroup(ctx, queries.GetCategoryGroupParams{ID: id, BudgetID: access.BudgetID}); errors.Is(err, sql.ErrNoRows) {
		writeError(w, http.StatusNotFound, "category group not found")
		return
	} else if err != nil {
		h.logger.ErrorContext(ctx, "failed to get category group", "error", err)
		writeError(w, http.StatusInternalServerError, "failed to delete category group")
		return
	}

	if err := h.queries.DeleteCategoryGroup(ctx, id); err != nil {
		h.logger.ErrorContext(ctx, "failed to delete category group", "error", err)
		writeError(w, http.StatusInternalServerError, "failed to delete category group")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
