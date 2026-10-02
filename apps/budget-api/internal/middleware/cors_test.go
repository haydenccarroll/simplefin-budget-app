package middleware

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"budget-app/apps/budget-api/internal/auth"
)

func TestCORS(t *testing.T) {
	called := false
	h := NewCORS(auth.NewOriginPolicy([]string{"http://localhost:8081"}), http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		called = true
	}))

	t.Run("preflight from an allowed origin", func(t *testing.T) {
		called = false
		req := httptest.NewRequest(http.MethodOptions, "/v1/x", nil)
		req.Header.Set("Origin", "http://localhost:8081")
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, req)
		got := rec.Header()
		if got.Get("Access-Control-Allow-Origin") != "http://localhost:8081" || got.Get("Access-Control-Allow-Credentials") != "true" {
			t.Errorf("headers = %v", got)
		}
		if got.Get("Access-Control-Allow-Origin") == "*" {
			t.Error("wildcard origin with credentials")
		}
		if called {
			t.Error("a preflight reached the handlers")
		}
	})

	t.Run("preflight from another origin gets nothing", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodOptions, "/v1/x", nil)
		req.Header.Set("Origin", "https://evil.example.com")
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, req)
		if rec.Header().Get("Access-Control-Allow-Origin") != "" {
			t.Errorf("headers = %v", rec.Header())
		}
	})

	t.Run("a real request from an allowed origin", func(t *testing.T) {
		called = false
		req := httptest.NewRequest(http.MethodGet, "/v1/x", nil)
		req.Header.Set("Origin", "http://localhost:8081")
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, req)
		if !called || rec.Header().Get("Access-Control-Allow-Origin") != "http://localhost:8081" {
			t.Errorf("called = %v, headers = %v", called, rec.Header())
		}
	})

	t.Run("a native request has no origin and gets no CORS headers", func(t *testing.T) {
		called = false
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/v1/x", nil))
		if !called || rec.Header().Get("Access-Control-Allow-Origin") != "" {
			t.Errorf("called = %v, headers = %v", called, rec.Header())
		}
	})
}
