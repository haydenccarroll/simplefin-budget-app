// Package membership answers "which budget is this caller in, and do they own
// it?" for every handler that reads or writes budget data, and holds the
// friend-code helpers used to join a budget.
package membership

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"strings"

	"budget-app/apps/budget-api/internal/identity"
	"budget-app/apps/budget-api/internal/queries"
)

// ErrNoBudget means the user hasn't created or joined a budget yet (or was
// removed from theirs).
var ErrNoBudget = errors.New("not in a budget")

// CodeNoBudget is the machine-readable code returned alongside a 403 when the
// caller has no budget, so the app can send them to the create-or-join screen.
const CodeNoBudget = "no_budget"

// Access is the budget a caller belongs to.
type Access struct {
	UserID   string
	BudgetID int32
	IsOwner  bool
}

// Lookup finds the caller's budget, returning ErrNoBudget if they have none.
func Lookup(ctx context.Context, q *queries.Queries, userID string) (Access, error) {
	row, err := q.GetMembership(ctx, userID)
	if errors.Is(err, sql.ErrNoRows) {
		return Access{}, ErrNoBudget
	} else if err != nil {
		return Access{}, fmt.Errorf("look up budget membership: %w", err)
	}
	return Access{UserID: userID, BudgetID: row.BudgetID, IsOwner: row.OwnerUserID == userID}, nil
}

type errorBody struct {
	Error string `json:"error"`
	Code  string `json:"code,omitempty"`
}

// WriteError writes the API's standard JSON error body with an optional code.
func WriteError(w http.ResponseWriter, status int, message, code string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(errorBody{Error: message, Code: code})
}

// Require resolves the caller's budget for a request. When it returns false a
// response has already been written: 401 with no user, 403 (code "no_budget")
// with no budget, 500 if the lookup failed.
func Require(w http.ResponseWriter, r *http.Request, q *queries.Queries, logger *slog.Logger) (Access, bool) {
	userID := identity.UserID(r)
	if userID == "" {
		WriteError(w, http.StatusUnauthorized, "sign in first", "")
		return Access{}, false
	}
	access, err := Lookup(r.Context(), q, userID)
	if errors.Is(err, ErrNoBudget) {
		WriteError(w, http.StatusForbidden, "you're not in a budget yet: create one or join with a friend code", CodeNoBudget)
		return Access{}, false
	} else if err != nil {
		logger.ErrorContext(r.Context(), "failed to look up budget", "error", err, "user_id", userID)
		WriteError(w, http.StatusInternalServerError, "failed to load your budget", "")
		return Access{}, false
	}
	return access, true
}

// Friend codes are 8 characters from an alphabet without the look-alikes
// (0/O, 1/I), shown as "ABCD-EFGH"
const (
	codeAlphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
	CodeLength   = 8
)

// GenerateFriendCode returns a new random code (unformatted, 8 characters).
func GenerateFriendCode() (string, error) {
	raw := make([]byte, CodeLength)
	if _, err := rand.Read(raw); err != nil {
		return "", fmt.Errorf("generate friend code: %w", err)
	}
	code := make([]byte, CodeLength)
	for i, b := range raw {
		// 256 is a multiple of 32, so this has no modulo bias.
		code[i] = codeAlphabet[int(b)%len(codeAlphabet)]
	}
	return string(code), nil
}

// NormalizeFriendCode turns whatever a person typed ("abcd-efgh", " ABCD EFGH")
// into the stored form, reporting false if it can't be a code.
func NormalizeFriendCode(input string) (string, bool) {
	var b strings.Builder
	for _, r := range strings.ToUpper(input) {
		switch {
		case r >= 'A' && r <= 'Z', r >= '0' && r <= '9':
			b.WriteRune(r)
		case r == '-' || r == ' ':
			// separators are ignored
		default:
			return "", false
		}
	}
	if b.Len() != CodeLength {
		return "", false
	}
	return b.String(), true
}

// FormatFriendCode inserts the dash for display: "ABCDEFGH" -> "ABCD-EFGH".
func FormatFriendCode(code string) string {
	if len(code) != CodeLength {
		return code
	}
	return code[:4] + "-" + code[4:]
}
