package middleware

import (
	"log/slog"
	"net/http"
	"strconv"

	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promauto"
)

var (
	httpRequestsTotal = promauto.NewCounterVec(
		prometheus.CounterOpts{
			Name: "http_requests_total",
			Help: "Total number of HTTP requests",
		},
		[]string{"method", "path", "status"},
	)
)

// responseWriter is a custom http.ResponseWriter that captures the status code
// so we can log it later
type responseWriter struct {
	http.ResponseWriter
	statusCode int
}

func (rw *responseWriter) WriteHeader(statusCode int) {
	rw.statusCode = statusCode
	rw.ResponseWriter.WriteHeader(statusCode)
}

// NewLogging returns a middleware that logs all HTTP requests and responses.
// It logs what was asked for and how it went, never the bodies or the query
// string: they hold budget data, friend codes and the CSV export, and logs are
// kept and shipped elsewhere.
func NewLogging(logger *slog.Logger, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		logger.InfoContext(r.Context(), "request", "method", r.Method, "path", r.URL.Path)

		wrapped := &responseWriter{ResponseWriter: w, statusCode: http.StatusOK}

		next.ServeHTTP(wrapped, r)

		// The route pattern ("GET /v1/expense/{id}") rather than the path, so
		// IDs and months don't each become a metric series. r.Pattern is set by
		// the mux, which runs inside this middleware, and is empty for a 404.
		route := r.Pattern
		if route == "" {
			route = "unmatched"
		}
		httpRequestsTotal.WithLabelValues(r.Method, route, strconv.Itoa(wrapped.statusCode)).Inc()

		logger.InfoContext(r.Context(), "response",
			"method", r.Method,
			"path", r.URL.Path,
			"status", wrapped.statusCode,
		)
	})
}
