CREATE TABLE IF NOT EXISTS platform_steps (
 record_id TEXT NOT NULL, revision INTEGER NOT NULL, platform TEXT NOT NULL,
 step TEXT NOT NULL, status TEXT NOT NULL, request_hash TEXT NOT NULL,
 result TEXT, updated_at TEXT NOT NULL,
 PRIMARY KEY(record_id, revision, platform, step)
);
CREATE TABLE IF NOT EXISTS platform_reviews (
 record_id TEXT PRIMARY KEY, revision INTEGER NOT NULL, input_hash TEXT NOT NULL,
 payload TEXT NOT NULL, warnings TEXT NOT NULL, approved INTEGER NOT NULL DEFAULT 0,
 created_at TEXT NOT NULL
);
