CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    username      TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at    DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sessions (
    token      TEXT PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at DATETIME NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS card_progress (
    user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    card_id       TEXT    NOT NULL,
    interval_days REAL    DEFAULT 1,
    ease_factor   REAL    DEFAULT 2.5,
    repetitions   INTEGER DEFAULT 0,
    next_review   DATE,
    last_reviewed DATETIME,
    last_rating   TEXT,
    PRIMARY KEY (user_id, card_id)
);

CREATE TABLE IF NOT EXISTS card_reviews (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    card_id     TEXT    NOT NULL,
    rating      TEXT    NOT NULL,
    mode        TEXT    NOT NULL DEFAULT 'drill',
    reviewed_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_sessions_user    ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_progress_user    ON card_progress(user_id);
CREATE INDEX IF NOT EXISTS idx_progress_review  ON card_progress(user_id, next_review);
CREATE INDEX IF NOT EXISTS idx_reviews_user     ON card_reviews(user_id);
CREATE INDEX IF NOT EXISTS idx_reviews_card     ON card_reviews(user_id, card_id);

/* ── Clip (cross-device clipboard) ── */

CREATE TABLE IF NOT EXISTS clips (
    id            TEXT PRIMARY KEY,           -- 7-char base62 slug
    content       TEXT NOT NULL,
    language      TEXT NOT NULL DEFAULT 'text',
    title         TEXT NOT NULL DEFAULT '',
    expires_at    DATETIME,                   -- NULL = never expires
    burn          INTEGER NOT NULL DEFAULT 0, -- 1 = delete after first read
    view_count    INTEGER NOT NULL DEFAULT 0,
    password_hash TEXT NOT NULL DEFAULT '',   -- SHA-256 hex of "clip:"+keyword (client-computed)
    created_at    DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_clips_expires ON clips(expires_at);
