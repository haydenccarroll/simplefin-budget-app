package config

import (
	"time"

	"github.com/urfave/cli/v3"
)

type ServeConfig struct {
	ServePort string
	// DatabasePath is the SQLite database file, shared with the worker.
	DatabasePath    string
	LogLevel        string
	TracingEnabled  bool
	TracingEndpoint string
	// SimpleFinClaimHosts overrides the bridge hosts setup tokens may be claimed from.
	SimpleFinClaimHosts []string
	// Categorize queues uncategorized expenses for the worker subcommand to
	// categorize with the LLM. Off when no worker runs.
	Categorize bool
	// RunWorker runs the job worker inside the API process, for deployments
	// where the database file is local to one container. Implies Categorize.
	RunWorker bool
	Jobs      JobConfig

	// CORSAllowedOrigins are the web origins (scheme://host[:port]) that may call
	// the API from a browser, besides the API's own origin. Native apps aren't
	// affected by it.
	CORSAllowedOrigins []string
	// CookieSecure marks the session cookie Secure; set it when serving HTTPS.
	CookieSecure bool
	// SessionLifetime is how long a sign-in lasts.
	SessionLifetime time.Duration
	// TrustProxyHeaders makes rate limiting go by X-Forwarded-For; only behind a
	// reverse proxy that sets it.
	TrustProxyHeaders bool
	// MetricsAddr serves Prometheus metrics on its own listener (e.g. ":9090"),
	// away from the public API; empty turns metrics off.
	MetricsAddr string
	// WebRoot is a directory holding the web build of the app, served at /
	// (anything that isn't the API); empty serves no web app.
	WebRoot string
}

func NewServeConfig() *ServeConfig {
	return &ServeConfig{}
}

func (c *ServeConfig) GetFlags() []cli.Flag {
	return append([]cli.Flag{
		&cli.StringFlag{
			Name:        "serve-port",
			Value:       "8080",
			Usage:       "Port to serve on",
			Sources:     cli.EnvVars("SERVE_PORT"),
			Destination: &c.ServePort,
		},
		&cli.StringFlag{
			Name:        "database-path",
			Value:       "budget.db",
			Usage:       "SQLite database file (created if missing; the API and worker share it)",
			Sources:     cli.EnvVars("DATABASE_PATH"),
			Destination: &c.DatabasePath,
		},
		&cli.StringFlag{
			Name:        "log-level",
			Value:       "DEBUG",
			Usage:       "Log level (DEBUG, INFO, WARN, ERROR)",
			Sources:     cli.EnvVars("LOG_LEVEL"),
			Destination: &c.LogLevel,
		},
		&cli.BoolFlag{
			Name:        "tracing-enabled",
			Value:       false,
			Usage:       "Enable OpenTelemetry tracing",
			Sources:     cli.EnvVars("TRACING_ENABLED"),
			Destination: &c.TracingEnabled,
		},
		&cli.StringFlag{
			Name:        "tracing-endpoint",
			Value:       "localhost:4317",
			Usage:       "OTLP gRPC endpoint for traces",
			Sources:     cli.EnvVars("TRACING_ENDPOINT"),
			Destination: &c.TracingEndpoint,
		},
		&cli.StringSliceFlag{
			Name:        "cors-allowed-origins",
			Usage:       "Web origins allowed to call the API from a browser, comma separated (e.g. https://app.example.com)",
			Sources:     cli.EnvVars("CORS_ALLOWED_ORIGINS"),
			Destination: &c.CORSAllowedOrigins,
		},
		&cli.BoolFlag{
			Name:        "cookie-secure",
			Usage:       "Mark the session cookie Secure (set when serving over HTTPS)",
			Sources:     cli.EnvVars("COOKIE_SECURE"),
			Destination: &c.CookieSecure,
		},
		&cli.DurationFlag{
			Name:        "session-lifetime",
			Value:       30 * 24 * time.Hour,
			Usage:       "How long a sign-in lasts",
			Sources:     cli.EnvVars("SESSION_LIFETIME"),
			Destination: &c.SessionLifetime,
		},
		&cli.BoolFlag{
			Name:        "trust-proxy-headers",
			Usage:       "Rate limit by the last X-Forwarded-For address (only behind a reverse proxy that sets it)",
			Sources:     cli.EnvVars("TRUST_PROXY_HEADERS"),
			Destination: &c.TrustProxyHeaders,
		},
		&cli.StringFlag{
			Name:        "web-root",
			Usage:       "Directory with the app's web build (vite build) to serve at /; empty disables it",
			Sources:     cli.EnvVars("WEB_ROOT"),
			Destination: &c.WebRoot,
		},
		&cli.StringFlag{
			Name:        "metrics-addr",
			Usage:       "Address for Prometheus metrics, kept off the public API (e.g. :9090); empty disables them",
			Sources:     cli.EnvVars("METRICS_ADDR"),
			Destination: &c.MetricsAddr,
		},
		&cli.StringSliceFlag{
			Name:        "simplefin-claim-hosts",
			Usage:       "Bridge hostnames setup tokens may be claimed from (default: bridge.simplefin.org, beta-bridge.simplefin.org)",
			Sources:     cli.EnvVars("SIMPLEFIN_CLAIM_HOSTS"),
			Destination: &c.SimpleFinClaimHosts,
		},
		&cli.BoolFlag{
			Name:        "categorize",
			Usage:       "Queue uncategorized expenses for the worker to categorize with the LLM (needs the worker running)",
			Sources:     cli.EnvVars("CATEGORIZATION_ENABLED"),
			Destination: &c.Categorize,
		},
		&cli.BoolFlag{
			Name:        "run-worker",
			Usage:       "Also run the categorization worker in this process (turns on --categorize)",
			Sources:     cli.EnvVars("RUN_WORKER"),
			Destination: &c.RunWorker,
		},
	}, c.Jobs.GetFlags()...)
}

// WorkerConfig configures the worker subcommand, which works through the job
// queue and categorizes expenses with the self-hosted LLM.
type WorkerConfig struct {
	DatabasePath string
	LogLevel     string
	Jobs         JobConfig
}

// JobConfig is what the job worker needs, whether it runs as the worker
// subcommand or inside the API (serve --run-worker).
type JobConfig struct {
	// RetryDelay is how long a failed job waits before it is retried.
	RetryDelay time.Duration
	LLMURL     string
	LLMModel   string
	// LLMThreads is the CPU threads the model uses (match its CPU limit); 0 = auto.
	LLMThreads int
	// LLMTimeout bounds a single classification (including loading the model).
	LLMTimeout time.Duration
}

func NewWorkerConfig() *WorkerConfig {
	return &WorkerConfig{}
}

func (c *WorkerConfig) GetFlags() []cli.Flag {
	return append([]cli.Flag{
		&cli.StringFlag{
			Name:        "database-path",
			Value:       "budget.db",
			Usage:       "SQLite database file (created if missing; the API and worker share it)",
			Sources:     cli.EnvVars("DATABASE_PATH"),
			Destination: &c.DatabasePath,
		},
		&cli.StringFlag{
			Name:        "log-level",
			Value:       "DEBUG",
			Usage:       "Log level (DEBUG, INFO, WARN, ERROR)",
			Sources:     cli.EnvVars("LOG_LEVEL"),
			Destination: &c.LogLevel,
		},
	}, c.Jobs.GetFlags()...)
}

func (c *JobConfig) GetFlags() []cli.Flag {
	return []cli.Flag{
		&cli.DurationFlag{
			Name:        "job-retry-delay",
			Value:       time.Minute,
			Usage:       "How long a failed categorization job waits before being retried",
			Sources:     cli.EnvVars("JOB_RETRY_DELAY"),
			Destination: &c.RetryDelay,
		},
		&cli.StringFlag{
			Name:        "llm-url",
			Value:       "http://ollama:11434",
			Usage:       "Base URL of the Ollama server",
			Sources:     cli.EnvVars("LLM_URL"),
			Destination: &c.LLMURL,
		},
		&cli.StringFlag{
			Name:        "llm-model",
			Value:       "qwen2.5:3b",
			Usage:       "Ollama model used to categorize expenses",
			Sources:     cli.EnvVars("LLM_MODEL"),
			Destination: &c.LLMModel,
		},
		&cli.DurationFlag{
			Name:        "llm-timeout",
			Value:       90 * time.Second,
			Usage:       "Timeout for categorizing one expense, including loading the model",
			Sources:     cli.EnvVars("LLM_TIMEOUT"),
			Destination: &c.LLMTimeout,
		},
	}
}
