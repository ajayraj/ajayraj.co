package db

import (
	"database/sql"
	_ "embed"
	_ "modernc.org/sqlite"
)

//go:embed schema.sql
var schema string

// DB wraps sql.DB with our schema migrations baked in.
type DB struct {
	*sql.DB
}

// Open opens (or creates) the SQLite database at path and runs schema migrations.
// WAL mode and foreign keys are enabled automatically.
func Open(path string) (*DB, error) {
	sqldb, err := sql.Open("sqlite", path+"?_foreign_keys=on&_journal_mode=WAL&_busy_timeout=5000")
	if err != nil {
		return nil, err
	}
	if err := sqldb.Ping(); err != nil {
		return nil, err
	}
	// Single writer connection is fine for a personal app; no connection pool needed.
	sqldb.SetMaxOpenConns(1)

	d := &DB{sqldb}
	if err := d.migrate(); err != nil {
		return nil, err
	}
	return d, nil
}

func (d *DB) migrate() error {
	if _, err := d.Exec(schema); err != nil {
		return err
	}
	// Add password_hash column to existing databases that predate this column.
	// ALTER TABLE fails silently when the column already exists — that's intentional.
	d.Exec(`ALTER TABLE clips ADD COLUMN password_hash TEXT NOT NULL DEFAULT ''`)
	d.Exec(`CREATE INDEX IF NOT EXISTS idx_clips_pw ON clips(password_hash)`)
	return nil
}
