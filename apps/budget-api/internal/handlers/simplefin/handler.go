package simplefin

import (
	"encoding/json"
	"fmt"
	"log/slog"
	"math"
	"net/http"
	"strconv"

	"budget-app/apps/budget-api/internal/classifier"
	"budget-app/apps/budget-api/internal/queries"
	sf "budget-app/apps/budget-api/internal/simplefin"
)

type HandlerConfig struct {
	Queries  *queries.Queries
	Logger   *slog.Logger
	Provider sf.Provider
	// Classifier queues newly imported expenses for automatic categorization;
	// nil when the queue isn't configured.
	Classifier *classifier.Enqueuer
}

type Handler struct {
	queries    *queries.Queries
	logger     *slog.Logger
	provider   sf.Provider
	classifier *classifier.Enqueuer
}

func NewHandler(cfg HandlerConfig) (*Handler, error) {
	h := Handler{
		queries:    cfg.Queries,
		logger:     cfg.Logger,
		provider:   cfg.Provider,
		classifier: cfg.Classifier,
	}
	if h.queries == nil {
		return nil, fmt.Errorf("queries cannot be nil")
	} else if h.logger == nil {
		return nil, fmt.Errorf("logger cannot be nil")
	} else if h.provider == nil {
		return nil, fmt.Errorf("provider cannot be nil")
	}
	return &h, nil
}

type errorResponse struct {
	Error string `json:"error"`
}

func writeError(w http.ResponseWriter, status int, message string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(errorResponse{Error: message})
}

func writeJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}

func decodeJSON(r *http.Request, dst any) error {
	defer func() { _ = r.Body.Close() }()
	return json.NewDecoder(r.Body).Decode(dst)
}

func roundCents(v float64) float64 {
	return math.Round(v*100) / 100
}

func formatAmount(v float64) string {
	return strconv.FormatFloat(roundCents(v), 'f', 2, 64)
}
