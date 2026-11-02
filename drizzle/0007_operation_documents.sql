CREATE TABLE operation_documents (
 id TEXT PRIMARY KEY NOT NULL,
 booking_id TEXT NOT NULL REFERENCES booking_handovers(id),
 owner TEXT NOT NULL,
 series_id TEXT NOT NULL,
 version INTEGER NOT NULL CHECK(version>0),
 replaces_id TEXT REFERENCES operation_documents(id),
 type TEXT NOT NULL,
 filename TEXT NOT NULL,
 mime TEXT NOT NULL,
 size INTEGER NOT NULL CHECK(size>0 AND size<=10485760),
 hash TEXT NOT NULL,
 object_key TEXT NOT NULL UNIQUE,
 source_reference TEXT NOT NULL,
 created_at TEXT NOT NULL,
 UNIQUE(booking_id,hash),
 UNIQUE(series_id,version),
 UNIQUE(replaces_id)
);
CREATE INDEX operation_documents_booking ON operation_documents(owner,booking_id,created_at);
