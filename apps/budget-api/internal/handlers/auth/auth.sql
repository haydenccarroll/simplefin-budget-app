-- Accounts

-- name: CreateUser :exec
INSERT INTO users (id, username, password_hash, first_name, last_name, timezone)
VALUES (?, ?, ?, ?, ?, ?);

-- name: GetUserByUsername :one
SELECT id, username, password_hash, first_name, last_name, timezone
FROM users
WHERE username = ? AND deleted_at IS NULL;

-- name: GetUserByID :one
SELECT id, username, password_hash, first_name, last_name, timezone
FROM users
WHERE id = ? AND deleted_at IS NULL;

-- name: GetUserFirstName :one
SELECT first_name FROM users WHERE id = ?;

-- name: UpdateUserProfile :exec
UPDATE users SET username = ?, first_name = ?, last_name = ?, timezone = ? WHERE id = ?;

-- name: UpdateUserPassword :exec
UPDATE users SET password_hash = ? WHERE id = ?;

-- Sessions. Times are UTC and passed in, so they don't depend on the database
-- server's clock or time zone.

-- name: CreateSession :exec
INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?);

-- name: GetSessionUser :one
SELECT s.user_id
FROM sessions s
JOIN users u ON u.id = s.user_id
WHERE s.token_hash = ? AND s.expires_at > ? AND u.deleted_at IS NULL;

-- name: DeleteSession :exec
DELETE FROM sessions WHERE token_hash = ?;

-- name: DeleteUserSessions :exec
DELETE FROM sessions WHERE user_id = ?;

-- name: DeleteUserSessionsExcept :exec
DELETE FROM sessions WHERE user_id = ? AND token_hash <> ?;

-- name: DeleteExpiredSessions :exec
DELETE FROM sessions WHERE expires_at <= ?;
