package simplefin

import (
	"context"
	"encoding/base64"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"
)

func newTestClient(t *testing.T, handler http.Handler) (*Client, *httptest.Server) {
	t.Helper()
	srv := httptest.NewTLSServer(handler)
	t.Cleanup(srv.Close)
	u, _ := url.Parse(srv.URL)
	return NewClient(srv.Client(), []string{u.Hostname()}), srv
}

func withCreds(srvURL string) string {
	return strings.Replace(srvURL, "https://", "https://user:secret@", 1) + "/simplefin"
}

func TestClaimAccessURL(t *testing.T) {
	var srvURL string
	c, srv := newTestClient(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost || r.URL.Path != "/simplefin/claim/abc" {
			http.Error(w, "bad", http.StatusNotFound)
			return
		}
		_, _ = fmt.Fprint(w, withCreds(srvURL)+"\n")
	}))
	srvURL = srv.URL

	token := base64.StdEncoding.EncodeToString([]byte(srv.URL + "/simplefin/claim/abc"))
	got, err := c.ClaimAccessURL(context.Background(), " "+token+" ")
	if err != nil {
		t.Fatal(err)
	}
	if got != withCreds(srv.URL) {
		t.Fatalf("got %q", got)
	}
}

func TestClaimAccessURLRejects(t *testing.T) {
	c := NewClient(nil, nil)
	enc := func(s string) string { return base64.StdEncoding.EncodeToString([]byte(s)) }
	for name, token := range map[string]string{
		"not base64":     "%%%",
		"http scheme":    enc("http://bridge.simplefin.org/claim/x"),
		"untrusted host": enc("https://internal.example.com/claim/x"),
		"userinfo":       enc("https://a:b@bridge.simplefin.org/claim/x"),
	} {
		if _, err := c.ClaimAccessURL(context.Background(), token); !errors.Is(err, ErrInvalidToken) {
			t.Errorf("%s: want ErrInvalidToken, got %v", name, err)
		}
	}
}

func TestClaimAccessURLAlreadyUsed(t *testing.T) {
	c, srv := newTestClient(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusForbidden)
	}))
	token := base64.StdEncoding.EncodeToString([]byte(srv.URL + "/claim/x"))
	if _, err := c.ClaimAccessURL(context.Background(), token); !errors.Is(err, ErrInvalidToken) {
		t.Fatalf("want ErrInvalidToken, got %v", err)
	}
}

const accountsJSON = `{
  "errlist": [{"code": "con.auth", "msg": "Connection to Chase may need attention"}],
  "connections": [{"conn_id": "C0", "name": "Big Bank"}],
  "accounts": [{
    "id": "ACT-1", "name": "Checking", "conn_id": "C0", "currency": "USD", "balance": "100.50", "balance-date": 1700000000,
    "transactions": [
      {"id": "t1", "posted": 1700000100, "amount": "-12.34", "description": "Coffee"},
      {"id": "t2", "posted": 0, "amount": "-5.00", "description": "Pending thing", "pending": true},
      {"id": "t3", "posted": 1700000200, "amount": "oops", "description": "Bad amount"},
      {"id": "t4", "posted": 1700000300, "amount": "2000", "description": "Paycheck"}
    ]
  }]
}`

func TestFetchTransactions(t *testing.T) {
	var gotAuth, gotQuery, gotPath string
	c, srv := newTestClient(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotAuth = r.Header.Get("Authorization")
		gotQuery = r.URL.RawQuery
		gotPath = r.URL.Path
		_, _ = fmt.Fprint(w, accountsJSON)
	}))

	start := time.Unix(1700000000, 0)
	end := time.Unix(1700086400, 0)
	res, err := c.FetchTransactions(context.Background(), withCreds(srv.URL), start, end)
	if err != nil {
		t.Fatal(err)
	}
	if gotPath != "/simplefin/accounts" {
		t.Errorf("path = %q", gotPath)
	}
	if want := "Basic dXNlcjpzZWNyZXQ="; gotAuth != want {
		t.Errorf("auth = %q, want %q", gotAuth, want)
	}
	if strings.Contains(gotQuery, "pending") || !strings.Contains(gotQuery, "version=2") || !strings.Contains(gotQuery, "start-date=1700000000") || !strings.Contains(gotQuery, "end-date=1700086400") {
		t.Errorf("query = %q", gotQuery)
	}
	if len(res.Transactions) != 2 {
		t.Fatalf("want 2 transactions (pending and bad amounts skipped), got %+v", res.Transactions)
	}
	if got := res.Transactions[0]; got.ExternalID != "ACT-1:t1" || got.Amount != -12.34 || got.AccountName != "Checking" {
		t.Errorf("unexpected transaction %+v", got)
	}
	if len(res.Warnings) != 1 || len(res.Accounts) != 1 || res.Accounts[0].OrgName != "Big Bank" {
		t.Errorf("unexpected accounts/warnings: %+v", res)
	}
}

func TestFetchAccountsBalancesOnly(t *testing.T) {
	var gotQuery string
	c, srv := newTestClient(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotQuery = r.URL.RawQuery
		_, _ = fmt.Fprint(w, `{"errlist":[{"code":"con.auth","msg":"Login required"}],"connections":[{"conn_id":"C1","name":"Some CU"}],"accounts":[{"id":"A","name":"Savings","conn_id":"C1","balance":"5","balance-date":1700000000}]}`)
	}))
	res, err := c.FetchAccounts(context.Background(), withCreds(srv.URL))
	if err != nil {
		t.Fatal(err)
	}
	if gotQuery != "balances-only=1&version=2" {
		t.Errorf("query = %q", gotQuery)
	}
	if res.Accounts[0].OrgName != "Some CU" || len(res.Warnings) != 1 || res.Warnings[0] != "Login required" {
		t.Errorf("unexpected result %+v", res)
	}
}

func TestFetchErrors(t *testing.T) {
	for status, want := range map[int]error{403: ErrAccessRevoked, 402: ErrPaymentRequired} {
		c, srv := newTestClient(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(status)
		}))
		if _, err := c.FetchAccounts(context.Background(), withCreds(srv.URL)); !errors.Is(err, want) {
			t.Errorf("status %d: want %v, got %v", status, want, err)
		}
	}

	c, srv := newTestClient(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = fmt.Fprint(w, `{"errlist":[{"code":"gen.auth","msg":"everything is broken"}],"accounts":[]}`)
	}))
	_, err := c.FetchAccounts(context.Background(), withCreds(srv.URL))
	if err == nil || strings.Contains(err.Error(), "secret") {
		t.Errorf("want an error without credentials, got %v", err)
	}
}
