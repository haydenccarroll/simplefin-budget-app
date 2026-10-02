package middleware

import (
	"net/http"

	"budget-app/apps/budget-api/internal/auth"
)

// NewCORS lets the web app call the API from a browser. Only the configured
// origins get CORS headers, and they get credentials too, because the browser
// session is a cookie: a wildcard would be refused for credentialed requests,
// and would be wrong to allow anyway. Native apps send no Origin and don't need
// any of this.
func NewCORS(origins auth.OriginPolicy, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if origin := r.Header.Get("Origin"); origin != "" && origins.Listed(origin) {
			h := w.Header()
			h.Set("Access-Control-Allow-Origin", origin)
			h.Set("Access-Control-Allow-Credentials", "true")
			h.Add("Vary", "Origin")
			if r.Method == http.MethodOptions {
				h.Set("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS")
				h.Set("Access-Control-Allow-Headers", "Authorization, Content-Type, "+auth.TokenModeHeader)
				h.Set("Access-Control-Max-Age", "600")
				w.WriteHeader(http.StatusNoContent)
				return
			}
		} else if r.Method == http.MethodOptions {
			// A preflight from an origin that isn't allowed: no headers, so the browser refuses.
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}
