package classifier

import (
	"context"
	"fmt"
	"log/slog"

	"budget-app/apps/budget-api/internal/queries"
	"budget-app/apps/budget-api/internal/queue"
)

// Enqueuer is what the API uses to ask for expenses to be categorized: it puts
// jobs on the durable queue (the jobs table) and returns. The work itself is
// done by the worker process (see Worker). It is safe to use via a nil
// *Enqueuer (categorization not configured): every method is a no-op.
type Enqueuer struct {
	queries *queries.Queries
	logger  *slog.Logger
}

// NewEnqueuer returns an Enqueuer that queues jobs in the database.
func NewEnqueuer(q *queries.Queries, logger *slog.Logger) *Enqueuer {
	return &Enqueuer{queries: q, logger: logger}
}

// Enabled reports whether jobs can be queued.
func (e *Enqueuer) Enabled() bool { return e != nil }

// Enqueue queues the given expenses and returns how many were durably queued.
// On error the count still says how many made it onto the queue.
func (e *Enqueuer) Enqueue(ctx context.Context, expenseIDs []int32) (int, error) {
	if !e.Enabled() || len(expenseIDs) == 0 {
		return 0, nil
	}
	jobs := make([]queue.Job, len(expenseIDs))
	for i, id := range expenseIDs {
		jobs[i] = queue.Job{ExpenseID: id}
	}
	n, err := queue.Enqueue(ctx, e.queries, jobs)
	if err != nil {
		return n, fmt.Errorf("queue categorization: %w", err)
	}
	return n, nil
}

// EnqueueUnassigned queues every uncategorized expense in the month, including
// ones automatic categorization already looked at and left blank, and returns
// how many were queued.
func (e *Enqueuer) EnqueueUnassigned(ctx context.Context, budgetMonthID int32) (int, error) {
	if !e.Enabled() {
		return 0, nil
	}
	ids, err := e.queries.ListUnassignedExpenseIDs(ctx, budgetMonthID)
	if err != nil {
		return 0, fmt.Errorf("list unassigned expenses: %w", err)
	}
	return e.Enqueue(ctx, ids)
}
