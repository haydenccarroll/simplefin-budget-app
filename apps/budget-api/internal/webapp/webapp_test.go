package webapp

import (
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestHandler(t *testing.T) {
	root := t.TempDir()
	write := func(name, body string) {
		t.Helper()
		p := filepath.Join(root, name)
		if err := os.MkdirAll(filepath.Dir(p), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(p, []byte(body), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	write("index.html", "<html>app</html>")
	write("_expo/static/js/web/entry-abc.js", "bundle")
	write("favicon.ico", "icon")
	h := Handler(root)

	cases := []struct {
		path, wantBody, wantCache string
		wantStatus                int
	}{
		{"/", "<html>app</html>", "no-cache", 200},
		{"/budget/2026-09", "<html>app</html>", "no-cache", 200},
		{"/_expo/static/js/web/entry-abc.js", "bundle", "immutable", 200},
		{"/favicon.ico", "icon", "no-cache", 200},
		{"/../../etc/passwd", "invalid URL path", "", 400},
		{"/v1/nope", "404", "", 404},
	}
	for _, c := range cases {
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, c.path, nil))
		if rec.Code != c.wantStatus || !strings.Contains(rec.Body.String(), c.wantBody) || !strings.Contains(rec.Header().Get("Cache-Control"), c.wantCache) {
			t.Errorf("%s: got %d %q (Cache-Control %q)", c.path, rec.Code, rec.Body.String(), rec.Header().Get("Cache-Control"))
		}
	}
}
