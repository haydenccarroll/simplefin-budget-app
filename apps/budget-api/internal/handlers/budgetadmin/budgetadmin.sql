-- name: GetMembership :one
SELECT m.budget_id, b.owner_user_id
FROM budget_members m
JOIN budgets b ON b.id = m.budget_id
WHERE m.user_id = ?;

-- name: GetBudget :one
SELECT id, owner_user_id, friend_code, created_at, updated_at
FROM budgets
WHERE id = ?;

-- name: GetBudgetByFriendCode :one
SELECT id, owner_user_id, friend_code, created_at, updated_at
FROM budgets
WHERE friend_code = ?;

-- name: CreateBudget :execresult
INSERT INTO budgets (owner_user_id)
VALUES (?);

-- name: AddBudgetMember :exec
INSERT INTO budget_members (user_id, budget_id)
VALUES (?, ?);

-- name: RemoveBudgetMember :execresult
DELETE FROM budget_members
WHERE user_id = ? AND budget_id = ?;

-- name: ListBudgetMembers :many
SELECT m.user_id, m.joined_at, u.username, u.first_name, u.last_name
FROM budget_members m
JOIN users u ON u.id = m.user_id
WHERE m.budget_id = ?
ORDER BY m.joined_at ASC, m.user_id ASC;

-- name: UpdateBudgetFriendCode :exec
UPDATE budgets SET friend_code = ? WHERE id = ?;

-- name: PurgeExpensesForBudget :exec
DELETE FROM expenses
WHERE budget_month_id IN (SELECT id FROM budget_months WHERE budget_id = ?);

-- name: PurgeIncomeItemsForBudget :exec
DELETE FROM income_items
WHERE budget_month_id IN (SELECT id FROM budget_months WHERE budget_id = ?);

-- name: PurgeCategoryGroupsForBudget :exec
DELETE FROM category_groups
WHERE budget_month_id IN (SELECT id FROM budget_months WHERE budget_id = ?);

-- name: PurgeBudgetMonthsForBudget :exec
DELETE FROM budget_months WHERE budget_id = ?;

-- name: PurgeBankConnectionForBudget :exec
DELETE FROM bank_connections WHERE budget_id = ?;

-- name: PurgeBankAccountSettingsForBudget :exec
DELETE FROM bank_account_settings WHERE budget_id = ?;

-- name: PurgeBudgetMembers :exec
DELETE FROM budget_members WHERE budget_id = ?;

-- name: DeleteBudget :exec
DELETE FROM budgets WHERE id = ?;
