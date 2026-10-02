-- Bank connections
--
-- Each budget has at most one connection, made when its owner submits a
-- SimpleFIN setup token (user_id records who). One access URL covers every
-- account linked at the SimpleFIN bridge, and every member of the budget syncs
-- through it.

-- name: GetBankConnectionForBudget :one
-- Column order matches the table so sqlc returns the BankConnection model.
SELECT id, user_id, budget_id, access_url, last_synced_at, last_error, created_at, updated_at, deleted_at
FROM bank_connections
WHERE budget_id = ? AND deleted_at IS NULL;

-- name: UpsertBankConnection :exec
-- Stores the access URL from a successfully claimed token, replacing any
-- earlier connection for the budget.
INSERT INTO bank_connections (budget_id, user_id, access_url)
VALUES (?, ?, ?)
ON CONFLICT (budget_id) DO UPDATE SET
    user_id = excluded.user_id,
    access_url = excluded.access_url,
    last_error = NULL,
    last_synced_at = NULL;

-- The access URL is a credential, so removing a connection deletes the row
-- outright rather than soft-deleting it.
-- name: DeleteBankConnectionForBudget :execresult
DELETE FROM bank_connections WHERE budget_id = ?;

-- Whether the budget month was successfully synced within the last 15 minutes
-- (syncMinInterval in sync.go; keep the two in step). The throttle is per month.
-- name: BudgetMonthSyncedRecently :one
SELECT COUNT(*) FROM budget_month_syncs
WHERE budget_month_id = ? AND synced_at > datetime('now', '-15 minutes');

-- name: MarkBudgetMonthSynced :exec
INSERT INTO budget_month_syncs (budget_month_id, synced_at) VALUES (?, CURRENT_TIMESTAMP)
ON CONFLICT (budget_month_id) DO UPDATE SET synced_at = excluded.synced_at;

-- name: MarkBankConnectionSynced :exec
UPDATE bank_connections SET last_synced_at = CURRENT_TIMESTAMP, last_error = NULL WHERE id = ?;

-- Lets the next sync of any month run straight away instead of waiting out the 15 minutes.
-- name: ClearBankConnectionSynced :exec
DELETE FROM budget_month_syncs
WHERE budget_month_id IN (SELECT id FROM budget_months WHERE budget_id = ?);

-- name: MarkBankConnectionFailed :exec
UPDATE bank_connections SET last_error = ? WHERE id = ?;

-- Bank accounts

-- name: UpsertBankAccount :exec
INSERT INTO bank_accounts (bank_connection_id, external_id, name, org_name, currency, balance, balance_date)
VALUES (?, ?, ?, ?, ?, ?, ?)
ON CONFLICT (bank_connection_id, external_id) DO UPDATE SET
    name = excluded.name,
    org_name = excluded.org_name,
    currency = excluded.currency,
    balance = excluded.balance,
    balance_date = excluded.balance_date;

-- name: DeleteBankAccountsNotIn :exec
DELETE FROM bank_accounts
WHERE bank_connection_id = ? AND external_id NOT IN (sqlc.slice('external_ids'));

-- name: ListBankAccounts :many
SELECT a.id, a.bank_connection_id, a.external_id, a.name, a.org_name, a.currency, a.balance, a.balance_date,
       s.alias, COALESCE(s.invert_amounts, 0) AS invert_amounts
FROM bank_accounts a
JOIN bank_connections bc ON bc.id = a.bank_connection_id
LEFT JOIN bank_account_settings s ON s.external_id = a.external_id AND s.budget_id = bc.budget_id
WHERE a.bank_connection_id = ?
ORDER BY a.org_name, a.name;

-- name: GetBankAccount :one
SELECT a.id, a.bank_connection_id, a.external_id, a.name, a.org_name, a.currency, a.balance, a.balance_date,
       s.alias, COALESCE(s.invert_amounts, 0) AS invert_amounts
FROM bank_accounts a
JOIN bank_connections bc ON bc.id = a.bank_connection_id
LEFT JOIN bank_account_settings s ON s.external_id = a.external_id AND s.budget_id = bc.budget_id
WHERE a.id = ? AND bc.budget_id = ?;

-- Account settings

-- name: ListBankAccountSettings :many
SELECT external_id, alias, invert_amounts FROM bank_account_settings WHERE budget_id = ?;

-- name: UpsertBankAccountSettings :exec
INSERT INTO bank_account_settings (budget_id, external_id, alias, invert_amounts)
VALUES (?, ?, ?, ?)
ON CONFLICT (budget_id, external_id) DO UPDATE SET alias = excluded.alias, invert_amounts = excluded.invert_amounts;

-- Synced rows have external IDs of the form "<account id>:<transaction id>",
-- so an account's rows are found by that prefix.

-- name: RenameSyncedExpenses :exec
UPDATE expenses SET source_account_name = sqlc.arg(name)
WHERE external_id LIKE CAST(sqlc.arg(account_id) AS TEXT) || ':%'
  AND budget_month_id IN (SELECT id FROM budget_months WHERE budget_id = sqlc.arg(budget_id));

-- name: RenameSyncedIncomeItems :exec
UPDATE income_items SET source_account_name = sqlc.arg(name)
WHERE external_id LIKE CAST(sqlc.arg(account_id) AS TEXT) || ':%'
  AND budget_month_id IN (SELECT id FROM budget_months WHERE budget_id = sqlc.arg(budget_id));

-- Flipping an account's sign makes its imported rows wrong, so they are
-- removed outright for the next sync to re-import. Rows the user deleted
-- (soft-deleted) are left, so they stay excluded.

-- name: PurgeSyncedExpensesForAccount :exec
DELETE FROM expenses WHERE external_id LIKE CAST(sqlc.arg(account_id) AS TEXT) || ':%' AND deleted_at IS NULL
  AND budget_month_id IN (SELECT id FROM budget_months WHERE budget_id = sqlc.arg(budget_id));

-- name: PurgeSyncedIncomeItemsForAccount :exec
DELETE FROM income_items WHERE external_id LIKE CAST(sqlc.arg(account_id) AS TEXT) || ':%' AND deleted_at IS NULL
  AND budget_month_id IN (SELECT id FROM budget_months WHERE budget_id = sqlc.arg(budget_id));

-- Transfers found after being imported are soft-deleted, which also keeps
-- them from being re-imported (external_id stays unique).

-- name: RemoveSyncedExpense :exec
UPDATE expenses SET deleted_at = CURRENT_TIMESTAMP
WHERE external_id = sqlc.arg(external_id) AND deleted_at IS NULL
  AND budget_month_id IN (SELECT id FROM budget_months WHERE budget_id = sqlc.arg(budget_id));

-- name: RemoveSyncedIncomeItem :exec
UPDATE income_items SET deleted_at = CURRENT_TIMESTAMP
WHERE external_id = sqlc.arg(external_id) AND deleted_at IS NULL
  AND budget_month_id IN (SELECT id FROM budget_months WHERE budget_id = sqlc.arg(budget_id));

-- Sync imports
--
-- Both inserts do nothing on a clash with the unique index on external_id, so
-- re-syncing a month that was already imported (unique per budget month) silently no-ops for
-- transactions we've already seen (RowsAffected() is 0) instead of
-- duplicating them.

-- name: CreateExpenseFromSync :execresult
INSERT INTO expenses (budget_month_id, category_group_id, description, amount, transacted_at, note, external_id, source_account_name)
VALUES (?, NULL, ?, ?, ?, ?, ?, ?)
ON CONFLICT (budget_month_id, external_id) DO NOTHING;

-- name: CreateIncomeItemFromSync :execresult
INSERT INTO income_items (budget_month_id, name, planned_amount, received_at, sort_order, external_id, source_account_name)
VALUES (?, ?, ?, ?, ?, ?, ?)
ON CONFLICT (budget_month_id, external_id) DO NOTHING;
