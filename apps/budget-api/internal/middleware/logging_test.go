package middleware

import (
	"bytes"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	dto "github.com/prometheus/client_model/go"
)

func counterValue(t *testing.T, method, route, status string) float64 {
	t.Helper()
	var m dto.Metric
	if err := httpRequestsTotal.WithLabelValues(method, route, status).Write(&m); err != nil {
		t.Fatal(err)
	}
	return m.GetCounter().GetValue()
}

func TestLoggingKeepsBodiesAndQueriesOut(t *testing.T) {
	var logs bytes.Buffer
	logger := slog.New(slog.NewTextHandler(&logs, nil))

	mux := http.NewServeMux()
	mux.HandleFunc("POST /v1/thing/{id}", func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte("secret-response"))
	})
	h := NewLogging(logger, mux)

	before := counterValue(t, "POST", "POST /v1/thing/{id}", "200")
	req := httptest.NewRequest(http.MethodPost, "/v1/thing/42?token=secret-query", strings.NewReader("secret-request"))
	h.ServeHTTP(httptest.NewRecorder(), req)

	for _, leaked := range []string{"secret-request", "secret-response", "secret-query"} {
		if strings.Contains(logs.String(), leaked) {
			t.Errorf("log leaked %q:\n%s", leaked, logs.String())
		}
	}
	if !strings.Contains(logs.String(), "/v1/thing/42") {
		t.Errorf("log should name the path:\n%s", logs.String())
	}
	if got := counterValue(t, "POST", "POST /v1/thing/{id}", "200"); got != before+1 {
		t.Errorf("metric is labelled by route pattern: got %v, want %v", got, before+1)
	}
}
