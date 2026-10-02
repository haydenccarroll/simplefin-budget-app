// Package database opens the SQLite database and keeps its schema up to date.
//
// The API and the worker open the same file. SQLite allows one writer at a
// time, so the connection is set up to wait for the write lock (busy_timeout)
// instead of failing, to take it at the start of a transaction (immediate
// transactions can't deadlock upgrading a read lock), and to use the
// write-ahead log so reads carry on during a write.
package database

import (
	"context"
	"database/sql"
	"embed"
	"errors"
	"fmt"
	"io/fs"
	"net/url"
	"path"
	"sort"
	"strconv"
	"strings"

	"modernc.org/sqlite"
	sqlite3 "modernc.org/sqlite/lib"
)

// DriverName is the database/sql driver registered by modernc.org/sqlite.
const DriverName = "sqlite"

//go:embed migrations/*.sql
var migrations embed.FS

// DSN turns a file path into a connection string with the settings above.
// Times are written in SQLite's own format so they compare correctly with
// CURRENT_TIMESTAMP.
func DSN(file string) string {
	params := url.Values{}
	params.Add("_pragma", "foreign_keys(1)")
	params.Add("_pragma", "journal_mode(WAL)")
	params.Add("_pragma", "synchronous(NORMAL)")
	params.Add("_pragma", "busy_timeout(10000)")
	params.Set("_txlock", "immediate")
	params.Set("_time_format", "sqlite")
	return "file:" + file + "?" + params.Encode()
}

// Open opens the database at file (creating it if needed) and applies any
// migrations it hasn't had yet.
func Open(ctx context.Context, file string) (*sql.DB, error) {
	db, err := sql.Open(DriverName, DSN(file))
	if err != nil {
		return nil, fmt.Errorf("open database: %w", err)
	}
	if err := Migrate(ctx, db); err != nil {
		_ = db.Close()
		return nil, err
	}
	return db, nil
}

// Migrate applies the embedded migrations in name order, each in its own
// transaction, recording the applied ones in schema_migrations. It is safe for
// the API and the worker to run at the same time: the transactions take the
// write lock, and each one re-checks what has been applied.
func Migrate(ctx context.Context, db *sql.DB) error {
	if _, err := db.ExecContext(ctx, `CREATE TABLE IF NOT EXISTS schema_migrations (
		version INTEGER PRIMARY KEY,
		applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
	)`); err != nil {
		return fmt.Errorf("create schema_migrations: %w", err)
	}

	names, err := fs.Glob(migrations, "migrations/*.sql")
	if err != nil {
		return err
	}
	sort.Strings(names)
	for _, name := range names {
		version, err := migrationVersion(name)
		if err != nil {
			return err
		}
		body, err := migrations.ReadFile(name)
		if err != nil {
			return err
		}
		if err := apply(ctx, db, version, string(body)); err != nil {
			return fmt.Errorf("migration %s: %w", path.Base(name), err)
		}
	}
	return nil
}

func apply(ctx context.Context, db *sql.DB, version int, body string) error {
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()

	var applied int
	if err := tx.QueryRowContext(ctx, `SELECT COUNT(*) FROM schema_migrations WHERE version = ?`, version).Scan(&applied); err != nil {
		return err
	}
	if applied > 0 {
		return nil
	}
	if _, err := tx.ExecContext(ctx, body); err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, `INSERT INTO schema_migrations (version) VALUES (?)`, version); err != nil {
		return err
	}
	return tx.Commit()
}

// migrationVersion reads the number a migration's file name starts with
// ("001_init.sql" is version 1).
func migrationVersion(name string) (int, error) {
	prefix, _, _ := strings.Cut(path.Base(name), "_")
	v, err := strconv.Atoi(prefix)
	if err != nil {
		return 0, fmt.Errorf("migration %s: name must start with a number", name)
	}
	return v, nil
}

// IsUniqueViolation reports whether err is a unique or primary key violation.
// If columns are given, it only matches a violation naming one of them (as
// "table.column").
func IsUniqueViolation(err error, columns ...string) bool {
	var e *sqlite.Error
	if !errors.As(err, &e) {
		return false
	}
	if e.Code() != sqlite3.SQLITE_CONSTRAINT_UNIQUE && e.Code() != sqlite3.SQLITE_CONSTRAINT_PRIMARYKEY {
		return false
	}
	if len(columns) == 0 {
		return true
	}
	for _, c := range columns {
		if strings.Contains(e.Error(), c) {
			return true
		}
	}
	return false
}
