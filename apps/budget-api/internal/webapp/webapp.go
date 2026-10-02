// Package webapp serves the web build of the app (expo export --platform web)
// from the API's own origin, so the browser app and the API share one site and
// the session cookie needs no cross-site allowances.
package webapp

import (
	"net/http"
	"os"
	"path"
	"path/filepath"
	"strings"
)

// Handler serves files from root. A path that isn't a file gets index.html, so
// the app's own routes work on reload; paths under /v1/ never do, so a wrong
// API call is still a 404 rather than a page of HTML.
func Handler(root string) http.Handler {
	files := http.FileServer(http.Dir(root))
	index := filepath.Join(root, "index.html")
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.HasPrefix(r.URL.Path, "/v1/") {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("X-Content-Type-Options", "nosniff")
		clean := path.Clean("/" + r.URL.Path)
		if info, err := os.Stat(filepath.Join(root, filepath.FromSlash(clean))); err == nil && !info.IsDir() {
			if strings.HasPrefix(clean, "/_expo/static/") {
				// Bundles are named by their content hash, so they never change.
				w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
			} else {
				w.Header().Set("Cache-Control", "no-cache")
			}
			files.ServeHTTP(w, r)
			return
		}
		// index.html names the current bundles, so it is always revalidated.
		w.Header().Set("Cache-Control", "no-cache")
		http.ServeFile(w, r, index)
	})
}
