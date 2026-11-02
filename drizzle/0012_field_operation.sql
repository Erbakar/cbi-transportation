CREATE TABLE booking_field_operations (
 booking_id TEXT PRIMARY KEY REFERENCES booking_handovers(id), owner TEXT NOT NULL,
 revision INTEGER NOT NULL, data TEXT NOT NULL, source TEXT, updated_at TEXT NOT NULL
);
CREATE TABLE booking_field_events (
 id TEXT PRIMARY KEY, booking_id TEXT NOT NULL REFERENCES booking_handovers(id), owner TEXT NOT NULL,
 revision INTEGER NOT NULL, reason TEXT NOT NULL, snapshot TEXT NOT NULL, created_at TEXT NOT NULL,
 UNIQUE(booking_id,revision)
);
CREATE TABLE booking_field_artifacts (
 id TEXT PRIMARY KEY, booking_id TEXT NOT NULL REFERENCES booking_handovers(id), owner TEXT NOT NULL,
 kind TEXT NOT NULL, fingerprint TEXT NOT NULL, snapshot TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE booking_field_dispatches (
 id TEXT PRIMARY KEY, artifact_id TEXT NOT NULL REFERENCES booking_field_artifacts(id),
 booking_id TEXT NOT NULL REFERENCES booking_handovers(id), owner TEXT NOT NULL,
 recipient TEXT NOT NULL, sent_at TEXT NOT NULL, channel TEXT NOT NULL, evidence TEXT NOT NULL,
 created_at TEXT NOT NULL
);
CREATE INDEX booking_field_owner ON booking_field_operations(owner,booking_id);
CREATE INDEX booking_field_events_owner ON booking_field_events(owner,booking_id,revision);
CREATE INDEX booking_field_artifacts_owner ON booking_field_artifacts(owner,booking_id,created_at);
CREATE INDEX booking_field_dispatches_owner ON booking_field_dispatches(owner,booking_id,created_at);
