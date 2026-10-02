// Package auth serves sign-up, sign-in, sign-out and the account's own settings
// (name, username, timezone, password). Accounts have a username and no email,
// so there is nothing to send a forgotten password to: it can't be recovered. Sessions work for
// both kinds of client: a browser gets an HttpOnly cookie, a native app asks
// for the token in the response body (header X-Session-Mode: token) and sends
// it back as a bearer token. See internal/auth for the middleware that
// recognizes both.
package auth

import (
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net"
	"net/http"
	"regexp"
	"strings"
	"time"
	"unicode/utf8"

	"budget-app/apps/budget-api/internal/auth"
	"budget-app/apps/budget-api/internal/database"
	"budget-app/apps/budget-api/internal/queries"
	"budget-app/apps/budget-api/internal/ratelimit"
)

const (
	maxNameLength = 100
)

type HandlerConfig struct {
	Queries *queries.Queries
	// DB is for the changes that must be all-or-nothing (resetting a password).
	DB     *sql.DB
	Logger *slog.Logger
	// SessionLifetime is how long a sign-in lasts.
	SessionLifetime time.Duration
	// CookieSecure marks the session cookie Secure; set it whenever the API is
	// served over HTTPS.
	CookieSecure bool
	// TrustProxyHeaders makes rate limiting use X-Forwarded-For (the last hop)
	// instead of the connection's address. Only set it behind a reverse proxy
	// that sets that header, or clients could pick their own address.
	TrustProxyHeaders bool
}

type Handler struct {
	HandlerConfig

	loginByUsername *ratelimit.Counter // wrong passwords per username
	loginByIP       *ratelimit.Counter // wrong passwords per address
	reauthByUser    *ratelimit.Counter // wrong current passwords per signed-in user
	registerByIP    *ratelimit.Counter // sign-ups per address
}

func NewHandler(cfg HandlerConfig) (*Handler, error) {
	if cfg.Queries == nil {
		return nil, fmt.Errorf("queries cannot be nil")
	} else if cfg.DB == nil {
		return nil, fmt.Errorf("db cannot be nil")
	} else if cfg.Logger == nil {
		return nil, fmt.Errorf("logger cannot be nil")
	}
	if cfg.SessionLifetime <= 0 {
		cfg.SessionLifetime = 30 * 24 * time.Hour
	}
	return &Handler{
		HandlerConfig:   cfg,
		loginByUsername: ratelimit.New(10, 15*time.Minute),
		loginByIP:       ratelimit.New(30, 15*time.Minute),
		reauthByUser:    ratelimit.New(10, 15*time.Minute),
		registerByIP:    ratelimit.New(20, time.Hour),
	}, nil
}

func writeError(w http.ResponseWriter, status int, message string) {
	auth.WriteError(w, status, message)
}

func writeJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}

func decode(r *http.Request, dst any) error {
	defer func() { _ = r.Body.Close() }()
	return json.NewDecoder(r.Body).Decode(dst)
}

func tooMany(w http.ResponseWriter, c *ratelimit.Counter) {
	w.Header().Set("Retry-After", fmt.Sprintf("%d", int(c.Window().Seconds())))
	writeError(w, http.StatusTooManyRequests, "too many tries; wait a while and try again")
}

func isDuplicateKey(err error) bool {
	return database.IsUniqueViolation(err)
}

// clientIP is the address to rate limit a request by.
func (h *Handler) clientIP(r *http.Request) string {
	if h.TrustProxyHeaders {
		if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
			parts := strings.Split(xff, ",")
			return strings.TrimSpace(parts[len(parts)-1])
		}
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}

// usernameRE: 3 to 30 characters, starting with a letter or digit, then letters,
// digits, dots, dashes and underscores. Usernames are lowercase.
var usernameRE = regexp.MustCompile(`^[a-z0-9][a-z0-9._-]{2,29}$`)

// normalizeUsername lowercases and validates a username.
func normalizeUsername(raw string) (string, bool) {
	username := strings.ToLower(strings.TrimSpace(raw))
	return username, usernameRE.MatchString(username)
}

const usernameRules = "usernames are 3 to 30 letters, numbers, dots, dashes or underscores"

// cleanName trims a name and checks its length.
func cleanName(raw string) (string, bool) {
	name := strings.TrimSpace(raw)
	return name, utf8.RuneCountInString(name) <= maxNameLength
}

// cleanTimezone checks that a timezone is a real IANA name. Blank means the default.
func cleanTimezone(raw string) (string, bool) {
	tz := strings.TrimSpace(raw)
	if tz == "" {
		return "America/Los_Angeles", true
	}
	if len(tz) > 50 {
		return "", false
	}
	_, err := time.LoadLocation(tz)
	return tz, err == nil
}

type userResponse struct {
	ID        string `json:"id"`
	Username  string `json:"username"`
	FirstName string `json:"first_name"`
	LastName  string `json:"last_name"`
	Timezone  string `json:"timezone"`
}

func toUserResponse(u queries.GetUserByIDRow) userResponse {
	return userResponse{ID: u.ID, Username: u.Username, FirstName: u.FirstName, LastName: u.LastName, Timezone: u.Timezone}
}

type sessionResponse struct {
	User      userResponse `json:"user"`
	ExpiresAt time.Time    `json:"expires_at"`
	// Token is present only when the client asked for it with X-Session-Mode:
	// token (native apps). Browsers get an HttpOnly cookie instead, which
	// scripts can't read.
	Token string `json:"token,omitempty"`
}

// startSession signs userID in and writes the response: the cookie for a
// browser, the token in the body for a client that asked for one.
func (h *Handler) startSession(w http.ResponseWriter, r *http.Request, status int, user userResponse) {
	ctx := r.Context()
	token, hash, err := auth.NewSessionToken()
	if err != nil {
		h.Logger.ErrorContext(ctx, "failed to create session token", "error", err)
		writeError(w, http.StatusInternalServerError, "failed to sign you in")
		return
	}
	expires := time.Now().UTC().Add(h.SessionLifetime)
	if err := h.Queries.CreateSession(ctx, queries.CreateSessionParams{TokenHash: hash, UserID: user.ID, ExpiresAt: expires}); err != nil {
		h.Logger.ErrorContext(ctx, "failed to store session", "error", err)
		writeError(w, http.StatusInternalServerError, "failed to sign you in")
		return
	}
	// Housekeeping: expired sessions are useless, so drop them as people sign in.
	if err := h.Queries.DeleteExpiredSessions(ctx, time.Now().UTC()); err != nil {
		h.Logger.WarnContext(ctx, "failed to delete expired sessions", "error", err)
	}

	resp := sessionResponse{User: user, ExpiresAt: expires}
	if r.Header.Get(auth.TokenModeHeader) == auth.TokenMode {
		resp.Token = token
	} else {
		auth.SetSessionCookie(w, token, expires, h.CookieSecure)
	}
	writeJSON(w, status, resp)
}

// currentUser loads the signed-in caller's account, or writes the error.
func (h *Handler) currentUser(w http.ResponseWriter, r *http.Request) (queries.GetUserByIDRow, bool) {
	userID, ok := auth.RequireUser(w, r)
	if !ok {
		return queries.GetUserByIDRow{}, false
	}
	user, err := h.Queries.GetUserByID(r.Context(), userID)
	if errors.Is(err, sql.ErrNoRows) {
		writeError(w, http.StatusUnauthorized, "sign in first")
		return queries.GetUserByIDRow{}, false
	} else if err != nil {
		h.Logger.ErrorContext(r.Context(), "failed to load user", "error", err, "user_id", userID)
		writeError(w, http.StatusInternalServerError, "failed to load your account")
		return queries.GetUserByIDRow{}, false
	}
	return user, true
}

// checkCurrentPassword verifies the password a signed-in user typed to confirm
// a sensitive change, counting wrong ones. It writes the error and returns
// false if they can't proceed.
func (h *Handler) checkCurrentPassword(w http.ResponseWriter, r *http.Request, user queries.GetUserByIDRow, password string) bool {
	if h.reauthByUser.Blocked(user.ID) {
		tooMany(w, h.reauthByUser)
		return false
	}
	if err := auth.VerifyPassword(password, user.PasswordHash); err != nil {
		h.reauthByUser.Add(user.ID)
		writeError(w, http.StatusForbidden, "that isn't your current password")
		return false
	}
	h.reauthByUser.Reset(user.ID)
	return true
}
