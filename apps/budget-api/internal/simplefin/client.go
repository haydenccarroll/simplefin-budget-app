package simplefin

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"
)

// DefaultAllowedClaimHosts are the public SimpleFIN Bridge hosts. Setup
// tokens are user-supplied and the server POSTs to whatever URL they decode
// to, so claim URLs are restricted to known bridges
var DefaultAllowedClaimHosts = []string{"bridge.simplefin.org", "beta-bridge.simplefin.org"}

// maxResponseBytes bounds how much of a bridge response is read.
const maxResponseBytes = 32 << 20

// Client is the real SimpleFIN Protocol implementation, talking to
// whatever bridge issued the setup token (e.g. bridge.simplefin.org).
type Client struct {
	HTTPClient        *http.Client
	AllowedClaimHosts []string
}

// NewClient returns a Client. A nil httpClient gets a 30s timeout; empty
// allowedClaimHosts falls back to DefaultAllowedClaimHosts.
func NewClient(httpClient *http.Client, allowedClaimHosts []string) *Client {
	if httpClient == nil {
		httpClient = &http.Client{Timeout: 30 * time.Second}
	}
	if len(allowedClaimHosts) == 0 {
		allowedClaimHosts = DefaultAllowedClaimHosts
	}
	return &Client{HTTPClient: httpClient, AllowedClaimHosts: allowedClaimHosts}
}

// ErrInvalidToken means the setup token could not be used: malformed, for
// a host we don't trust, or already claimed.
var ErrInvalidToken = errors.New("invalid setup token")

// ErrAccessRevoked means the bridge rejected the stored access URL, so the
// user must connect again with a new setup token.
var ErrAccessRevoked = errors.New("bank connection access was revoked; reconnect with a new setup token")

// ErrPaymentRequired means the user's SimpleFIN subscription has lapsed.
var ErrPaymentRequired = errors.New("SimpleFIN subscription payment is required")

// ClaimAccessURL implements Provider.ClaimAccessURL. The setup token is a
// base64-encoded claim URL; POSTing to that URL (once — it's single use)
// returns the durable access URL as the entire response body.
func (c *Client) ClaimAccessURL(ctx context.Context, setupToken string) (string, error) {
	decoded, err := base64.StdEncoding.DecodeString(strings.TrimSpace(setupToken))
	if err != nil {
		return "", fmt.Errorf("%w: not valid base64", ErrInvalidToken)
	}
	claimURL, err := url.Parse(string(decoded))
	if err != nil || claimURL.Scheme != "https" || claimURL.User != nil {
		return "", fmt.Errorf("%w: claim url must be a plain https url", ErrInvalidToken)
	}
	if !c.hostAllowed(claimURL.Hostname()) {
		return "", fmt.Errorf("%w: %q is not a trusted SimpleFIN bridge", ErrInvalidToken, claimURL.Hostname())
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, claimURL.String(), nil)
	if err != nil {
		return "", fmt.Errorf("build claim request: %w", err)
	}
	resp, err := c.HTTPClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("claim access url: %w", err)
	}
	defer func() { _ = resp.Body.Close() }()

	body, err := io.ReadAll(io.LimitReader(resp.Body, 1<<16))
	if err != nil {
		return "", fmt.Errorf("read claim response: %w", err)
	}
	switch resp.StatusCode {
	case http.StatusOK:
	case http.StatusForbidden:
		return "", fmt.Errorf("%w: token does not exist or was already used", ErrInvalidToken)
	default:
		return "", fmt.Errorf("claim access url: bridge returned %d", resp.StatusCode)
	}

	accessURL := strings.TrimSpace(string(body))
	if u, err := url.Parse(accessURL); err != nil || u.Scheme != "https" || u.User == nil {
		return "", fmt.Errorf("bridge returned an unexpected access url")
	}
	return accessURL, nil
}

func (c *Client) hostAllowed(host string) bool {
	for _, allowed := range c.AllowedClaimHosts {
		if strings.EqualFold(host, allowed) {
			return true
		}
	}
	return false
}

// Wire types for SimpleFIN Protocol v2, which reports problems as errlist and
// names each account's institution through the connections list. Requests ask
// for it with version=2; v1 responses are not supported.
type accountsResponse struct {
	ErrList     []errorEntry `json:"errlist"`
	Connections []connection `json:"connections"`
	Accounts    []account    `json:"accounts"`
}

type errorEntry struct {
	Code string `json:"code"`
	Msg  string `json:"msg"`
}

type connection struct {
	ConnID string `json:"conn_id"`
	Name   string `json:"name"`
}

type account struct {
	ID           string        `json:"id"`
	Name         string        `json:"name"`
	ConnID       string        `json:"conn_id"`
	Currency     string        `json:"currency"`
	Balance      string        `json:"balance"`
	BalanceDate  int64         `json:"balance-date"`
	Transactions []transaction `json:"transactions"`
}

type transaction struct {
	ID          string `json:"id"`
	Posted      int64  `json:"posted"`
	Amount      string `json:"amount"`
	Description string `json:"description"`
	Pending     bool   `json:"pending"`
}

// FetchAccounts implements Provider.FetchAccounts.
func (c *Client) FetchAccounts(ctx context.Context, accessURL string) (Result, error) {
	return c.fetch(ctx, accessURL, url.Values{"balances-only": {"1"}})
}

// FetchTransactions implements Provider.FetchTransactions against
// {accessURL}/accounts, per the SimpleFIN Protocol.
func (c *Client) FetchTransactions(ctx context.Context, accessURL string, start, end time.Time) (Result, error) {
	return c.fetch(ctx, accessURL, url.Values{
		"start-date": {strconv.FormatInt(start.Unix(), 10)},
		"end-date":   {strconv.FormatInt(end.Unix(), 10)},
	})
}

func (c *Client) fetch(ctx context.Context, accessURL string, query url.Values) (Result, error) {
	u, err := url.Parse(accessURL)
	if err != nil {
		return Result{}, fmt.Errorf("stored access url is malformed")
	}
	// Send credentials as an explicit Basic auth header and strip them from
	// the URL so they can't leak into error messages or logs.
	user := u.User
	u.User = nil
	u.Path = strings.TrimRight(u.Path, "/") + "/accounts"
	query.Set("version", "2")
	u.RawQuery = query.Encode()

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u.String(), nil)
	if err != nil {
		return Result{}, fmt.Errorf("build accounts request: %w", err)
	}
	if user != nil {
		password, _ := user.Password()
		req.SetBasicAuth(user.Username(), password)
	}

	resp, err := c.HTTPClient.Do(req)
	if err != nil {
		return Result{}, fmt.Errorf("fetch accounts: %w", err)
	}
	defer func() { _ = resp.Body.Close() }()

	switch resp.StatusCode {
	case http.StatusOK:
	case http.StatusForbidden:
		return Result{}, ErrAccessRevoked
	case http.StatusPaymentRequired:
		return Result{}, ErrPaymentRequired
	default:
		return Result{}, fmt.Errorf("fetch accounts: bridge returned %d", resp.StatusCode)
	}

	var parsed accountsResponse
	if err := json.NewDecoder(io.LimitReader(resp.Body, maxResponseBytes)).Decode(&parsed); err != nil {
		return Result{}, fmt.Errorf("parse accounts response: %w", err)
	}

	connNames := make(map[string]string, len(parsed.Connections))
	for _, conn := range parsed.Connections {
		connNames[conn.ConnID] = conn.Name
	}

	var out Result
	for _, e := range parsed.ErrList {
		out.Warnings = append(out.Warnings, e.Msg)
		out.Diagnostics.BridgeErrors = append(out.Diagnostics.BridgeErrors, e.Code+": "+e.Msg)
	}

	for _, acc := range parsed.Accounts {
		out.Accounts = append(out.Accounts, Account{
			ID:          acc.ID,
			Name:        acc.Name,
			OrgName:     connNames[acc.ConnID],
			Currency:    acc.Currency,
			Balance:     acc.Balance,
			BalanceDate: time.Unix(acc.BalanceDate, 0).UTC(),
		})

		ad := AccountDiagnostics{ID: acc.ID, Name: acc.Name}
		for _, t := range acc.Transactions {
			if t.Pending {
				out.Diagnostics.Pending++
				continue
			}
			if t.Posted == 0 {
				out.Diagnostics.NoPostedDate++
				continue
			}
			amount, err := strconv.ParseFloat(t.Amount, 64)
			if err != nil {
				out.Diagnostics.BadAmount++
				continue
			}
			posted := time.Unix(t.Posted, 0).UTC()
			if ad.Transactions == 0 || posted.Before(ad.Earliest) {
				ad.Earliest = posted
			}
			if posted.After(ad.Latest) {
				ad.Latest = posted
			}
			ad.Transactions++
			out.Transactions = append(out.Transactions, Transaction{
				ExternalID:  acc.ID + ":" + t.ID,
				AccountID:   acc.ID,
				AccountName: acc.Name,
				Description: t.Description,
				Amount:      amount,
				Date:        posted,
			})
		}
		out.Diagnostics.Accounts = append(out.Diagnostics.Accounts, ad)
	}

	// Bridges report per-institution problems as errors alongside data for
	// the healthy ones. Only treat it as a failure when nothing came back.
	if len(out.Accounts) == 0 && len(out.Warnings) > 0 {
		return Result{}, fmt.Errorf("bridge reported errors: %s", strings.Join(out.Warnings, "; "))
	}
	return out, nil
}
