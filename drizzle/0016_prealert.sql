CREATE TABLE booking_prealerts(
 booking_id TEXT PRIMARY KEY REFERENCES booking_handovers(id),owner TEXT NOT NULL,
 revision INTEGER NOT NULL DEFAULT 1,source_fingerprint TEXT NOT NULL,data TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'draft',
 latest_package_id TEXT,updated_at TEXT NOT NULL
);
CREATE TABLE prealert_packages(
 id TEXT PRIMARY KEY,booking_id TEXT NOT NULL REFERENCES booking_handovers(id),owner TEXT NOT NULL,
 config_revision INTEGER NOT NULL,fingerprint TEXT NOT NULL,snapshot TEXT NOT NULL,created_at TEXT NOT NULL,
 UNIQUE(booking_id,config_revision,fingerprint)
);
CREATE INDEX prealert_packages_booking ON prealert_packages(owner,booking_id,created_at);
CREATE TABLE prealert_dispatches(
 id TEXT PRIMARY KEY,package_id TEXT NOT NULL UNIQUE REFERENCES prealert_packages(id),booking_id TEXT NOT NULL REFERENCES booking_handovers(id),
 owner TEXT NOT NULL,sent_at TEXT NOT NULL,channel TEXT NOT NULL,evidence TEXT NOT NULL,snapshot TEXT NOT NULL,created_at TEXT NOT NULL
);
CREATE INDEX prealert_dispatches_booking ON prealert_dispatches(owner,booking_id,created_at);
