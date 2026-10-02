// Package budgetadmin manages a budget itself, as opposed to what is in it:
// creating one or joining one with a friend code, who its members are, and the
// owner-and-member tools in settings (export everything as CSV, delete all the
// data).
package budgetadmin

import (
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"strconv"
	"time"

	"budget-app/apps/budget-api/internal/database"
	"budget-app/apps/budget-api/internal/identity"
	"budget-app/apps/budget-api/internal/membership"
	"budget-app/apps/budget-api/internal/queries"
	"budget-app/apps/budget-api/internal/ratelimit"
)

// Friend codes are 40 bits, which is plenty against guessing by hand but not
// against a script hammering the join endpoint, so each user gets a few wrong
// guesses per window before being turned away.
const (
	maxFailedJoins   = 10
	failedJoinWindow = time.Hour
)

// maxCodeAttempts bounds retries when a freshly generated friend code happens to
// collide with an existing one (about a one-in-a-trillion event, but cheap to
// handle).
const maxCodeAttempts = 5

type HandlerConfig struct {
	Queries *queries.Queries
	// DB is needed for the operations that must be atomic (creating a budget
	// with its owner as a member, deleting all of a budget's data).
	DB     *sql.DB
	Logger *slog.Logger
}

type Handler struct {
	queries *queries.Queries
	db      *sql.DB
	logger  *slog.Logger
	// badCodes counts each user's wrong friend codes, to slow down guessing.
	badCodes *ratelimit.Counter
}

func NewHandler(cfg HandlerConfig) (*Handler, error) {
	h := Handler{queries: cfg.Queries, db: cfg.DB, logger: cfg.Logger, badCodes: ratelimit.New(maxFailedJoins, failedJoinWindow)}
	if h.queries == nil {
		return nil, fmt.Errorf("queries cannot be nil")
	} else if h.db == nil {
		return nil, fmt.Errorf("db cannot be nil")
	} else if h.logger == nil {
		return nil, fmt.Errorf("logger cannot be nil")
	}
	return &h, nil
}

func writeError(w http.ResponseWriter, status int, message string) {
	membership.WriteError(w, status, message, "")
}

func writeJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}

func isDuplicateKey(err error) bool {
	return database.IsUniqueViolation(err)
}

type memberResponse struct {
	UserID    string    `json:"user_id"`
	FirstName string    `json:"first_name"`
	LastName  string    `json:"last_name"`
	Username  string    `json:"username"`
	IsOwner   bool      `json:"is_owner"`
	IsYou     bool      `json:"is_you"`
	JoinedAt  time.Time `json:"joined_at"`
}

type budgetResponse struct {
	ID int32 `json:"id"`
	// FriendCode is what someone enters to join, formatted "ABCD-EFGH". Any
	// member can see and share it; the owner can replace it or switch it off.
	// It is null while joining is switched off.
	FriendCode *string `json:"friend_code"`
	// IsOwner is whether the caller owns the budget.
	IsOwner bool             `json:"is_owner"`
	Members []memberResponse `json:"members"`
}

// buildBudgetResponse describes a budget from the point of view of a member.
func (h *Handler) buildBudgetResponse(r *http.Request, access membership.Access) (*budgetResponse, error) {
	ctx := r.Context()
	budget, err := h.queries.GetBudget(ctx, access.BudgetID)
	if err != nil {
		return nil, fmt.Errorf("load budget: %w", err)
	}
	rows, err := h.queries.ListBudgetMembers(ctx, access.BudgetID)
	if err != nil {
		return nil, fmt.Errorf("list members: %w", err)
	}

	members := make([]memberResponse, len(rows))
	for i, m := range rows {
		members[i] = memberResponse{
			UserID:    m.UserID,
			FirstName: m.FirstName,
			LastName:  m.LastName,
			Username:  m.Username,
			IsOwner:   m.UserID == budget.OwnerUserID,
			IsYou:     m.UserID == access.UserID,
			JoinedAt:  m.JoinedAt,
		}
	}
	resp := &budgetResponse{ID: budget.ID, IsOwner: access.IsOwner, Members: members}
	if budget.FriendCode.Valid {
		code := membership.FormatFriendCode(budget.FriendCode.String)
		resp.FriendCode = &code
	}
	return resp, nil
}

// requireNoBudget resolves the caller for the two endpoints that put someone
// into a budget, writing a 409 if they're already in one.
func (h *Handler) requireNoBudget(w http.ResponseWriter, r *http.Request) (userID string, ok bool) {
	userID = identity.UserID(r)
	if userID == "" {
		writeError(w, http.StatusUnauthorized, "sign in first")
		return "", false
	}
	_, err := membership.Lookup(r.Context(), h.queries, userID)
	switch {
	case err == nil:
		writeError(w, http.StatusConflict, "you're already in a budget")
		return "", false
	case errors.Is(err, membership.ErrNoBudget):
		return userID, true
	default:
		h.logger.ErrorContext(r.Context(), "failed to look up budget", "error", err, "user_id", userID)
		writeError(w, http.StatusInternalServerError, "failed to check your budget")
		return "", false
	}
}

// GetBudget describes the caller's budget: its friend code and its members.
//
// @Summary      Get my budget
// @Tags         budget-admin
// @Produce      json
// @Success      200 {object} budgetResponse
// @Failure      403 "no_budget: the caller hasn't created or joined a budget"
// @Router       /v1/budget [get]
func (h *Handler) GetBudget(w http.ResponseWriter, r *http.Request) {
	access, ok := membership.Require(w, r, h.queries, h.logger)
	if !ok {
		return
	}
	resp, err := h.buildBudgetResponse(r, access)
	if err != nil {
		h.logger.ErrorContext(r.Context(), "failed to build budget response", "error", err)
		writeError(w, http.StatusInternalServerError, "failed to load your budget")
		return
	}
	writeJSON(w, http.StatusOK, resp)
}

// CreateBudget starts a new budget with the caller as its owner and only member.
//
// @Summary      Create a budget
// @Tags         budget-admin
// @Produce      json
// @Success      201 {object} budgetResponse
// @Failure      409 "the caller is already in a budget"
// @Router       /v1/budget [post]
func (h *Handler) CreateBudget(w http.ResponseWriter, r *http.Request) {
	userID, ok := h.requireNoBudget(w, r)
	if !ok {
		return
	}
	ctx := r.Context()

	// A new budget has no friend code: nobody can join until the owner generates one.
	budgetID, err := h.insertBudget(r, userID)
	switch {
	case isDuplicateKey(err):
		// This user already owns or belongs to a budget: a concurrent request beat this one.
		writeError(w, http.StatusConflict, "you're already in a budget")
		return
	case err != nil:
		h.logger.ErrorContext(ctx, "failed to create budget", "error", err, "user_id", userID)
		writeError(w, http.StatusInternalServerError, "failed to create your budget")
		return
	}

	access := membership.Access{UserID: userID, BudgetID: budgetID, IsOwner: true}
	resp, err := h.buildBudgetResponse(r, access)
	if err != nil {
		h.logger.ErrorContext(ctx, "failed to build budget response", "error", err)
		writeError(w, http.StatusInternalServerError, "failed to load your budget")
		return
	}
	h.logger.InfoContext(ctx, "budget created", "budget_id", budgetID, "owner", userID)
	writeJSON(w, http.StatusCreated, resp)
}

// insertBudget creates the budget and its owner's membership in one transaction.
func (h *Handler) insertBudget(r *http.Request, userID string) (int32, error) {
	ctx := r.Context()
	tx, err := h.db.BeginTx(ctx, nil)
	if err != nil {
		return 0, fmt.Errorf("begin: %w", err)
	}
	defer func() { _ = tx.Rollback() }()
	q := h.queries.WithTx(tx)

	result, err := q.CreateBudget(ctx, userID)
	if err != nil {
		return 0, err
	}
	id, err := result.LastInsertId()
	if err != nil {
		return 0, fmt.Errorf("new budget id: %w", err)
	}
	if err := q.AddBudgetMember(ctx, queries.AddBudgetMemberParams{UserID: userID, BudgetID: int32(id)}); err != nil {
		return 0, err
	}
	if err := tx.Commit(); err != nil {
		return 0, fmt.Errorf("commit: %w", err)
	}
	return int32(id), nil
}

// isFriendCodeCollision reports whether a duplicate-key error was about the
// friend code (so drawing another code can help) rather than about the user
// already having a budget.
func isFriendCodeCollision(err error) bool {
	return database.IsUniqueViolation(err, "budgets.friend_code")
}

type joinRequest struct {
	FriendCode string `json:"friend_code"`
}

// JoinBudget adds the caller to the budget with the given friend code.
//
// @Summary      Join a budget with a friend code
// @Tags         budget-admin
// @Accept       json
// @Produce      json
// @Param        body body joinRequest true "Friend code"
// @Success      201 {object} budgetResponse
// @Failure      400
// @Failure      404 "no budget has that code"
// @Failure      409 "the caller is already in a budget"
// @Router       /v1/budget/join [post]
func (h *Handler) JoinBudget(w http.ResponseWriter, r *http.Request) {
	userID, ok := h.requireNoBudget(w, r)
	if !ok {
		return
	}
	if h.badCodes.Blocked(userID) {
		w.Header().Set("Retry-After", strconv.Itoa(int(failedJoinWindow.Seconds())))
		writeError(w, http.StatusTooManyRequests, "too many wrong friend codes; try again later")
		return
	}
	var req joinRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "friend_code is required")
		return
	}
	code, valid := membership.NormalizeFriendCode(req.FriendCode)
	if !valid {
		writeError(w, http.StatusBadRequest, "that doesn't look like a friend code (it's 8 letters and numbers, like ABCD-EFGH)")
		return
	}

	ctx := r.Context()
	budget, err := h.queries.GetBudgetByFriendCode(ctx, sql.NullString{String: code, Valid: true})
	if errors.Is(err, sql.ErrNoRows) {
		h.badCodes.Add(userID)
		writeError(w, http.StatusNotFound, "no budget has that friend code")
		return
	} else if err != nil {
		h.logger.ErrorContext(ctx, "failed to look up friend code", "error", err)
		writeError(w, http.StatusInternalServerError, "failed to join the budget")
		return
	}

	if err := h.queries.AddBudgetMember(ctx, queries.AddBudgetMemberParams{UserID: userID, BudgetID: budget.ID}); err != nil {
		if isDuplicateKey(err) {
			writeError(w, http.StatusConflict, "you're already in a budget")
			return
		}
		h.logger.ErrorContext(ctx, "failed to add budget member", "error", err, "user_id", userID)
		writeError(w, http.StatusInternalServerError, "failed to join the budget")
		return
	}

	access := membership.Access{UserID: userID, BudgetID: budget.ID, IsOwner: false}
	resp, err := h.buildBudgetResponse(r, access)
	if err != nil {
		h.logger.ErrorContext(ctx, "failed to build budget response", "error", err)
		writeError(w, http.StatusInternalServerError, "failed to load your budget")
		return
	}
	h.logger.InfoContext(ctx, "budget joined", "budget_id", budget.ID, "user_id", userID)
	writeJSON(w, http.StatusCreated, resp)
}

// RotateFriendCode generates a friend code for the budget, replacing the current
// one if there is one so the old one stops working. Removing a member doesn't do
// that on its own: they could rejoin with the code they already have.
//
// @Summary      Generate or replace the budget's friend code (owner only)
// @Tags         budget-admin
// @Produce      json
// @Success      200 {object} budgetResponse
// @Failure      403
// @Router       /v1/budget/friend-code [post]
func (h *Handler) RotateFriendCode(w http.ResponseWriter, r *http.Request) {
	access, ok := membership.Require(w, r, h.queries, h.logger)
	if !ok {
		return
	}
	if !access.IsOwner {
		writeError(w, http.StatusForbidden, "only the budget's owner can change its friend code")
		return
	}
	ctx := r.Context()

	for attempt := 1; ; attempt++ {
		code, err := membership.GenerateFriendCode()
		if err != nil {
			h.logger.ErrorContext(ctx, "failed to generate friend code", "error", err)
			writeError(w, http.StatusInternalServerError, "failed to change the friend code")
			return
		}
		err = h.queries.UpdateBudgetFriendCode(ctx, queries.UpdateBudgetFriendCodeParams{FriendCode: sql.NullString{String: code, Valid: true}, ID: access.BudgetID})
		if err == nil {
			break
		}
		if isFriendCodeCollision(err) && attempt < maxCodeAttempts {
			continue
		}
		h.logger.ErrorContext(ctx, "failed to update friend code", "error", err)
		writeError(w, http.StatusInternalServerError, "failed to change the friend code")
		return
	}

	resp, err := h.buildBudgetResponse(r, access)
	if err != nil {
		h.logger.ErrorContext(ctx, "failed to build budget response", "error", err)
		writeError(w, http.StatusInternalServerError, "failed to load your budget")
		return
	}
	writeJSON(w, http.StatusOK, resp)
}

// DisableFriendCode switches joining off by deleting the budget's friend code, so
// nobody can join until the owner generates a new one. Members already in the
// budget are unaffected. Doing it when there is no code is fine.
//
// @Summary      Delete the budget's friend code (owner only)
// @Tags         budget-admin
// @Produce      json
// @Success      200 {object} budgetResponse
// @Failure      403
// @Router       /v1/budget/friend-code [delete]
func (h *Handler) DisableFriendCode(w http.ResponseWriter, r *http.Request) {
	access, ok := membership.Require(w, r, h.queries, h.logger)
	if !ok {
		return
	}
	if !access.IsOwner {
		writeError(w, http.StatusForbidden, "only the budget's owner can change its friend code")
		return
	}
	ctx := r.Context()
	if err := h.queries.UpdateBudgetFriendCode(ctx, queries.UpdateBudgetFriendCodeParams{ID: access.BudgetID}); err != nil {
		h.logger.ErrorContext(ctx, "failed to delete friend code", "error", err)
		writeError(w, http.StatusInternalServerError, "failed to delete the friend code")
		return
	}
	h.logger.InfoContext(ctx, "friend code deleted", "budget_id", access.BudgetID, "by", access.UserID)
	resp, err := h.buildBudgetResponse(r, access)
	if err != nil {
		h.logger.ErrorContext(ctx, "failed to build budget response", "error", err)
		writeError(w, http.StatusInternalServerError, "failed to load your budget")
		return
	}
	writeJSON(w, http.StatusOK, resp)
}

// RemoveMember takes a member out of the budget. The owner can remove anyone
// else; a member can remove only themselves (leave). The owner can't leave, since
// the budget would have no owner. A removed person keeps their account and goes
// back to the create-or-join screen; what they entered stays in the budget.
//
// @Summary      Remove a member, or leave the budget
// @Tags         budget-admin
// @Param        user_id path string true "User ID of the member"
// @Success      204
// @Failure      400
// @Failure      403
// @Failure      404
// @Router       /v1/budget/members/{user_id} [delete]
func (h *Handler) RemoveMember(w http.ResponseWriter, r *http.Request) {
	access, ok := membership.Require(w, r, h.queries, h.logger)
	if !ok {
		return
	}
	target := r.PathValue("user_id")

	switch {
	case target == access.UserID && access.IsOwner:
		writeError(w, http.StatusBadRequest, "you own this budget, so you can't leave it")
		return
	case target != access.UserID && !access.IsOwner:
		writeError(w, http.StatusForbidden, "only the budget's owner can remove other people")
		return
	}

	ctx := r.Context()
	result, err := h.queries.RemoveBudgetMember(ctx, queries.RemoveBudgetMemberParams{UserID: target, BudgetID: access.BudgetID})
	if err != nil {
		h.logger.ErrorContext(ctx, "failed to remove budget member", "error", err, "target", target)
		writeError(w, http.StatusInternalServerError, "failed to remove that person")
		return
	}
	if affected, _ := result.RowsAffected(); affected == 0 {
		writeError(w, http.StatusNotFound, "that person isn't in this budget")
		return
	}
	h.logger.InfoContext(ctx, "budget member removed", "budget_id", access.BudgetID, "removed", target, "by", access.UserID)
	w.WriteHeader(http.StatusNoContent)
}

// DeleteAllData permanently deletes the budget: every month with its income,
// categories and expenses, the bank link with its account settings, all of its
// memberships, and the budget itself along with its friend code. Everyone who
// was in it, the owner included, is left without a budget and can create or join
// another; their accounts are untouched. Owner only.
//
// @Summary      Delete the budget and all of its data (owner only)
// @Tags         budget-admin
// @Success      204
// @Failure      403
// @Router       /v1/budget/data [delete]
func (h *Handler) DeleteAllData(w http.ResponseWriter, r *http.Request) {
	access, ok := membership.Require(w, r, h.queries, h.logger)
	if !ok {
		return
	}
	if !access.IsOwner {
		writeError(w, http.StatusForbidden, "only the budget's owner can delete its data")
		return
	}
	ctx := r.Context()

	tx, err := h.db.BeginTx(ctx, nil)
	if err != nil {
		h.logger.ErrorContext(ctx, "failed to begin transaction", "error", err)
		writeError(w, http.StatusInternalServerError, "failed to delete the data")
		return
	}
	defer func() { _ = tx.Rollback() }()
	q := h.queries.WithTx(tx)

	// Order matters: expenses point at categories, and everything at a month.
	steps := []struct {
		name string
		run  func() error
	}{
		{"expenses", func() error { return q.PurgeExpensesForBudget(ctx, access.BudgetID) }},
		{"income items", func() error { return q.PurgeIncomeItemsForBudget(ctx, access.BudgetID) }},
		{"category groups", func() error { return q.PurgeCategoryGroupsForBudget(ctx, access.BudgetID) }},
		{"budget months", func() error { return q.PurgeBudgetMonthsForBudget(ctx, access.BudgetID) }},
		{"bank connection", func() error { return q.PurgeBankConnectionForBudget(ctx, access.BudgetID) }},
		{"bank account settings", func() error { return q.PurgeBankAccountSettingsForBudget(ctx, access.BudgetID) }},
		{"memberships", func() error { return q.PurgeBudgetMembers(ctx, access.BudgetID) }},
		{"the budget", func() error { return q.DeleteBudget(ctx, access.BudgetID) }},
	}
	for _, step := range steps {
		if err := step.run(); err != nil {
			h.logger.ErrorContext(ctx, "failed to delete budget data", "error", err, "step", step.name, "budget_id", access.BudgetID)
			writeError(w, http.StatusInternalServerError, "failed to delete the data")
			return
		}
	}
	if err := tx.Commit(); err != nil {
		h.logger.ErrorContext(ctx, "failed to commit budget data deletion", "error", err, "budget_id", access.BudgetID)
		writeError(w, http.StatusInternalServerError, "failed to delete the data")
		return
	}
	h.logger.WarnContext(ctx, "budget deleted with all of its data", "budget_id", access.BudgetID, "by", access.UserID)
	w.WriteHeader(http.StatusNoContent)
}
