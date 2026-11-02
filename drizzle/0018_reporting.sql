-- Reporting metadata is separate: never changes an operational approval or finance entry.
CREATE TABLE booking_reporting (
 booking_id TEXT PRIMARY KEY REFERENCES booking_handovers(id), owner TEXT NOT NULL,
 revision INTEGER NOT NULL, data TEXT NOT NULL, closed_at TEXT, updated_at TEXT NOT NULL
);
CREATE INDEX booking_reporting_owner ON booking_reporting(owner,booking_id);
CREATE TABLE booking_reporting_events (
 id TEXT PRIMARY KEY, booking_id TEXT NOT NULL REFERENCES booking_handovers(id), owner TEXT NOT NULL,
 revision INTEGER NOT NULL, snapshot TEXT NOT NULL, reason TEXT NOT NULL, created_at TEXT NOT NULL,
 UNIQUE(booking_id,revision)
);
