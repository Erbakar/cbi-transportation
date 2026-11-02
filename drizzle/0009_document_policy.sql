ALTER TABLE booking_extraction_applications ADD COLUMN decision TEXT;
ALTER TABLE booking_handovers ADD COLUMN evidence_revision INTEGER NOT NULL DEFAULT 0;
CREATE TRIGGER booking_document_evidence_insert AFTER INSERT ON operation_documents
BEGIN UPDATE booking_handovers SET evidence_revision=evidence_revision+1 WHERE id=NEW.booking_id; END;
CREATE TRIGGER booking_extraction_evidence_update AFTER UPDATE OF status,result ON booking_document_extractions
WHEN NEW.status='ready'
BEGIN UPDATE booking_handovers SET evidence_revision=evidence_revision+1 WHERE id=(SELECT booking_id FROM operation_documents WHERE id=NEW.document_id); END;
