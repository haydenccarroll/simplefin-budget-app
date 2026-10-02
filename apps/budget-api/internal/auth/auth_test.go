package auth

import (
	"context"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"budget-app/apps/budget-api/internal/identity"
)

func TestPasswordRoundTrip(t *testing.T) {
	hash, err := HashPassword("correct horse battery staple")
	if err != nil {
		t.Fatal(err)
	}
	if !strings.HasPrefix(hash, "$argon2id$") {
		t.Errorf("hash = %q", hash)
	}
	if err := VerifyPassword("correct horse battery staple", hash); err != nil {
		t.Errorf("right password rejected: %v", err)
	}
	if err := VerifyPassword("wrong", hash); err != ErrMismatch {
		t.Errorf("wrong password: err = %v, want ErrMismatch", err)
	}
	other, _ := HashPassword("correct horse battery staple")
	if other == hash {
		t.Error("two hashes of the same password are identical: the salt isn't random")
	}
	for _, bad := range []string{"", "plain", "$argon2id$v=19$m=1,t=1,p=1$!!$!!", "$bcrypt$x$y$z$w"} {
		if err := VerifyPassword("x", bad); err == nil || err == ErrMismatch {
			t.Errorf("VerifyPassword(%q) = %v, want a malformed-hash error", bad, err)
		}
	}
}

func TestPasswordPolicy(t *testing.T) {
	for pw, ok := range map[string]bool{
		"":                       false,
		"1234567":                false,
		"12345678":               true,
		strings.Repeat("a", 128): true,
		strings.Repeat("a", 129): false,
		strings.Repeat("é", 8):   true, // counted in characters, not bytes
	} {
		if got := CheckPasswordPolicy(pw) == nil; got != ok {
			t.Errorf("CheckPasswordPolicy(%d chars) = %v, want %v", len([]rune(pw)), got, ok)
		}
	}
}

func TestSessionToken(t *testing.T) {
	token, hash, err := NewSessionToken()
	if err != nil {
		t.Fatal(err)
	}
	if len(token) < 40 || hash != HashToken(token) || hash == token || len(hash) != 64 {
		t.Errorf("token = %q, hash = %q", token, hash)
	}
	other, _, _ := NewSessionToken()
	if other == token {
		t.Error("tokens repeat")
	}
}

func TestOriginPolicy(t *testing.T) {
	p := NewOriginPolicy([]string{"https://app.example.com/", "HTTP://localhost:8081"})
	r := httptest.NewRequest(http.MethodPost, "http://api.example.com/v1/x", nil)
	r.Host = "api.example.com"
	for origin, want := range map[string]bool{
		"https://app.example.com":          true,
		"http://localhost:8081":            true,
		"http://api.example.com":           true, // the API's own origin
		"https://evil.example.com":         false,
		"https://app.example.com.evil.com": false,
		"http://localhost:9999":            false,
		"null":                             false,
		"":                                 false,
	} {
		if got := p.Allows(origin, r); got != want {
			t.Errorf("Allows(%q) = %v, want %v", origin, got, want)
		}
	}
	if p.Listed("http://api.example.com") {
		t.Error("the API's own origin should not need CORS headers")
	}
}

type fakeStore map[string]string // token hash -> user id

func (f fakeStore) UserForSession(_ context.Context, hash string, _ time.Time) (string, error) {
	if id, ok := f[hash]; ok {
		return id, nil
	}
	return "", ErrNoSession
}

func TestAuthenticate(t *testing.T) {
	store := fakeStore{HashToken("good-token"): "user-1"}
	origins := NewOriginPolicy([]string{"http://localhost:8081"})
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	var gotUser string
	h := Authenticate(store, origins, logger, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotUser = identity.UserID(r)
	}))

	tests := []struct {
		name       string
		method     string
		headers    map[string]string
		cookie     string
		wantStatus int
		wantUser   string
	}{
		{"bearer", "POST", map[string]string{"Authorization": "Bearer good-token"}, "", 200, "user-1"},
		{"bearer needs no origin", "DELETE", map[string]string{"Authorization": "Bearer good-token"}, "", 200, "user-1"},
		{"bad bearer", "GET", map[string]string{"Authorization": "Bearer nope"}, "", 200, ""},
		{"non-bearer scheme", "GET", map[string]string{"Authorization": "Basic Zm9vOmJhcg=="}, "", 200, ""},
		{"bearer beats cookie", "GET", map[string]string{"Authorization": "Bearer nope"}, "good-token", 200, ""},
		{"cookie GET", "GET", nil, "good-token", 200, "user-1"},
		{"cookie POST from listed origin", "POST", map[string]string{"Origin": "http://localhost:8081"}, "good-token", 200, "user-1"},
		{"cookie POST same origin", "POST", map[string]string{"Origin": "http://api.test"}, "good-token", 200, "user-1"},
		{"cookie POST from another site", "POST", map[string]string{"Origin": "https://evil.example.com"}, "good-token", 403, ""},
		{"cookie POST with no origin", "POST", nil, "good-token", 403, ""},
		{"cookie DELETE with no origin", "DELETE", nil, "good-token", 403, ""},
		{"bad cookie POST", "POST", map[string]string{"Origin": "http://localhost:8081"}, "stale", 200, ""},
		{"anonymous POST from another site", "POST", map[string]string{"Origin": "https://evil.example.com"}, "", 403, ""},
		{"anonymous POST no origin (native login)", "POST", nil, "", 200, ""},
		{"a client-sent X-User-ID is not believed", "GET", map[string]string{"X-User-ID": "user-1"}, "", 200, ""},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			gotUser = ""
			req := httptest.NewRequest(tt.method, "http://api.test/v1/x", nil)
			for k, v := range tt.headers {
				req.Header.Set(k, v)
			}
			if tt.cookie != "" {
				req.AddCookie(&http.Cookie{Name: CookieName, Value: tt.cookie})
			}
			rec := httptest.NewRecorder()
			h.ServeHTTP(rec, req)
			if rec.Code != tt.wantStatus {
				t.Errorf("status = %d, want %d", rec.Code, tt.wantStatus)
			}
			if gotUser != tt.wantUser {
				t.Errorf("user = %q, want %q", gotUser, tt.wantUser)
			}
		})
	}
}

func TestSessionCookieAttributes(t *testing.T) {
	rec := httptest.NewRecorder()
	SetSessionCookie(rec, "tok", time.Now().Add(time.Hour), true)
	c := rec.Result().Cookies()[0]
	if !c.HttpOnly || !c.Secure || c.SameSite != http.SameSiteLaxMode || c.Path != "/" || c.Value != "tok" {
		t.Errorf("cookie = %+v", c)
	}
	rec = httptest.NewRecorder()
	ClearSessionCookie(rec, false)
	if c := rec.Result().Cookies()[0]; c.MaxAge >= 0 || c.Value != "" {
		t.Errorf("clearing cookie = %+v", c)
	}
}
