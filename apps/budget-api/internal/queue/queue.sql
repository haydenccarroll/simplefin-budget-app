-- Queues a job unless the same one is already waiting.
-- name: EnqueueJob :exec
INSERT OR IGNORE INTO jobs (kind, payload) VALUES (?, ?);

-- Takes the next job that is due and not held by another worker, holding it
-- for the lease (an SQLite time modifier such as '+300 seconds'). Times are
-- compared using SQLite's own UTC clock, datetime('now').
-- name: ClaimJob :one
UPDATE jobs
SET attempts = attempts + 1, locked_until = datetime('now', CAST(sqlc.arg(lease) AS TEXT))
WHERE id = (
    SELECT id FROM jobs
    WHERE dead_at IS NULL
      AND run_at <= datetime('now')
      AND (locked_until IS NULL OR locked_until <= datetime('now'))
    ORDER BY run_at, id
    LIMIT 1
)
RETURNING id, kind, payload, attempts;

-- name: CompleteJob :exec
DELETE FROM jobs WHERE id = ?;

-- Schedules a failed job to run again after the delay (a time modifier, as above).
-- name: RetryJob :exec
UPDATE jobs
SET run_at = datetime('now', CAST(sqlc.arg(delay) AS TEXT)), locked_until = NULL, last_error = sqlc.arg(last_error)
WHERE id = sqlc.arg(id);

-- Parks a job that has failed too often.
-- name: BuryJob :exec
UPDATE jobs SET dead_at = CURRENT_TIMESTAMP, locked_until = NULL, last_error = ? WHERE id = ?;

-- Hands back a job the worker gave up on without failing it (it is shutting
-- down), so it runs again straight away and the attempt doesn't count.
-- name: ReleaseJob :exec
UPDATE jobs SET locked_until = NULL, attempts = attempts - 1 WHERE id = ?;
