package middleware

import "net/http"

// MaxBodyBytes is the largest request body the API reads. Every endpoint takes
// a small JSON document, so anything bigger is a mistake or an attack.
const MaxBodyBytes = 1 << 20

// NewBodyLimit makes reading a request body fail once it passes MaxBodyBytes,
// which the handlers already report as a bad request.
func NewBodyLimit(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		r.Body = http.MaxBytesReader(w, r.Body, MaxBodyBytes)
		next.ServeHTTP(w, r)
	})
}
