package auth

import (
	"encoding/json"
	"net/http"

	"budget-app/apps/budget-api/internal/identity"
)

type errorBody struct {
	Error string `json:"error"`
	Code  string `json:"code,omitempty"`
}

// WriteError writes the API's standard JSON error body.
func WriteError(w http.ResponseWriter, status int, message string) {
	WriteErrorCode(w, status, message, "")
}

// WriteErrorCode is WriteError with a machine-readable code alongside.
func WriteErrorCode(w http.ResponseWriter, status int, message, code string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(errorBody{Error: message, Code: code})
}

// RequireUser returns the authenticated caller, or writes a 401 and returns
// false.
func RequireUser(w http.ResponseWriter, r *http.Request) (string, bool) {
	userID := identity.UserID(r)
	if userID == "" {
		WriteError(w, http.StatusUnauthorized, "sign in first")
		return "", false
	}
	return userID, true
}
