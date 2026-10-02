-- When each budget month was last successfully synced from the bank. The sync throttle
-- is per month, so syncing one month doesn't hold off the next.
CREATE TABLE budget_month_syncs (
    budget_month_id INTEGER PRIMARY KEY REFERENCES budget_months(id) ON DELETE CASCADE,
    synced_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
