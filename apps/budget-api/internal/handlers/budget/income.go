package budget

import (
	"database/sql"
	"errors"
	"net/http"

	"budget-app/apps/budget-api/internal/membership"
	"budget-app/apps/budget-api/internal/queries"
)

type createIncomeItemRequest struct {
	Name          string  `json:"name"`
	PlannedAmount float64 `json:"planned_amount"`
	ReceivedAt    *string `json:"received_at"` // optional; null or blank means no date
	// ClientID is set by the app for an item entered offline, so that sending it
	// again (after a dropped connection) doesn't add it twice. Optional.
	ClientID *string `json:"client_id"`
}

// CreateIncomeItem adds an income line to a budget month.
//
// @Summary      Create income item
// @Tags         budget
// @Accept       json
// @Produce      json
// @Param        month path string true "Month, formatted YYYY-MM"
// @Param        income body createIncomeItemRequest true "Income item"
// @Success      201 {object} IncomeItemResponse
// @Success      200 {object} IncomeItemResponse "an item with this client_id was already saved"
// @Failure      400
// @Failure      404
// @Failure      409 "an item with this client_id was saved and has since been deleted"
// @Failure      500
// @Router       /v1/budget-month/{month}/income-item [post]
func (h *Handler) CreateIncomeItem(w http.ResponseWriter, r *http.Request) {
	access, ok := membership.Require(w, r, h.queries, h.logger)
	if !ok {
		return
	}
	month, err := parseMonth(r.PathValue("month"))
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	var req createIncomeItemRequest
	if err := decodeJSON(r, &req); err != nil || req.Name == "" {
		writeError(w, http.StatusBadRequest, "name is required")
		return
	}
	receivedAt, err := parseOptionalDate(req.ReceivedAt)
	if err != nil {
		writeError(w, http.StatusBadRequest, "received_at must be formatted as YYYY-MM-DD")
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

	clientID := sql.NullString{}
	if req.ClientID != nil && *req.ClientID != "" {
		if !validClientID(*req.ClientID) {
			writeError(w, http.StatusBadRequest, "client_id must be a UUID")
			return
		}
		clientID = sql.NullString{String: *req.ClientID, Valid: true}
		// A repeat of an item that already went through: return what was saved.
		saved, err := h.queries.GetIncomeItemByClientID(ctx, queries.GetIncomeItemByClientIDParams{BudgetMonthID: bm.ID, ClientID: clientID})
		if err == nil {
			createdBy, nameErr := h.queries.GetUserFirstName(ctx, access.UserID)
			amount, _ := parseAmount(saved.PlannedAmount)
			writeJSON(w, http.StatusOK, IncomeItemResponse{
				ID:            int64(saved.ID),
				Name:          saved.Name,
				PlannedAmount: amount,
				ReceivedAt:    formatOptionalDate(saved.ReceivedAt),
				SortOrder:     saved.SortOrder,
				Attribution:   attribution(sql.NullString{String: createdBy, Valid: nameErr == nil}, sql.NullString{}, sql.NullString{}),
			})
			return
		} else if !errors.Is(err, sql.ErrNoRows) {
			h.logger.ErrorContext(ctx, "failed to look up client id", "error", err)
			writeError(w, http.StatusInternalServerError, "failed to create income item")
			return
		}
	}

	existing, err := h.queries.ListIncomeItemsByMonth(ctx, bm.ID)
	if err != nil {
		h.logger.ErrorContext(ctx, "failed to list income items", "error", err)
		writeError(w, http.StatusInternalServerError, "failed to create income item")
		return
	}

	result, err := h.queries.CreateIncomeItem(ctx, queries.CreateIncomeItemParams{
		BudgetMonthID:   bm.ID,
		Name:            req.Name,
		PlannedAmount:   formatAmount(req.PlannedAmount),
		ReceivedAt:      receivedAt,
		SortOrder:       int32(len(existing)),
		CreatedByUserID: sql.NullString{String: access.UserID, Valid: true},
		ClientID:        clientID,
	})
	if err != nil && clientID.Valid && isDuplicateKey(err) {
		writeError(w, http.StatusConflict, "that income item was already saved and then deleted")
		return
	}
	if err != nil {
		h.logger.ErrorContext(ctx, "failed to create income item", "error", err)
		writeError(w, http.StatusInternalServerError, "failed to create income item")
		return
	}
	id, err := result.LastInsertId()
	if err != nil {
		h.logger.ErrorContext(ctx, "failed to get new income item id", "error", err)
		writeError(w, http.StatusInternalServerError, "failed to create income item")
		return
	}

	createdBy, err := h.queries.GetUserFirstName(ctx, access.UserID)
	if err != nil {
		h.logger.WarnContext(ctx, "failed to look up creator name", "error", err)
	}
	attr := attribution(sql.NullString{String: createdBy, Valid: err == nil}, sql.NullString{}, sql.NullString{})
	writeJSON(w, http.StatusCreated, IncomeItemResponse{
		ID:            id,
		Name:          req.Name,
		PlannedAmount: roundCents(req.PlannedAmount),
		ReceivedAt:    formatOptionalDate(receivedAt),
		SortOrder:     int32(len(existing)),
		Attribution:   attr,
	})
}

type updateIncomeItemRequest struct {
	Name          string  `json:"name"`
	PlannedAmount float64 `json:"planned_amount"`
	ReceivedAt    *string `json:"received_at"` // optional; null or blank means no date
	SortOrder     int32   `json:"sort_order"`
}

// UpdateIncomeItem updates an income item's name, amount, date, or sort order.
//
// @Summary      Update income item
// @Tags         budget
// @Accept       json
// @Produce      json
// @Param        id path int true "Income item ID"
// @Param        income body updateIncomeItemRequest true "Income item"
// @Success      200 {object} IncomeItemResponse
// @Failure      400
// @Failure      404
// @Failure      500
// @Router       /v1/income-item/{id} [patch]
func (h *Handler) UpdateIncomeItem(w http.ResponseWriter, r *http.Request) {
	access, ok := membership.Require(w, r, h.queries, h.logger)
	if !ok {
		return
	}
	id, ok := parsePathID(w, r)
	if !ok {
		return
	}
	var req updateIncomeItemRequest
	if err := decodeJSON(r, &req); err != nil || req.Name == "" {
		writeError(w, http.StatusBadRequest, "name is required")
		return
	}
	receivedAt, err := parseOptionalDate(req.ReceivedAt)
	if err != nil {
		writeError(w, http.StatusBadRequest, "received_at must be formatted as YYYY-MM-DD")
		return
	}

	ctx := r.Context()
	existing, err := h.queries.GetIncomeItem(ctx, queries.GetIncomeItemParams{ID: id, BudgetID: access.BudgetID})
	if errors.Is(err, sql.ErrNoRows) {
		writeError(w, http.StatusNotFound, "income item not found")
		return
	} else if err != nil {
		h.logger.ErrorContext(ctx, "failed to get income item", "error", err)
		writeError(w, http.StatusInternalServerError, "failed to update income item")
		return
	}

	if err := h.queries.UpdateIncomeItem(ctx, queries.UpdateIncomeItemParams{
		ID:            id,
		Name:          req.Name,
		PlannedAmount: formatAmount(req.PlannedAmount),
		ReceivedAt:    receivedAt,
		SortOrder:     req.SortOrder,
	}); err != nil {
		h.logger.ErrorContext(ctx, "failed to update income item", "error", err)
		writeError(w, http.StatusInternalServerError, "failed to update income item")
		return
	}

	attr := attribution(existing.CreatedByName, existing.ExternalID, existing.SourceAccountName)
	writeJSON(w, http.StatusOK, IncomeItemResponse{
		ID:            int64(id),
		Name:          req.Name,
		PlannedAmount: roundCents(req.PlannedAmount),
		ReceivedAt:    formatOptionalDate(receivedAt),
		SortOrder:     req.SortOrder,
		Attribution:   attr,
	})
}

// DeleteIncomeItem removes an income item from a budget month.
//
// @Summary      Delete income item
// @Param        id path int true "Income item ID"
// @Success      204
// @Failure      404
// @Failure      500
// @Router       /v1/income-item/{id} [delete]
func (h *Handler) DeleteIncomeItem(w http.ResponseWriter, r *http.Request) {
	access, ok := membership.Require(w, r, h.queries, h.logger)
	if !ok {
		return
	}
	id, ok := parsePathID(w, r)
	if !ok {
		return
	}

	ctx := r.Context()
	if _, err := h.queries.GetIncomeItem(ctx, queries.GetIncomeItemParams{ID: id, BudgetID: access.BudgetID}); errors.Is(err, sql.ErrNoRows) {
		writeError(w, http.StatusNotFound, "income item not found")
		return
	} else if err != nil {
		h.logger.ErrorContext(ctx, "failed to get income item", "error", err)
		writeError(w, http.StatusInternalServerError, "failed to delete income item")
		return
	}

	if err := h.queries.DeleteIncomeItem(ctx, id); err != nil {
		h.logger.ErrorContext(ctx, "failed to delete income item", "error", err)
		writeError(w, http.StatusInternalServerError, "failed to delete income item")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
