// Package worker is the "worker" subcommand: a long-running process that takes
// expense categorization jobs off the job queue (the jobs table) and runs them
// against the self-hosted LLM, writing the chosen category back to the
// database.
package worker

import (
	"context"
	"fmt"
	"log/slog"
	"os/signal"
	"syscall"
	"time"

	"github.com/urfave/cli/v3"

	"budget-app/apps/budget-api/internal/classifier"
	"budget-app/apps/budget-api/internal/config"
	"budget-app/apps/budget-api/internal/database"
	"budget-app/apps/budget-api/internal/logging"
	"budget-app/apps/budget-api/internal/queries"
	"budget-app/apps/budget-api/internal/queue"
)

// leaseMargin is added to the LLM timeout to get how long a claimed job is
// held: long enough that a job still running is never handed to another worker.
const leaseMargin = time.Minute

func NewCommand() *cli.Command {
	cfg := config.NewWorkerConfig()
	return &cli.Command{
		Name:  "worker",
		Usage: "Works through the job queue, categorizing expenses using an LLM",
		Flags: cfg.GetFlags(),
		Action: func(ctx context.Context, c *cli.Command) error {
			ctx, stop := signal.NotifyContext(ctx, syscall.SIGINT, syscall.SIGTERM)
			defer stop()
			return run(ctx, cfg)
		},
	}
}

func run(ctx context.Context, cfg *config.WorkerConfig) error {
	logger := logging.NewLogger(cfg.LogLevel)

	db, err := database.Open(ctx, cfg.DatabasePath)
	if err != nil {
		return fmt.Errorf("could not open database: %w", err)
	}
	defer func() { _ = db.Close() }()
	q := queries.New(db)

	return Run(ctx, q, cfg.Jobs, logger)
}

// Run works through the job queue until ctx is cancelled. The API calls it
// too, when it runs the worker in-process.
func Run(ctx context.Context, q *queries.Queries, cfg config.JobConfig, logger *slog.Logger) error {
	ollama := classifier.NewOllama(cfg.LLMURL, cfg.LLMModel, cfg.LLMTimeout)
	w := classifier.NewWorker(q, ollama, logger, cfg.LLMTimeout)

	logger.Info("worker starting", "model", cfg.LLMModel, "llm_url", cfg.LLMURL)
	consumer := &queue.Consumer{
		Queries:    q,
		Handle:     w.Process,
		Logger:     logger,
		RetryDelay: cfg.RetryDelay,
		Lease:      cfg.LLMTimeout + leaseMargin,
	}
	err := consumer.Run(ctx)
	logger.Info("worker stopping")
	return err
}
