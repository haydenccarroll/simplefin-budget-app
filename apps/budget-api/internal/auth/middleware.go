package auth

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"budget-app/apps/budget-api/internal/identity"
)

// ErrNoSession means a token doesn't belong to a live session.
var ErrNoSession = errors.New("no such session")

// SessionStore looks up sessions.
type SessionStore interface {
	// UserForSession returns the user a session token hash belongs to, or
	// ErrNoSession if there is no unexpired session with that hash.
	UserForSession(ctx context.Context, tokenHash string, now time.Time) (userID string, err error)
}

// CookieName is the session cookie's name.
const CookieName = "budget_session"

// TokenModeHeader is sent by native clients on login and registration to ask
// for the session token in the response body. Browsers don't send it: they get
// an HttpOnly cookie that scripts can't read.
const TokenModeHeader = "X-Session-Mode"

// TokenMode is the value of TokenModeHeader that asks for a body token.
const TokenMode = "token"

// credentials returns the session token on a request and whether it came from
// the cookie. An Authorization header wins over the cookie.
func credentials(r *http.Request) (token string, viaCookie bool) {
	if h := r.Header.Get("Authorization"); h != "" {
		if scheme, value, ok := strings.Cut(h, " "); ok && strings.EqualFold(scheme, "Bearer") {
			return strings.TrimSpace(value), false
		}
		return "", false
	}
	if c, err := r.Cookie(CookieName); err == nil {
		return c.Value, true
	}
	return "", false
}

func safeMethod(method string) bool {
	return method == http.MethodGet || method == http.MethodHead || method == http.MethodOptions
}

// Authenticate resolves the caller from a session token (a bearer token for
// native apps, the cookie for browsers) and puts their ID on the request's
// context; see identity.UserID. It does not reject unauthenticated requests:
// public endpoints exist, and the handlers that need a user say so.
//
// It does reject, with 403, the requests that would make cookies unsafe (CSRF):
// a state-changing request from a browser origin that isn't allowed, and a
// state-changing request that rides on the cookie but says nothing about where
// it came from. Bearer tokens have no such problem, since a browser never adds
// them by itself.
func Authenticate(store SessionStore, origins OriginPolicy, logger *slog.Logger, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		unsafe := !safeMethod(r.Method)
		origin := r.Header.Get("Origin")
		if unsafe && origin != "" && !origins.Allows(origin, r) {
			logger.WarnContext(r.Context(), "refused request from a disallowed origin", "origin", origin, "path", r.URL.Path)
			WriteError(w, http.StatusForbidden, "that origin isn't allowed")
			return
		}

		token, viaCookie := credentials(r)
		if token == "" {
			next.ServeHTTP(w, r)
			return
		}
		if unsafe && viaCookie && origin == "" {
			logger.WarnContext(r.Context(), "refused cookie request with no origin", "path", r.URL.Path)
			WriteError(w, http.StatusForbidden, "cookie requests must say where they came from")
			return
		}

		userID, err := store.UserForSession(r.Context(), HashToken(token), time.Now().UTC())
		switch {
		case errors.Is(err, ErrNoSession):
			next.ServeHTTP(w, r) // unauthenticated; the handler answers 401
		case err != nil:
			logger.ErrorContext(r.Context(), "failed to look up session", "error", err)
			WriteError(w, http.StatusInternalServerError, "failed to check your session")
		default:
			next.ServeHTTP(w, r.WithContext(identity.WithUserID(r.Context(), userID)))
		}
	})
}

// SessionToken returns the token the request authenticated with, for the
// handlers that act on the current session (logout, change password).
func SessionToken(r *http.Request) string {
	token, _ := credentials(r)
	return token
}

// SetSessionCookie sets the browser session cookie: HttpOnly so scripts can't
// read it, SameSite=Lax so other sites can't send it on state-changing
// requests, and Secure whenever the API is served over HTTPS.
func SetSessionCookie(w http.ResponseWriter, token string, expires time.Time, secure bool) {
	http.SetCookie(w, &http.Cookie{
		Name:     CookieName,
		Value:    token,
		Path:     "/",
		Expires:  expires,
		HttpOnly: true,
		Secure:   secure,
		SameSite: http.SameSiteLaxMode,
	})
}

// ClearSessionCookie tells the browser to drop the session cookie.
func ClearSessionCookie(w http.ResponseWriter, secure bool) {
	http.SetCookie(w, &http.Cookie{
		Name:     CookieName,
		Value:    "",
		Path:     "/",
		MaxAge:   -1,
		HttpOnly: true,
		Secure:   secure,
		SameSite: http.SameSiteLaxMode,
	})
}
