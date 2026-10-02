// Package simplefin implements the client side of the SimpleFIN Protocol
// (https://www.simplefin.org/protocol.html) for pulling bank account
// transactions into the budget app.
//
// Flow:
//  1. The user pastes a "setup token" from their SimpleFIN bridge into the
//     app. The setup token is a base64-encoded "claim URL".
//  2. The app POSTs to the claim URL (no body) and gets back an "access
//     URL" — a permanent, credential-bearing URL used for all future data
//     fetches. This only happens once per bridge connection.
//  3. The app calls {accessURL}/accounts to pull accounts + transactions
//     for a date range.
//
// One access URL covers every account (across every institution) the user
// has linked at their bridge, so a single connection usually yields many
// accounts. A user can hold several connections (several access URLs) too.
package simplefin

import (
	"context"
	"time"
)

// Account is a bank account exposed by a SimpleFIN connection.
type Account struct {
	ID          string
	Name        string
	OrgName     string
	Currency    string
	Balance     string
	BalanceDate time.Time
}

// Transaction is a single bank transaction normalized for import into the
// budget app. Amount follows bank-statement sign convention: negative is
// money out (an expense), positive is money in (income).
type Transaction struct {
	// ExternalID is unique across all accounts (the bridge only guarantees
	// uniqueness within an account, so it is prefixed with the account ID).
	ExternalID  string
	AccountID   string
	AccountName string
	Description string
	Amount      float64
	Date        time.Time
}

// Result is what a bridge returned for one connection. Warnings are
// non-fatal problems the bridge reported (e.g. one institution needs
// re-authentication) while still returning data for the rest.
type Result struct {
	Accounts     []Account
	Transactions []Transaction
	Warnings     []string
	// Diagnostics describes what the bridge sent and what was dropped, for logging.
	Diagnostics Diagnostics
}

// Diagnostics counts what a fetch returned and what the client discarded.
type Diagnostics struct {
	// BridgeErrors are the raw errlist entries, as "code: msg".
	BridgeErrors []string
	// Accounts has one entry per account the bridge returned.
	Accounts []AccountDiagnostics
	// Pending, NoPostedDate and BadAmount count transactions dropped by the client.
	Pending, NoPostedDate, BadAmount int
}

// AccountDiagnostics is one account's share of a fetch.
type AccountDiagnostics struct {
	ID, Name     string
	Transactions int
	// Earliest and Latest are the posted dates of the account's kept transactions.
	Earliest, Latest time.Time
}

// Provider abstracts the SimpleFIN protocol.
type Provider interface {
	// ClaimAccessURL exchanges a one-time setup token for a durable access
	// URL that can be used for all future calls.
	ClaimAccessURL(ctx context.Context, setupToken string) (accessURL string, err error)

	// FetchAccounts lists the accounts (with balances) behind an access URL.
	FetchAccounts(ctx context.Context, accessURL string) (Result, error)

	// FetchTransactions returns all posted transactions within [start, end)
	// across every account behind an access URL. Pending transactions are
	// excluded: they have no posted date and their IDs can change once
	// they post.
	FetchTransactions(ctx context.Context, accessURL string, start, end time.Time) (Result, error)
}
