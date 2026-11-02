CREATE TABLE booking_extraction_history (
 id TEXT PRIMARY KEY, document_id TEXT NOT NULL REFERENCES operation_documents(id), result TEXT NOT NULL,
 model TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE booking_inbox (
 id TEXT PRIMARY KEY, owner TEXT NOT NULL, filename TEXT NOT NULL, mime TEXT NOT NULL, size INTEGER NOT NULL,
 hash TEXT NOT NULL, object_key TEXT NOT NULL, source_reference TEXT NOT NULL, created_at TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','reading','ready','attached')),
 lease_until INTEGER NOT NULL DEFAULT 0, extraction_id TEXT, result TEXT, model TEXT,
 booking_id TEXT REFERENCES booking_handovers(id), document_id TEXT REFERENCES operation_documents(id),
 decision TEXT, UNIQUE(owner,hash)
);
CREATE TABLE booking_cost_sheets (
 booking_id TEXT PRIMARY KEY REFERENCES booking_handovers(id), owner TEXT NOT NULL, revision INTEGER NOT NULL,
 document_id TEXT NOT NULL REFERENCES operation_documents(id), extraction_id TEXT NOT NULL,
 data TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE booking_cost_events (
 id TEXT PRIMARY KEY, booking_id TEXT NOT NULL REFERENCES booking_handovers(id), owner TEXT NOT NULL,
 revision INTEGER NOT NULL, snapshot TEXT NOT NULL, created_at TEXT NOT NULL, UNIQUE(booking_id,revision)
);
CREATE TRIGGER booking_extraction_evidence_insert AFTER INSERT ON booking_document_extractions
WHEN NEW.status='ready'
BEGIN UPDATE booking_handovers SET evidence_revision=evidence_revision+1 WHERE id=(SELECT booking_id FROM operation_documents WHERE id=NEW.document_id); END;
CREATE TRIGGER booking_extraction_refresh_started AFTER UPDATE OF status ON booking_document_extractions
WHEN NEW.status='reading' AND OLD.status='ready'
BEGIN UPDATE booking_handovers SET evidence_revision=evidence_revision+1 WHERE id=(SELECT booking_id FROM operation_documents WHERE id=NEW.document_id); END;
CREATE INDEX booking_inbox_owner ON booking_inbox(owner,created_at);
