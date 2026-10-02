package auth

import (
	"net/http"
	"net/url"
	"strings"
)

// OriginPolicy decides which browser origins may talk to the API.
//
// A web page is allowed if its origin is in the configured list (the app served
// from somewhere other than the API, e.g. Expo's dev server) or is the API's own
// origin. Native apps send no Origin header and are unaffected.
type OriginPolicy struct {
	allowed map[string]bool
}

// NewOriginPolicy builds a policy from origins like "https://app.example.com".
func NewOriginPolicy(origins []string) OriginPolicy {
	p := OriginPolicy{allowed: make(map[string]bool, len(origins))}
	for _, o := range origins {
		if o = normalizeOrigin(o); o != "" {
			p.allowed[o] = true
		}
	}
	return p
}

// normalizeOrigin lowercases an origin and drops any trailing slash or path.
func normalizeOrigin(o string) string {
	u, err := url.Parse(strings.TrimSpace(o))
	if err != nil || u.Scheme == "" || u.Host == "" {
		return ""
	}
	return strings.ToLower(u.Scheme + "://" + u.Host)
}

// Listed reports whether origin is one of the configured ones. This is what
// CORS uses: a page on the API's own origin needs no CORS headers.
func (p OriginPolicy) Listed(origin string) bool {
	return p.allowed[normalizeOrigin(origin)]
}

// Allows reports whether a request from origin may be served: it is a
// configured origin, or the API's own.
func (p OriginPolicy) Allows(origin string, r *http.Request) bool {
	if p.Listed(origin) {
		return true
	}
	u, err := url.Parse(origin)
	return err == nil && u.Host != "" && strings.EqualFold(u.Host, r.Host)
}
