CREATE TABLE IF NOT EXISTS cma_history (
 owner TEXT PRIMARY KEY, snapshot TEXT, checked_at INTEGER, state TEXT NOT NULL DEFAULT 'queued',
 request_id TEXT, lease_until INTEGER NOT NULL DEFAULT 0, next_attempt INTEGER NOT NULL DEFAULT 0, message TEXT
);
CREATE TABLE IF NOT EXISTS platform_history_pages (
 owner TEXT NOT NULL, day TEXT NOT NULL, page INTEGER NOT NULL, data TEXT NOT NULL, checked_at INTEGER NOT NULL,
 PRIMARY KEY(owner,day,page)
);
