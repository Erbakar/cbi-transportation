-- Additive outbox: retain every original PDF, transfer step and attempt history.
CREATE TABLE prealert_queue (
 document_id TEXT PRIMARY KEY REFERENCES prealert_uploads(id), owner TEXT NOT NULL,
 state TEXT NOT NULL DEFAULT 'queued', attempts INTEGER NOT NULL DEFAULT 0,
 next_at INTEGER NOT NULL DEFAULT 0, last_attempt_at INTEGER,
 lease TEXT, message TEXT, updated_at TEXT NOT NULL
);
CREATE INDEX prealert_queue_due ON prealert_queue(next_at,state);
CREATE TABLE prealert_queue_control (
 id TEXT PRIMARY KEY, lease TEXT, lease_until INTEGER NOT NULL DEFAULT 0,
 next_at INTEGER NOT NULL DEFAULT 0, failures INTEGER NOT NULL DEFAULT 0,
 last_tick_at INTEGER, last_finished_at INTEGER, last_status TEXT NOT NULL DEFAULT 'idle'
);
INSERT INTO prealert_queue_control(id) VALUES('tmaxx');
-- Unknown transfers are included for read-only reconciliation, never blind replay.
INSERT INTO prealert_queue(document_id,owner,updated_at)
 SELECT id,owner,updated_at FROM prealert_uploads WHERE state<>'synced';
-- Remember only server-validated targets so an outage after selection cannot
-- prevent saving the PDF. The queue revalidates the live target before writing.
CREATE TABLE prealert_targets (
 owner TEXT NOT NULL, reference TEXT NOT NULL, snapshot TEXT NOT NULL,
 type_id INTEGER NOT NULL, updated_at TEXT NOT NULL,
 PRIMARY KEY(owner,reference)
);
