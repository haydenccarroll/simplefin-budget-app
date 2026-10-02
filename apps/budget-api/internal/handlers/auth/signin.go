package auth

import (
	"database/sql"
	"errors"
	"net/http"
	"strings"

	"github.com/google/uuid"

	"budget-app/apps/budget-api/internal/auth"
	"budget-app/apps/budget-api/internal/queries"
)

type registerRequest struct {
	Username  string `json:"username"`
	Password  string `json:"password"`
	FirstName string `json:"first_name"`
	LastName  string `json:"last_name"`
	Timezone  string `json:"timezone"`
}

// Register creates an account and signs it in.
//
// @Summary      Sign up
// @Tags         auth
// @Accept       json
// @Produce      json
// @Param        X-Session-Mode header string false "Send 'token' to get the session token in the body (native apps)"
// @Param        account body registerRequest true "New account"
// @Success      201 {object} sessionResponse
// @Failure      400
// @Failure      409
// @Failure      429
// @Router       /v1/auth/register [post]
func (h *Handler) Register(w http.ResponseWriter, r *http.Request) {
	ip := h.clientIP(r)
	if h.registerByIP.Blocked(ip) {
		tooMany(w, h.registerByIP)
		return
	}
	h.registerByIP.Add(ip)

	var req registerRequest
	if err := decode(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "that request doesn't look right")
		return
	}
	username, ok := normalizeUsername(req.Username)
	if !ok {
		writeError(w, http.StatusBadRequest, usernameRules)
		return
	}
	if err := auth.CheckPasswordPolicy(req.Password); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	first, ok1 := cleanName(req.FirstName)
	last, ok2 := cleanName(req.LastName)
	if !ok1 || !ok2 {
		writeError(w, http.StatusBadRequest, "names can be at most 100 characters")
		return
	}
	timezone, ok := cleanTimezone(req.Timezone)
	if !ok {
		writeError(w, http.StatusBadRequest, "that timezone isn't recognized")
		return
	}

	ctx := r.Context()
	hash, err := auth.HashPassword(req.Password)
	if err != nil {
		h.Logger.ErrorContext(ctx, "failed to hash password", "error", err)
		writeError(w, http.StatusInternalServerError, "failed to create your account")
		return
	}
	user := userResponse{ID: uuid.NewString(), Username: username, FirstName: first, LastName: last, Timezone: timezone}
	err = h.Queries.CreateUser(ctx, queries.CreateUserParams{
		ID: user.ID, Username: username, PasswordHash: hash, FirstName: first, LastName: last, Timezone: timezone,
	})
	if isDuplicateKey(err) {
		writeError(w, http.StatusConflict, "that username is taken")
		return
	} else if err != nil {
		h.Logger.ErrorContext(ctx, "failed to create user", "error", err)
		writeError(w, http.StatusInternalServerError, "failed to create your account")
		return
	}
	h.Logger.InfoContext(ctx, "user registered", "user_id", user.ID)
	h.startSession(w, r, http.StatusCreated, user)
}

type loginRequest struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

// Login checks a username and password and signs the caller in.
//
// @Summary      Sign in
// @Tags         auth
// @Accept       json
// @Produce      json
// @Param        X-Session-Mode header string false "Send 'token' to get the session token in the body (native apps)"
// @Param        credentials body loginRequest true "Username and password"
// @Success      200 {object} sessionResponse
// @Failure      401
// @Failure      429
// @Router       /v1/auth/login [post]
func (h *Handler) Login(w http.ResponseWriter, r *http.Request) {
	var req loginRequest
	if err := decode(r, &req); err != nil || req.Username == "" || req.Password == "" {
		writeError(w, http.StatusBadRequest, "username and password are required")
		return
	}
	// Not a valid username means no account has it; it is still counted below.
	username := strings.ToLower(strings.TrimSpace(req.Username))
	ip := h.clientIP(r)
	if h.loginByUsername.Blocked(username) {
		tooMany(w, h.loginByUsername)
		return
	}
	if h.loginByIP.Blocked(ip) {
		tooMany(w, h.loginByIP)
		return
	}

	ctx := r.Context()
	const wrong = "wrong username or password"
	user, err := h.Queries.GetUserByUsername(ctx, username)
	if errors.Is(err, sql.ErrNoRows) {
		// Take as long as a real check would, so timing doesn't say which usernames exist.
		auth.BurnPasswordCheck(req.Password)
		h.loginByUsername.Add(username)
		h.loginByIP.Add(ip)
		writeError(w, http.StatusUnauthorized, wrong)
		return
	} else if err != nil {
		h.Logger.ErrorContext(ctx, "failed to look up user", "error", err)
		writeError(w, http.StatusInternalServerError, "failed to sign you in")
		return
	}
	if err := auth.VerifyPassword(req.Password, user.PasswordHash); err != nil {
		h.loginByUsername.Add(username)
		h.loginByIP.Add(ip)
		writeError(w, http.StatusUnauthorized, wrong)
		return
	}
	h.loginByUsername.Reset(username)
	h.startSession(w, r, http.StatusOK, toUserResponse(queries.GetUserByIDRow(user)))
}

// Logout ends the current session. It is fine to call without one.
//
// @Summary      Sign out
// @Tags         auth
// @Success      204
// @Router       /v1/auth/logout [post]
func (h *Handler) Logout(w http.ResponseWriter, r *http.Request) {
	if token := auth.SessionToken(r); token != "" {
		if err := h.Queries.DeleteSession(r.Context(), auth.HashToken(token)); err != nil {
			h.Logger.ErrorContext(r.Context(), "failed to delete session", "error", err)
			writeError(w, http.StatusInternalServerError, "failed to sign you out")
			return
		}
	}
	auth.ClearSessionCookie(w, h.CookieSecure)
	w.WriteHeader(http.StatusNoContent)
}
