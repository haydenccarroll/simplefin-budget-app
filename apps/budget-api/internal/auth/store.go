package auth

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"time"

	"budget-app/apps/budget-api/internal/queries"
)

// DBSessions is the SessionStore backed by the sessions table.
type DBSessions struct{ Queries *queries.Queries }

// UserForSession implements SessionStore.
func (s DBSessions) UserForSession(ctx context.Context, tokenHash string, now time.Time) (string, error) {
	userID, err := s.Queries.GetSessionUser(ctx, queries.GetSessionUserParams{TokenHash: tokenHash, ExpiresAt: now})
	if errors.Is(err, sql.ErrNoRows) {
		return "", ErrNoSession
	} else if err != nil {
		return "", fmt.Errorf("get session: %w", err)
	}
	return userID, nil
}
