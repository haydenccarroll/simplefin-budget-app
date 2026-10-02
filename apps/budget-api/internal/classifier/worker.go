package classifier

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"log/slog"
	"time"

	"budget-app/apps/budget-api/internal/queries"
	"budget-app/apps/budget-api/internal/queue"
)

// Worker categorizes one expense per job by sending the categories + expense to be categorized to an LLM classifier.
type Worker struct {
	queries    *queries.Queries
	classifier Classifier
	logger     *slog.Logger
	timeout    time.Duration
}

// NewWorker returns a Worker
func NewWorker(q *queries.Queries, c Classifier, logger *slog.Logger, jobTimeout time.Duration) *Worker {
	return &Worker{queries: q, classifier: c, logger: logger, timeout: jobTimeout}
}

// Process fullfils a job (classifies an expense) and is idempotent. If an error is returned, it is
// retried
func (w *Worker) Process(ctx context.Context, job queue.Job) error {
	e, err := w.queries.GetExpense(ctx, job.ExpenseID)
	if errors.Is(err, sql.ErrNoRows) {
		return nil // deleted since it was queued
	} else if err != nil {
		return fmt.Errorf("load expense %d: %w", job.ExpenseID, err)
	}
	if e.CategoryGroupID.Valid {
		return nil // category already chosen
	}

	groups, err := w.queries.ListCategoryGroupsByMonth(ctx, e.BudgetMonthID)
	if err != nil {
		return fmt.Errorf("list category groups: %w", err)
	}
	if len(groups) == 0 {
		// no categories to classify into
		return nil
	}
	var categories []Category
	groupByName := make(map[string]int32, len(groups))
	for _, g := range groups {
		if _, dup := groupByName[g.Name]; dup {
			continue
		}
		categories = append(categories, Category{Name: g.Name, Description: g.Description.String})
		groupByName[g.Name] = g.ID
	}

	amount := 0.0
	_, _ = fmt.Sscanf(e.Amount, "%f", &amount)

	callCtx, cancel := context.WithTimeout(ctx, w.timeout)
	defer cancel()
	category, err := w.classifier.Classify(callCtx, categories, Transaction{
		Description: e.Description,
		Amount:      amount,
		Account:     e.SourceAccountName.String,
	})
	if err != nil {
		return fmt.Errorf("classify expense %d: %w", job.ExpenseID, err)
	}

	if category == "" {
		w.logger.InfoContext(ctx, "expense left uncategorized", "expense_id", e.ID, "description", e.Description)
		return nil
	}
	result, err := w.queries.SetExpenseAutoCategory(ctx, queries.SetExpenseAutoCategoryParams{
		CategoryGroupID: sql.NullInt32{Int32: groupByName[category], Valid: true},
		ID:              e.ID,
	})
	if err != nil {
		return fmt.Errorf("save category for expense %d: %w", e.ID, err)
	}
	if n, _ := result.RowsAffected(); n > 0 {
		w.logger.InfoContext(ctx, "expense categorized", "expense_id", e.ID, "description", e.Description, "category", category)
	}
	return nil
}
