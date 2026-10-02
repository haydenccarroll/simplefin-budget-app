-- SQLite schema.
--
-- IDs are INTEGER PRIMARY KEY (an alias for the rowid, so they auto-increment).
-- Money is TEXT holding a decimal string such as "12.50" (the API formats and
-- parses it), so amounts are stored exactly. Times are UTC text, either written
-- by the database (CURRENT_TIMESTAMP) or by the driver from a UTC time.Time.
-- SQLite has no ON UPDATE CURRENT_TIMESTAMP, so updated_at is kept by the
-- triggers at the end.

-- Accounts. Usernames are stored lowercase. password_hash is an encoded argon2id
-- hash (see internal/auth/password.go); it is never sent to a client.
CREATE TABLE users (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    timezone TEXT NOT NULL DEFAULT 'America/Los_Angeles',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP,
    CONSTRAINT users_username_unique UNIQUE (username)
);

-- A sign-in. The token itself is only ever held by the client; token_hash is
-- its SHA-256, so a copy of this table can't be used to sign in. Times are UTC.
CREATE TABLE sessions (
    token_hash TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME NOT NULL
);
CREATE INDEX sessions_user_idx ON sessions (user_id);
CREATE INDEX sessions_expires_idx ON sessions (expires_at);

-- A budget has one owner and any number of members (roommates, a spouse), who
-- join with the budget's friend code. A user belongs to at most one budget, and
-- owns at most one. The friend code is NULL while the owner has joining switched
-- off; a unique index allows any number of NULLs.
CREATE TABLE budgets (
    id INTEGER PRIMARY KEY,
    owner_user_id TEXT NOT NULL REFERENCES users(id),
    friend_code TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT budgets_friend_code_unique UNIQUE (friend_code),
    CONSTRAINT budgets_owner_unique UNIQUE (owner_user_id)
);

-- The owner is a member too, so "which budget is this user in" is one lookup.
-- user_id is the primary key, which is what limits a user to one budget.
CREATE TABLE budget_members (
    user_id TEXT NOT NULL PRIMARY KEY REFERENCES users(id),
    budget_id INTEGER NOT NULL REFERENCES budgets(id) ON DELETE CASCADE,
    joined_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX budget_members_budget_idx ON budget_members (budget_id);

-- Months belong to a budget. user_id is who started the month.
CREATE TABLE budget_months (
    id INTEGER PRIMARY KEY,
    budget_id INTEGER NOT NULL REFERENCES budgets(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id),
    month DATE NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP,
    CONSTRAINT budget_months_budget_month_unique UNIQUE (budget_id, month)
);

-- Rows imported from a bank sync (external_id set) have no human creator.
-- external_id is unique within a month rather than across every budget, so two
-- budgets that share a bank login don't block each other's imports.
-- source_account_name is denormalized (rather than a foreign key to
-- bank_accounts) so it survives disconnecting SimpleFIN. Dates are optional:
-- rows entered by hand may have none, while bank-synced rows always carry the
-- posted date.
--
-- Entries made offline are queued on the device and sent later, possibly more than
-- once if the connection drops after the API saved one but before the app heard back.
-- The app gives each entry a random client_id, and the API treats a repeat of the same
-- client_id in the same month as the same entry instead of adding it twice.
CREATE TABLE income_items (
    id INTEGER PRIMARY KEY,
    budget_month_id INTEGER NOT NULL REFERENCES budget_months(id),
    name TEXT NOT NULL,
    planned_amount TEXT NOT NULL DEFAULT '0.00',
    received_at DATE,
    external_id TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP,
    created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    source_account_name TEXT,
    client_id TEXT,
    CONSTRAINT income_items_month_external_id_unique UNIQUE (budget_month_id, external_id),
    CONSTRAINT income_items_month_client_id_unique UNIQUE (budget_month_id, client_id)
);

-- description is a short note on what belongs in the category, shown to the LLM
-- that categorizes expenses (e.g. "restaurants, coffee shops, fast food, delivery").
CREATE TABLE category_groups (
    id INTEGER PRIMARY KEY,
    budget_month_id INTEGER NOT NULL REFERENCES budget_months(id),
    name TEXT NOT NULL,
    planned_amount TEXT NOT NULL DEFAULT '0.00',
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP,
    description TEXT
);
CREATE INDEX category_groups_month_idx ON category_groups (budget_month_id);

-- auto_categorized is set when the category was assigned automatically (by the
-- LLM) rather than chosen by a person; cleared when a person changes the
-- category.
CREATE TABLE expenses (
    id INTEGER PRIMARY KEY,
    budget_month_id INTEGER NOT NULL REFERENCES budget_months(id),
    category_group_id INTEGER REFERENCES category_groups(id),
    description TEXT NOT NULL,
    amount TEXT NOT NULL,
    transacted_at DATE,
    note TEXT,
    external_id TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP,
    created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    source_account_name TEXT,
    auto_categorized BOOLEAN NOT NULL DEFAULT 0,
    client_id TEXT,
    CONSTRAINT expenses_month_external_id_unique UNIQUE (budget_month_id, external_id),
    CONSTRAINT expenses_month_client_id_unique UNIQUE (budget_month_id, client_id)
);
CREATE INDEX expenses_category_group_idx ON expenses (category_group_id);

-- A budget's bank connection. The owner hands the API a SimpleFIN setup token,
-- the API claims it once and keeps only the access URL it gets back (the setup
-- token is single-use, so it is not stored); user_id records who connected it.
CREATE TABLE bank_connections (
    id INTEGER PRIMARY KEY,
    user_id TEXT NOT NULL,
    budget_id INTEGER NOT NULL REFERENCES budgets(id) ON DELETE CASCADE,
    access_url TEXT NOT NULL,
    last_synced_at TIMESTAMP,
    last_error TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP,
    CONSTRAINT bank_connections_budget_id_unique UNIQUE (budget_id)
);

-- Snapshot of the accounts behind each connection, refreshed whenever we talk
-- to the bridge. The bridge rate-limits requests, so listing accounts in the
-- app reads this table instead of hitting the bridge. balance is a decimal
-- string, like the other amounts.
CREATE TABLE bank_accounts (
    id INTEGER PRIMARY KEY,
    bank_connection_id INTEGER NOT NULL REFERENCES bank_connections(id) ON DELETE CASCADE,
    external_id TEXT NOT NULL,
    name TEXT NOT NULL,
    org_name TEXT NOT NULL DEFAULT '',
    currency TEXT NOT NULL DEFAULT '',
    balance TEXT,
    balance_date DATETIME,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT bank_accounts_connection_external_unique UNIQUE (bank_connection_id, external_id)
);

-- Budget-controlled settings for a bank account. Keyed by the bridge's account
-- ID rather than bank_accounts.id so they survive disconnecting and
-- reconnecting SimpleFIN.
CREATE TABLE bank_account_settings (
    budget_id INTEGER NOT NULL REFERENCES budgets(id) ON DELETE CASCADE,
    external_id TEXT NOT NULL,
    alias TEXT,
    invert_amounts BOOLEAN NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (budget_id, external_id)
);

-- Background work for the worker process (see internal/queue). A job is
-- claimed by setting locked_until; finishing deletes it, failing pushes run_at
-- back, and failing too often sets dead_at, which parks it for inspection. If a
-- worker dies mid-job the lock simply expires and the job runs again.
-- The unique index stops the same live job (same kind and payload) from being
-- queued twice; jobs are idempotent, so the one already queued is enough.
CREATE TABLE jobs (
    id INTEGER PRIMARY KEY,
    kind TEXT NOT NULL,
    payload TEXT NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    run_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    locked_until DATETIME,
    last_error TEXT,
    dead_at DATETIME,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX jobs_ready_idx ON jobs (run_at) WHERE dead_at IS NULL;
CREATE UNIQUE INDEX jobs_live_unique ON jobs (kind, payload) WHERE dead_at IS NULL;

-- updated_at upkeep. The WHEN clause skips updates that set updated_at
-- themselves, which also stops the trigger from re-firing on its own update.
CREATE TRIGGER users_updated_at AFTER UPDATE ON users FOR EACH ROW WHEN NEW.updated_at = OLD.updated_at
BEGIN UPDATE users SET updated_at = CURRENT_TIMESTAMP WHERE rowid = NEW.rowid; END;
CREATE TRIGGER budgets_updated_at AFTER UPDATE ON budgets FOR EACH ROW WHEN NEW.updated_at = OLD.updated_at
BEGIN UPDATE budgets SET updated_at = CURRENT_TIMESTAMP WHERE rowid = NEW.rowid; END;
CREATE TRIGGER budget_months_updated_at AFTER UPDATE ON budget_months FOR EACH ROW WHEN NEW.updated_at = OLD.updated_at
BEGIN UPDATE budget_months SET updated_at = CURRENT_TIMESTAMP WHERE rowid = NEW.rowid; END;
CREATE TRIGGER income_items_updated_at AFTER UPDATE ON income_items FOR EACH ROW WHEN NEW.updated_at = OLD.updated_at
BEGIN UPDATE income_items SET updated_at = CURRENT_TIMESTAMP WHERE rowid = NEW.rowid; END;
CREATE TRIGGER category_groups_updated_at AFTER UPDATE ON category_groups FOR EACH ROW WHEN NEW.updated_at = OLD.updated_at
BEGIN UPDATE category_groups SET updated_at = CURRENT_TIMESTAMP WHERE rowid = NEW.rowid; END;
CREATE TRIGGER expenses_updated_at AFTER UPDATE ON expenses FOR EACH ROW WHEN NEW.updated_at = OLD.updated_at
BEGIN UPDATE expenses SET updated_at = CURRENT_TIMESTAMP WHERE rowid = NEW.rowid; END;
CREATE TRIGGER bank_connections_updated_at AFTER UPDATE ON bank_connections FOR EACH ROW WHEN NEW.updated_at = OLD.updated_at
BEGIN UPDATE bank_connections SET updated_at = CURRENT_TIMESTAMP WHERE rowid = NEW.rowid; END;
CREATE TRIGGER bank_accounts_updated_at AFTER UPDATE ON bank_accounts FOR EACH ROW WHEN NEW.updated_at = OLD.updated_at
BEGIN UPDATE bank_accounts SET updated_at = CURRENT_TIMESTAMP WHERE rowid = NEW.rowid; END;
CREATE TRIGGER bank_account_settings_updated_at AFTER UPDATE ON bank_account_settings FOR EACH ROW WHEN NEW.updated_at = OLD.updated_at
BEGIN UPDATE bank_account_settings SET updated_at = CURRENT_TIMESTAMP WHERE rowid = NEW.rowid; END;
