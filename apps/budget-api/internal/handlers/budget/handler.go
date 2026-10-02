package budget

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"log/slog"
	"math"
	"net/http"
	"strconv"
	"time"

	"budget-app/apps/budget-api/internal/classifier"
	"budget-app/apps/budget-api/internal/database"
	"budget-app/apps/budget-api/internal/queries"
)

type HandlerConfig struct {
	Queries *queries.Queries
	Logger  *slog.Logger
	// Classifier queues expenses for automatic categorization; nil when the
	// queue isn't configured.
	Classifier *classifier.Enqueuer
}

type Handler struct {
	queries    *queries.Queries
	logger     *slog.Logger
	classifier *classifier.Enqueuer
}

func NewHandler(cfg HandlerConfig) (*Handler, error) {
	h := Handler{
		queries:    cfg.Queries,
		logger:     cfg.Logger,
		classifier: cfg.Classifier,
	}
	if h.queries == nil {
		return nil, fmt.Errorf("queries cannot be nil")
	} else if h.logger == nil {
		return nil, fmt.Errorf("logger cannot be nil")
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

// monthLayout is the wire format for a budget month: "2026-09".
const monthLayout = "2006-01"

func parseMonth(raw string) (time.Time, error) {
	t, err := time.Parse(monthLayout, raw)
	if err != nil {
		return time.Time{}, fmt.Errorf("month must be formatted as YYYY-MM")
	}
	return time.Date(t.Year(), t.Month(), 1, 0, 0, 0, 0, time.UTC), nil
}

// parseOptionalDate parses an optional "2006-01-02" date. nil or blank means
// no date, which is valid.
func parseOptionalDate(raw *string) (sql.NullTime, error) {
	if raw == nil || *raw == "" {
		return sql.NullTime{}, nil
	}
	t, err := time.Parse(dateLayout, *raw)
	if err != nil {
		return sql.NullTime{}, err
	}
	return sql.NullTime{Time: t, Valid: true}, nil
}

// formatOptionalDate is the inverse of parseOptionalDate: nil when unset.
func formatOptionalDate(t sql.NullTime) *string {
	if !t.Valid {
		return nil
	}
	s := t.Time.Format(dateLayout)
	return &s
}

func formatMonth(t time.Time) string {
	return t.Format(monthLayout)
}

// roundCents rounds a float to 2 decimal places so JSON output never shows
// floating point noise (e.g. 19.999999999998) after a DB round-trip.
func roundCents(v float64) float64 {
	return math.Round(v*100) / 100
}

func parseAmount(raw string) (float64, error) {
	v, err := strconv.ParseFloat(raw, 64)
	if err != nil {
		return 0, err
	}
	return roundCents(v), nil
}

func formatAmount(v float64) string {
	return strconv.FormatFloat(roundCents(v), 'f', 2, 64)
}

// decimalFromInterface reads the driver value produced by a COALESCE(SUM(...), 0)
// aggregate scanned into interface{} (sqlc can't infer a concrete numeric type
// for computed aggregate columns). SQLite's SUM gives a float, or an integer
// when there is nothing to add up.
func decimalFromInterface(v any) float64 {
	switch t := v.(type) {
	case []byte:
		f, _ := strconv.ParseFloat(string(t), 64)
		return roundCents(f)
	case string:
		f, _ := strconv.ParseFloat(t, 64)
		return roundCents(f)
	case float64:
		return roundCents(t)
	case int64:
		return float64(t)
	default:
		return 0
	}
}

func decodeJSON(r *http.Request, dst any) error {
	defer func() { _ = r.Body.Close() }()
	return json.NewDecoder(r.Body).Decode(dst)
}

// parsePathID parses the "id" path value as an int32, writing a 400 response
// and returning ok=false if it's missing or malformed.
func parsePathID(w http.ResponseWriter, r *http.Request) (int32, bool) {
	raw := r.PathValue("id")
	id, err := strconv.ParseInt(raw, 10, 32)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid id")
		return 0, false
	}
	return int32(id), true
}

// validClientID reports whether an app-supplied entry id looks like a UUID, which is
// what the app generates and what the 36-character column holds.
func validClientID(id string) bool {
	if len(id) != 36 {
		return false
	}
	for i, c := range id {
		switch {
		case i == 8 || i == 13 || i == 18 || i == 23:
			if c != '-' {
				return false
			}
		case !(c >= '0' && c <= '9' || c >= 'a' && c <= 'f' || c >= 'A' && c <= 'F'):
			return false
		}
	}
	return true
}

// isDuplicateKey reports whether err is a unique key violation.
func isDuplicateKey(err error) bool {
	return database.IsUniqueViolation(err)
}
