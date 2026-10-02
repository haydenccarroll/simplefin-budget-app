package serve

import (
	"context"
	"database/sql"
	"fmt"
	"log/slog"
	"net/http"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/XSAM/otelsql"
	"budget-app/apps/budget-api/cmd/worker"
	"budget-app/apps/budget-api/internal/auth"
	"budget-app/apps/budget-api/internal/classifier"
	"budget-app/apps/budget-api/internal/database"
	authhandler "budget-app/apps/budget-api/internal/handlers/auth"
	"budget-app/apps/budget-api/internal/handlers/budget"
	"budget-app/apps/budget-api/internal/handlers/budgetadmin"
	"budget-app/apps/budget-api/internal/handlers/simplefin"
	"budget-app/apps/budget-api/internal/logging"
	"budget-app/apps/budget-api/internal/middleware"
	"budget-app/apps/budget-api/internal/queries"
	sf "budget-app/apps/budget-api/internal/simplefin"
	"budget-app/apps/budget-api/internal/tracing"
	"budget-app/apps/budget-api/internal/webapp"
	"github.com/prometheus/client_golang/prometheus/promhttp"
	"github.com/urfave/cli/v3"
	"go.opentelemetry.io/contrib/instrumentation/net/http/otelhttp"
	semconv "go.opentelemetry.io/otel/semconv/v1.26.0"

	"budget-app/apps/budget-api/internal/config"
)

type Command struct {
	config *config.ServeConfig
}

func NewCommand() *cli.Command {
	cfg := config.NewServeConfig()
	return &cli.Command{
		Name:  "serve",
		Flags: cfg.GetFlags(),
		Action: func(ctx context.Context, c *cli.Command) error {
			ctx, stop := signal.NotifyContext(ctx, syscall.SIGINT, syscall.SIGTERM)
			defer stop()
			svr, err := NewServer(ctx, cfg)
			if err != nil {
				return fmt.Errorf("could not start server: %w", err)
			}
			return svr.Serve(ctx)
		},
	}
}

type Server struct {
	handler http.Handler
	cfg     *config.ServeConfig
	db      *sql.DB
	queries *queries.Queries
	logger  *slog.Logger
}

func NewServer(ctx context.Context, cfg *config.ServeConfig) (*Server, error) {
	if cfg.TracingEnabled {
		_, err := tracing.InitTracer(ctx, "budget-api", cfg.TracingEndpoint)
		if err != nil {
			return nil, fmt.Errorf("could not initialize tracer: %w", err)
		}
	}

	db, err := otelsql.Open(database.DriverName, database.DSN(cfg.DatabasePath),
		otelsql.WithAttributes(semconv.DBSystemSqlite),
	)
	if err != nil {
		return nil, fmt.Errorf("could not open database: %w", err)
	}
	if err := database.Migrate(ctx, db); err != nil {
		return nil, fmt.Errorf("could not migrate database: %w", err)
	}
	q := queries.New(db)

	logger := logging.NewLogger(cfg.LogLevel)

	authHandler, err := authhandler.NewHandler(authhandler.HandlerConfig{
		Queries:           q,
		DB:                db,
		Logger:            logger,
		SessionLifetime:   cfg.SessionLifetime,
		CookieSecure:      cfg.CookieSecure,
		TrustProxyHeaders: cfg.TrustProxyHeaders,
	})
	if err != nil {
		return nil, fmt.Errorf("could not create auth handler: %w", err)
	}
	// Automatic categorization: jobs go in the database's jobs table and the
	// worker subcommand does the categorizing.
	var categorizer *classifier.Enqueuer
	if cfg.Categorize || cfg.RunWorker {
		categorizer = classifier.NewEnqueuer(q, logger)
		logger.Info("expense categorization enabled (jobs are queued for the worker)")
	}
	budgetHandler, err := budget.NewHandler(budget.HandlerConfig{
		Queries:    q,
		Logger:     logger,
		Classifier: categorizer,
	})
	if err != nil {
		return nil, fmt.Errorf("could not create budget handler: %w", err)
	}
	budgetAdminHandler, err := budgetadmin.NewHandler(budgetadmin.HandlerConfig{
		Queries: q,
		DB:      db,
		Logger:  logger,
	})
	if err != nil {
		return nil, fmt.Errorf("could not create budget admin handler: %w", err)
	}
	simplefinHandler, err := simplefin.NewHandler(simplefin.HandlerConfig{
		Queries:    q,
		Logger:     logger,
		Provider:   sf.NewClient(nil, cfg.SimpleFinClaimHosts),
		Classifier: categorizer,
	})
	if err != nil {
		return nil, fmt.Errorf("could not create simplefin handler: %w", err)
	}

	mux := http.NewServeMux()

	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})
	mux.HandleFunc("GET /ready", func(w http.ResponseWriter, r *http.Request) {
		if err := db.PingContext(r.Context()); err != nil {
			w.WriteHeader(http.StatusServiceUnavailable)
			return
		}
		w.WriteHeader(http.StatusOK)
	})

	if cfg.WebRoot != "" {
		// The most general pattern, so every API route above and below wins over it.
		mux.Handle("GET /", webapp.Handler(cfg.WebRoot))
	}

	mux.HandleFunc("POST /v1/auth/register", authHandler.Register)
	mux.HandleFunc("POST /v1/auth/login", authHandler.Login)
	mux.HandleFunc("POST /v1/auth/logout", authHandler.Logout)
	mux.HandleFunc("GET /v1/auth/me", authHandler.Me)
	mux.HandleFunc("PATCH /v1/auth/me", authHandler.UpdateMe)
	mux.HandleFunc("POST /v1/auth/change-password", authHandler.ChangePassword)

	mux.HandleFunc("GET /v1/budget", budgetAdminHandler.GetBudget)
	mux.HandleFunc("POST /v1/budget", budgetAdminHandler.CreateBudget)
	mux.HandleFunc("POST /v1/budget/join", budgetAdminHandler.JoinBudget)
	mux.HandleFunc("POST /v1/budget/friend-code", budgetAdminHandler.RotateFriendCode)
	mux.HandleFunc("DELETE /v1/budget/friend-code", budgetAdminHandler.DisableFriendCode)
	mux.HandleFunc("DELETE /v1/budget/members/{user_id}", budgetAdminHandler.RemoveMember)
	mux.HandleFunc("GET /v1/budget/export", budgetAdminHandler.ExportCSV)
	mux.HandleFunc("DELETE /v1/budget/data", budgetAdminHandler.DeleteAllData)

	mux.HandleFunc("GET /v1/budget-months", budgetHandler.ListBudgetMonths)
	mux.HandleFunc("GET /v1/budget-month/{month}", budgetHandler.GetBudgetMonth)
	mux.HandleFunc("POST /v1/budget-month/{month}/start", budgetHandler.StartBudgetMonth)

	mux.HandleFunc("POST /v1/budget-month/{month}/income-item", budgetHandler.CreateIncomeItem)
	mux.HandleFunc("PATCH /v1/income-item/{id}", budgetHandler.UpdateIncomeItem)
	mux.HandleFunc("DELETE /v1/income-item/{id}", budgetHandler.DeleteIncomeItem)

	mux.HandleFunc("POST /v1/budget-month/{month}/category-group", budgetHandler.CreateCategoryGroup)
	mux.HandleFunc("PATCH /v1/category-group/{id}", budgetHandler.UpdateCategoryGroup)
	mux.HandleFunc("DELETE /v1/category-group/{id}", budgetHandler.DeleteCategoryGroup)

	mux.HandleFunc("GET /v1/budget-month/{month}/expenses", budgetHandler.ListExpenses)
	mux.HandleFunc("POST /v1/budget-month/{month}/expense", budgetHandler.CreateExpense)
	mux.HandleFunc("PATCH /v1/expense/{id}", budgetHandler.UpdateExpense)
	mux.HandleFunc("DELETE /v1/expense/{id}", budgetHandler.DeleteExpense)

	mux.HandleFunc("GET /v1/simplefin/connection", simplefinHandler.GetConnection)
	mux.HandleFunc("PUT /v1/simplefin/connection", simplefinHandler.Connect)
	mux.HandleFunc("DELETE /v1/simplefin/connection", simplefinHandler.Disconnect)
	mux.HandleFunc("PATCH /v1/simplefin/accounts/{id}", simplefinHandler.UpdateAccount)
	mux.HandleFunc("POST /v1/budget-month/{month}/sync", simplefinHandler.Sync)

	origins := auth.NewOriginPolicy(cfg.CORSAllowedOrigins)
	// Logging sits inside Authenticate, which hands the mux a copy of the request:
	// the logger has to see the same request the mux routes to read its pattern.
	handler := middleware.NewCORS(origins, middleware.NewBodyLimit(
		auth.Authenticate(auth.DBSessions{Queries: q}, origins, logger, middleware.NewLogging(logger, mux))))
	if cfg.TracingEnabled {
		handler = otelhttp.NewHandler(handler, "budget-api")
	}

	s := &Server{
		handler: handler,
		cfg:     cfg,
		db:      db,
		queries: q,
		logger:  logger,
	}

	return s, nil
}

// shutdownTimeout is how long requests in flight get to finish once the
// process is asked to stop.
const shutdownTimeout = 20 * time.Second

// Serve answers requests until ctx is cancelled (SIGTERM), then lets requests
// in flight finish, stops the worker and closes the database, so that whatever
// replicates the database file sees it at rest.
func (s *Server) Serve(ctx context.Context) error {
	slog.Info("Starting server...")
	var workerDone chan struct{}
	if s.cfg.RunWorker {
		workerDone = make(chan struct{})
		go func() {
			defer close(workerDone)
			if err := worker.Run(ctx, s.queries, s.cfg.Jobs, s.logger); err != nil {
				s.logger.Error("worker stopped", "error", err)
			}
		}()
	}
	if s.cfg.MetricsAddr != "" {
		// Metrics get their own listener so they aren't reachable through the public API.
		go func() {
			metrics := http.NewServeMux()
			metrics.Handle("GET /metrics", promhttp.Handler())
			if err := http.ListenAndServe(s.cfg.MetricsAddr, metrics); err != nil {
				s.logger.Error("metrics listener stopped", "error", err)
			}
		}()
	}
	// The timeouts keep a client that opens a connection and then dawdles from
	// holding it forever. The write timeout is generous because the sync and the
	// CSV export do real work before they answer.
	srv := &http.Server{
		Addr:              listenAddr(s.cfg.ServePort),
		Handler:           s.handler,
		ReadHeaderTimeout: 10 * time.Second,
		ReadTimeout:       30 * time.Second,
		WriteTimeout:      2 * time.Minute,
		IdleTimeout:       2 * time.Minute,
	}
	errs := make(chan error, 1)
	go func() { errs <- srv.ListenAndServe() }()
	select {
	case err := <-errs:
		return err
	case <-ctx.Done():
	}

	s.logger.Info("shutting down")
	shutdownCtx, cancel := context.WithTimeout(context.Background(), shutdownTimeout)
	defer cancel()
	err := srv.Shutdown(shutdownCtx)
	if workerDone != nil {
		<-workerDone
	}
	if closeErr := s.db.Close(); err == nil {
		err = closeErr
	}
	return err
}

// listenAddr turns a bare port ("8080") into a listen address (":8080").
func listenAddr(port string) string {
	if strings.Contains(port, ":") {
		return port
	}
	return ":" + port
}
