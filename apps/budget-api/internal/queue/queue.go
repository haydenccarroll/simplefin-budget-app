// Package queue is the durable job queue that carries expense categorization
// work from the API to the worker. Jobs are rows in the database's jobs table,
// so queueing one is a plain insert and nothing else has to run.
//
// The worker polls for due jobs and claims one by locking it for a lease. A job
// that succeeds is deleted; one that fails is pushed back by the retry delay,
// and after MaxAttempts failures it is parked (dead_at is set) for inspection.
// If the worker dies mid-job the lease runs out and the job is picked up
// again, so delivery is at-least-once and handlers must be idempotent.
package queue

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"time"

	"budget-app/apps/budget-api/internal/queries"
)

const (
	// KindCategorizeExpense is the only kind of job so far.
	KindCategorizeExpense = "categorize_expense"

	// MaxAttempts is how many times a job may fail before it is parked.
	MaxAttempts = 8

	// DefaultRetryDelay is how long a failed job waits before it is retried.
	DefaultRetryDelay = time.Minute

	// pollInterval is how often an idle worker looks for new jobs.
	pollInterval = time.Second
)

// Job asks the worker to categorize one expense.
type Job struct {
	ExpenseID int32 `json:"expense_id"`
}

func encodeJob(j Job) (string, error) {
	b, err := json.Marshal(j)
	return string(b), err
}

func decodeJob(payload string) (Job, error) {
	var j Job
	if err := json.Unmarshal([]byte(payload), &j); err != nil {
		return Job{}, fmt.Errorf("decode job: %w", err)
	}
	if j.ExpenseID <= 0 {
		return Job{}, fmt.Errorf("decode job: missing expense_id")
	}
	return j, nil
}

// Enqueue queues the jobs. A job that is already waiting isn't queued twice.
// It returns how many were queued (or were already waiting) before any error.
func Enqueue(ctx context.Context, q *queries.Queries, jobs []Job) (int, error) {
	for i, job := range jobs {
		payload, err := encodeJob(job)
		if err != nil {
			return i, err
		}
		if err := q.EnqueueJob(ctx, queries.EnqueueJobParams{Kind: KindCategorizeExpense, Payload: payload}); err != nil {
			return i, fmt.Errorf("enqueue job: %w", err)
		}
	}
	return len(jobs), nil
}

type Handler func(ctx context.Context, job Job) error

// Consumer runs jobs one at a time.
type Consumer struct {
	Queries *queries.Queries
	Handle  Handler
	Logger  *slog.Logger
	// RetryDelay is how long a failed job waits before it runs again.
	RetryDelay time.Duration
	// Lease is how long a claimed job is held before another worker may take
	// it, so it must be longer than a job can take.
	Lease time.Duration
}

// Run processes jobs until ctx is cancelled.
func (c *Consumer) Run(ctx context.Context) error {
	if c.RetryDelay <= 0 {
		c.RetryDelay = DefaultRetryDelay
	}
	c.Logger.Info("worker consuming jobs")
	for {
		worked, err := c.runOne(ctx)
		if ctx.Err() != nil {
			return nil
		}
		if err != nil {
			c.Logger.Error("job queue error", "error", err)
		}
		if worked && err == nil {
			continue // there may be more waiting
		}
		select {
		case <-ctx.Done():
			return nil
		case <-time.After(pollInterval):
		}
	}
}

// runOne claims and runs the next due job, reporting whether there was one.
// It returns an error only when the database misbehaves; a failing job is
// handled here.
func (c *Consumer) runOne(ctx context.Context) (bool, error) {
	claimed, err := c.Queries.ClaimJob(ctx, sqliteDuration(c.Lease))
	if errors.Is(err, sql.ErrNoRows) {
		return false, nil
	} else if err != nil {
		return false, fmt.Errorf("claim job: %w", err)
	}

	job, err := decodeJob(claimed.Payload)
	if err != nil {
		// A job we can't read will never succeed; park it for inspection.
		c.Logger.Error("unreadable job parked", "error", err, "job_id", claimed.ID, "payload", claimed.Payload)
		return true, c.bury(ctx, claimed.ID, err)
	}

	err = c.Handle(ctx, job)
	switch {
	case err == nil:
		return true, c.Queries.CompleteJob(ctx, claimed.ID)
	case ctx.Err() != nil:
		// Shutting down mid-job: hand it back for the next run. ctx is done, so
		// this gets a fresh one.
		return true, c.Queries.ReleaseJob(context.WithoutCancel(ctx), claimed.ID)
	case int(claimed.Attempts) >= MaxAttempts:
		c.Logger.Error("job failed for the last time; parked", "error", err, "job_id", claimed.ID, "expense_id", job.ExpenseID, "attempts", claimed.Attempts)
		return true, c.bury(ctx, claimed.ID, err)
	default:
		c.Logger.Warn("job failed; will retry", "error", err, "job_id", claimed.ID, "expense_id", job.ExpenseID, "attempts", claimed.Attempts, "in", c.RetryDelay.String())
		return true, c.Queries.RetryJob(ctx, queries.RetryJobParams{
			Delay:     sqliteDuration(c.RetryDelay),
			LastError: lastError(err),
			ID:        claimed.ID,
		})
	}
}

func (c *Consumer) bury(ctx context.Context, id int32, cause error) error {
	return c.Queries.BuryJob(ctx, queries.BuryJobParams{LastError: lastError(cause), ID: id})
}

func lastError(err error) sql.NullString {
	msg := err.Error()
	if len(msg) > 1000 {
		msg = msg[:1000]
	}
	return sql.NullString{String: msg, Valid: true}
}

// sqliteDuration formats d as an SQLite date-time modifier ("+60 seconds").
func sqliteDuration(d time.Duration) string {
	return fmt.Sprintf("%+d seconds", int64(d.Round(time.Second)/time.Second))
}
