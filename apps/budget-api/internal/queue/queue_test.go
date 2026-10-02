package queue

import (
	"context"
	"database/sql"
	"errors"
	"io"
	"log/slog"
	"path/filepath"
	"testing"
	"time"

	"budget-app/apps/budget-api/internal/database"
	"budget-app/apps/budget-api/internal/queries"
)

func TestJobRoundTrip(t *testing.T) {
	payload, err := encodeJob(Job{ExpenseID: 42})
	if err != nil {
		t.Fatal(err)
	}
	got, err := decodeJob(payload)
	if err != nil || got != (Job{ExpenseID: 42}) {
		t.Fatalf("got %+v, %v", got, err)
	}
}

func TestDecodeJobRejectsGarbage(t *testing.T) {
	for _, body := range []string{"", "not json", "{}", `{"expense_id":0}`, `{"expense_id":-3}`} {
		if _, err := decodeJob(body); err == nil {
			t.Errorf("decodeJob(%q) should fail", body)
		}
	}
}

func TestSqliteDuration(t *testing.T) {
	for d, want := range map[time.Duration]string{time.Minute: "+60 seconds", 90 * time.Second: "+90 seconds", 0: "+0 seconds"} {
		if got := sqliteDuration(d); got != want {
			t.Errorf("sqliteDuration(%s) = %q, want %q", d, got, want)
		}
	}
}

func newQueries(t *testing.T) (*queries.Queries, *sql.DB, func(query string, args ...any) int) {
	t.Helper()
	db, err := database.Open(context.Background(), filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = db.Close() })
	count := func(query string, args ...any) int {
		t.Helper()
		var n int
		if err := db.QueryRow(query, args...).Scan(&n); err != nil {
			t.Fatal(err)
		}
		return n
	}
	return queries.New(db), db, count
}

func TestConsumerLifecycle(t *testing.T) {
	ctx := context.Background()
	q, db, count := newQueries(t)

	// Queueing the same job twice keeps one.
	if n, err := Enqueue(ctx, q, []Job{{ExpenseID: 1}, {ExpenseID: 1}, {ExpenseID: 2}}); err != nil || n != 3 {
		t.Fatalf("Enqueue = %d, %v", n, err)
	}
	if n := count(`SELECT COUNT(*) FROM jobs`); n != 2 {
		t.Fatalf("%d jobs queued, want 2", n)
	}

	var handled []int32
	c := &Consumer{
		Queries: q,
		Logger:  slog.New(slog.NewTextHandler(io.Discard, nil)),
		Lease:   time.Minute,
		Handle: func(_ context.Context, j Job) error {
			handled = append(handled, j.ExpenseID)
			if j.ExpenseID == 2 {
				return errors.New("model unavailable")
			}
			return nil
		},
		RetryDelay: time.Hour,
	}

	for range 3 {
		if _, err := c.runOne(ctx); err != nil {
			t.Fatal(err)
		}
	}
	if len(handled) != 2 {
		t.Fatalf("handled %v, want each job once (the failure waits out its delay)", handled)
	}
	if n := count(`SELECT COUNT(*) FROM jobs`); n != 1 {
		t.Fatalf("%d jobs left, want only the failed one", n)
	}
	if n := count(`SELECT COUNT(*) FROM jobs WHERE run_at > datetime('now') AND last_error = 'model unavailable' AND locked_until IS NULL`); n != 1 {
		t.Fatal("failed job was not rescheduled")
	}

	// Once it is due again and keeps failing, it is parked after MaxAttempts.
	if _, err := db.Exec(`UPDATE jobs SET run_at = datetime('now')`); err != nil {
		t.Fatal(err)
	}
	c.RetryDelay = time.Nanosecond
	for range MaxAttempts {
		if _, err := c.runOne(ctx); err != nil {
			t.Fatal(err)
		}
	}
	if n := count(`SELECT COUNT(*) FROM jobs WHERE dead_at IS NOT NULL AND attempts = ?`, MaxAttempts); n != 1 {
		t.Fatal("job was not parked after MaxAttempts")
	}
	if worked, err := c.runOne(ctx); worked || err != nil {
		t.Fatalf("a parked job ran again (%v, %v)", worked, err)
	}

	// A parked job doesn't block queueing the same work again.
	if _, err := Enqueue(ctx, q, []Job{{ExpenseID: 2}}); err != nil {
		t.Fatal(err)
	}
	if n := count(`SELECT COUNT(*) FROM jobs WHERE dead_at IS NULL`); n != 1 {
		t.Fatal("job was not queued again")
	}
}

func TestClaimedJobIsNotClaimedTwice(t *testing.T) {
	ctx := context.Background()
	q, _, _ := newQueries(t)
	if _, err := Enqueue(ctx, q, []Job{{ExpenseID: 7}}); err != nil {
		t.Fatal(err)
	}
	if _, err := q.ClaimJob(ctx, sqliteDuration(time.Minute)); err != nil {
		t.Fatal(err)
	}
	c := &Consumer{Queries: q, Lease: time.Minute, Logger: slog.New(slog.NewTextHandler(io.Discard, nil)),
		Handle: func(context.Context, Job) error { t.Fatal("ran a job another worker holds"); return nil }}
	if worked, err := c.runOne(ctx); worked || err != nil {
		t.Fatalf("runOne = %v, %v", worked, err)
	}
}
