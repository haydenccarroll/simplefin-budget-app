// Package identity carries who is calling through a request. The auth
// middleware (internal/auth) establishes it from a session; nothing a client
// sends directly is believed.
package identity

import (
	"context"
	"net/http"
)

type ctxKey struct{}

// WithUserID returns a context in which the caller is userID.
func WithUserID(ctx context.Context, userID string) context.Context {
	return context.WithValue(ctx, ctxKey{}, userID)
}

// UserID returns the authenticated caller's ID, or "" if the request isn't
// authenticated.
func UserID(r *http.Request) string {
	id, _ := r.Context().Value(ctxKey{}).(string)
	return id
}
