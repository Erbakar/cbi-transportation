CREATE TABLE booking_tmaxx_links (
 booking_id TEXT PRIMARY KEY REFERENCES booking_handovers(id), owner TEXT NOT NULL,
 position_id INTEGER NOT NULL, position_reference TEXT NOT NULL, good_id INTEGER NOT NULL,
 good_reference TEXT NOT NULL, created_at TEXT NOT NULL, UNIQUE(owner,good_id)
);
CREATE TABLE booking_tmaxx_documents (
 document_id TEXT PRIMARY KEY REFERENCES operation_documents(id), booking_id TEXT NOT NULL REFERENCES booking_handovers(id),
 owner TEXT NOT NULL, good_id INTEGER NOT NULL, type_id INTEGER NOT NULL, content_hash TEXT NOT NULL,
 remote_id INTEGER, verified_at TEXT
);
CREATE TABLE booking_tmaxx_steps (
 document_id TEXT NOT NULL REFERENCES booking_tmaxx_documents(document_id), step TEXT NOT NULL,
 request_hash TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('sending','complete','unknown')),
 result TEXT, updated_at TEXT NOT NULL, PRIMARY KEY(document_id,step)
);
