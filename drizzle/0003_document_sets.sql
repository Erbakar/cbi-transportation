ALTER TABLE records ADD COLUMN manual TEXT;
CREATE TABLE record_documents (id TEXT PRIMARY KEY NOT NULL, record_id TEXT NOT NULL, revision INTEGER NOT NULL, filename TEXT NOT NULL, hash TEXT NOT NULL, object_key TEXT NOT NULL, mime TEXT NOT NULL);
CREATE INDEX record_documents_revision ON record_documents(record_id,revision);
