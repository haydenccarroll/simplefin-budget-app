-- Budget months

-- Everything is scoped to a budget: a budget is shared by its members, and
-- user_id on a month only records who started it. Rows below a month (income,
-- categories, expenses) are reached through their month, so the lookups by ID
-- also join to it to be sure the row belongs to the caller's budget.

-- name: ListBudgetMonths :many
SELECT id, budget_id, user_id, month, created_at, updated_at
FROM budget_months
WHERE budget_id = ? AND deleted_at IS NULL
ORDER BY month DESC;

-- name: GetBudgetMonth :one
SELECT id, budget_id, user_id, month, created_at, updated_at
FROM budget_months
WHERE budget_id = ? AND month = ? AND deleted_at IS NULL
LIMIT 1;

-- name: GetLatestBudgetMonthBefore :one
SELECT id, budget_id, user_id, month, created_at, updated_at
FROM budget_months
WHERE budget_id = ? AND month < ? AND deleted_at IS NULL
ORDER BY month DESC
LIMIT 1;

-- name: CreateBudgetMonth :execresult
INSERT INTO budget_months (budget_id, user_id, month)
VALUES (?, ?, ?);

-- Income items

-- name: ListIncomeItemsByMonth :many
SELECT ii.id, ii.budget_month_id, ii.name, ii.planned_amount, ii.received_at, ii.sort_order,
       ii.external_id, ii.source_account_name, ii.created_by_user_id, u.first_name AS created_by_name
FROM income_items ii
LEFT JOIN users u ON u.id = ii.created_by_user_id
WHERE ii.budget_month_id = ? AND ii.deleted_at IS NULL
ORDER BY ii.sort_order ASC, ii.id ASC;

-- name: GetIncomeItem :one
SELECT ii.id, ii.budget_month_id, ii.name, ii.planned_amount, ii.received_at, ii.sort_order,
       ii.external_id, ii.source_account_name, ii.created_by_user_id, u.first_name AS created_by_name
FROM income_items ii
JOIN budget_months bm ON bm.id = ii.budget_month_id
LEFT JOIN users u ON u.id = ii.created_by_user_id
WHERE ii.id = ? AND bm.budget_id = ? AND ii.deleted_at IS NULL;

-- name: CreateIncomeItem :execresult
INSERT INTO income_items (budget_month_id, name, planned_amount, received_at, sort_order, created_by_user_id, client_id)
VALUES (?, ?, ?, ?, ?, ?, ?);

-- name: GetIncomeItemByClientID :one
SELECT id, name, planned_amount, received_at, sort_order
FROM income_items
WHERE budget_month_id = ? AND client_id = ? AND deleted_at IS NULL;

-- name: UpdateIncomeItem :exec
UPDATE income_items
SET name = ?, planned_amount = ?, received_at = ?, sort_order = ?
WHERE id = ?;

-- name: DeleteIncomeItem :exec
UPDATE income_items SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?;

-- Category groups

-- name: ListCategoryGroupsByMonth :many
SELECT id, budget_month_id, name, planned_amount, sort_order, description, created_at, updated_at
FROM category_groups
WHERE budget_month_id = ? AND deleted_at IS NULL
ORDER BY sort_order ASC, id ASC;

-- name: GetCategoryGroup :one
SELECT cg.id, cg.budget_month_id, cg.name, cg.planned_amount, cg.sort_order, cg.description, cg.created_at, cg.updated_at
FROM category_groups cg
JOIN budget_months bm ON bm.id = cg.budget_month_id
WHERE cg.id = ? AND bm.budget_id = ? AND cg.deleted_at IS NULL;

-- name: CreateCategoryGroup :execresult
INSERT INTO category_groups (budget_month_id, name, planned_amount, sort_order, description)
VALUES (?, ?, ?, ?, ?);

-- name: UpdateCategoryGroup :exec
UPDATE category_groups
SET name = ?, planned_amount = ?, sort_order = ?, description = ?
WHERE id = ?;

-- name: DeleteCategoryGroup :exec
UPDATE category_groups SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?;

-- Expenses

-- name: ListExpensesByMonth :many
SELECT e.id, e.budget_month_id, e.category_group_id, e.description, e.amount, e.transacted_at, e.note,
       e.external_id, e.source_account_name, e.auto_categorized, e.created_by_user_id, u.first_name AS created_by_name,
       cg.name AS category_name
FROM expenses e
LEFT JOIN users u ON u.id = e.created_by_user_id
LEFT JOIN category_groups cg ON cg.id = e.category_group_id AND cg.deleted_at IS NULL
WHERE e.budget_month_id = ? AND e.deleted_at IS NULL
ORDER BY (e.transacted_at IS NULL) DESC, e.transacted_at DESC, e.id DESC
LIMIT ? OFFSET ?;

-- name: CountExpensesByMonth :one
SELECT COUNT(*) FROM expenses
WHERE budget_month_id = ? AND deleted_at IS NULL;

-- name: GetExpense :one
SELECT e.id, e.budget_month_id, e.category_group_id, e.description, e.amount, e.transacted_at, e.note,
       e.external_id, e.source_account_name, e.auto_categorized, e.created_by_user_id, u.first_name AS created_by_name,
       cg.name AS category_name
FROM expenses e
LEFT JOIN users u ON u.id = e.created_by_user_id
LEFT JOIN category_groups cg ON cg.id = e.category_group_id AND cg.deleted_at IS NULL
WHERE e.id = ? AND e.deleted_at IS NULL;

-- The categorization worker has no caller, so it reads an expense by ID alone
-- (GetExpense above); requests use this one, which stays inside their budget.

-- name: GetExpenseInBudget :one
SELECT e.id, e.budget_month_id, e.category_group_id, e.description, e.amount, e.transacted_at, e.note,
       e.external_id, e.source_account_name, e.auto_categorized, e.created_by_user_id, u.first_name AS created_by_name,
       cg.name AS category_name
FROM expenses e
JOIN budget_months bm ON bm.id = e.budget_month_id
LEFT JOIN users u ON u.id = e.created_by_user_id
LEFT JOIN category_groups cg ON cg.id = e.category_group_id AND cg.deleted_at IS NULL
WHERE e.id = ? AND bm.budget_id = ? AND e.deleted_at IS NULL;

-- name: CreateExpense :execresult
INSERT INTO expenses (budget_month_id, category_group_id, description, amount, transacted_at, note, created_by_user_id, client_id)
VALUES (?, ?, ?, ?, ?, ?, ?, ?);

-- name: GetExpenseIDByClientID :one
SELECT id FROM expenses WHERE budget_month_id = ? AND client_id = ? AND deleted_at IS NULL;

-- name: UpdateExpense :exec
-- Saving an expense is a person confirming it, so it is no longer "automatic".
UPDATE expenses
SET category_group_id = ?, description = ?, amount = ?, transacted_at = ?, note = ?, auto_categorized = 0
WHERE id = ?;

-- name: DeleteExpense :exec
UPDATE expenses SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?;

-- name: SumSpentByCategoryGroupForMonth :many
SELECT category_group_id, COALESCE(SUM(amount), 0) AS spent
FROM expenses
WHERE budget_month_id = ? AND category_group_id IS NOT NULL AND deleted_at IS NULL
GROUP BY category_group_id;

-- name: SumSpentForMonth :one
SELECT COALESCE(SUM(amount), 0) AS total_spent
FROM expenses
WHERE budget_month_id = ? AND deleted_at IS NULL;


-- Every uncategorized expense in a month. Ones the model already declined are
-- included: anything uncategorized is worth another try.
-- name: ListUnassignedExpenseIDs :many
SELECT id FROM expenses
WHERE budget_month_id = ? AND category_group_id IS NULL AND deleted_at IS NULL
ORDER BY id;

-- Never overrides a category a person has already set.
-- name: SetExpenseAutoCategory :execresult
UPDATE expenses SET category_group_id = ?, auto_categorized = 1
WHERE id = ? AND category_group_id IS NULL AND deleted_at IS NULL;

-- name: ListAllExpensesByMonth :many
SELECT e.id, e.description, e.amount, e.transacted_at, e.note, e.source_account_name, e.external_id,
       u.first_name AS created_by_name, cg.name AS category_name
FROM expenses e
LEFT JOIN users u ON u.id = e.created_by_user_id
LEFT JOIN category_groups cg ON cg.id = e.category_group_id AND cg.deleted_at IS NULL
WHERE e.budget_month_id = ? AND e.deleted_at IS NULL
ORDER BY (e.transacted_at IS NULL) DESC, e.transacted_at ASC, e.id ASC;
