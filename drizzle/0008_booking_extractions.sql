CREATE TABLE booking_document_extractions (
 document_id TEXT PRIMARY KEY NOT NULL REFERENCES operation_documents(id),
 id TEXT NOT NULL UNIQUE,
 status TEXT NOT NULL CHECK(status IN ('reading','ready','failed')),
 lease_until INTEGER NOT NULL DEFAULT 0,
 result TEXT,
 model TEXT NOT NULL,
 created_at TEXT NOT NULL
);
CREATE TABLE booking_extraction_applications (
 id TEXT PRIMARY KEY NOT NULL,
 booking_id TEXT NOT NULL REFERENCES booking_handovers(id),
 extraction_id TEXT NOT NULL,
 document_id TEXT NOT NULL REFERENCES operation_documents(id),
 owner TEXT NOT NULL,
 revision INTEGER NOT NULL,
 selected_fields TEXT NOT NULL,
 created_at TEXT NOT NULL,
 UNIQUE(booking_id,revision)
);
