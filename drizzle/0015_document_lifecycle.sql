CREATE TABLE document_dossiers(
 id TEXT PRIMARY KEY,booking_id TEXT NOT NULL REFERENCES booking_handovers(id),owner TEXT NOT NULL,
 family TEXT NOT NULL,reference TEXT NOT NULL,reference_key TEXT NOT NULL,revision INTEGER NOT NULL DEFAULT 0,
 head_id TEXT REFERENCES operation_documents(id),final_id TEXT REFERENCES operation_documents(id),
 state TEXT NOT NULL DEFAULT 'waiting',last_event_id TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,
 UNIQUE(booking_id,family,reference_key)
);
CREATE INDEX document_dossiers_owner ON document_dossiers(owner,booking_id);
CREATE TABLE document_dossier_versions(
 id TEXT PRIMARY KEY,dossier_id TEXT NOT NULL REFERENCES document_dossiers(id),document_id TEXT NOT NULL UNIQUE REFERENCES operation_documents(id),
 version INTEGER NOT NULL,actor TEXT NOT NULL,sender TEXT NOT NULL,requested_by TEXT NOT NULL,
 changes TEXT NOT NULL,cost TEXT NOT NULL,currency TEXT NOT NULL,risk TEXT NOT NULL,created_at TEXT NOT NULL,
 UNIQUE(dossier_id,version)
);
CREATE TABLE document_dossier_events(
 id TEXT PRIMARY KEY,dossier_id TEXT NOT NULL REFERENCES document_dossiers(id),document_id TEXT REFERENCES operation_documents(id),
 revision INTEGER NOT NULL,action TEXT NOT NULL,actor TEXT NOT NULL,party TEXT NOT NULL,event_at TEXT NOT NULL,
 evidence TEXT NOT NULL,evidence_document_id TEXT REFERENCES operation_documents(id),reason TEXT NOT NULL,
 fingerprint TEXT NOT NULL,created_at TEXT NOT NULL,UNIQUE(dossier_id,revision)
);
CREATE INDEX document_dossier_events_order ON document_dossier_events(dossier_id,revision);
-- Content is never overwritten or removed by lifecycle actions. Inserting a replacement
-- anywhere in the existing archive immediately invalidates an old final selection.
CREATE TRIGGER dossier_document_replaced AFTER INSERT ON operation_documents WHEN NEW.replaces_id IS NOT NULL
BEGIN
 UPDATE document_dossiers SET final_id=NULL,revision=revision+1,state='revision_received',updated_at=NEW.created_at
 WHERE id IN(SELECT dossier_id FROM document_dossier_versions WHERE document_id=NEW.replaces_id)
 AND head_id=NEW.replaces_id;
 INSERT INTO document_dossier_events(id,dossier_id,document_id,revision,action,actor,party,event_at,evidence,evidence_document_id,reason,fingerprint,created_at)
 SELECT lower(hex(randomblob(16))),id,NEW.replaces_id,revision,'replacement_uploaded',NEW.owner,NEW.source_reference,NEW.created_at,NEW.filename,NEW.id,'Arşive yeni sürüm eklendi; önceki final seçimi kaldırıldı.','',NEW.created_at
 FROM document_dossiers WHERE head_id=NEW.replaces_id;
END;
CREATE TRIGGER dossier_head_insert AFTER INSERT ON document_dossiers
BEGIN UPDATE booking_handovers SET control_epoch=control_epoch+1 WHERE id=NEW.booking_id; END;
CREATE TRIGGER dossier_head_update AFTER UPDATE ON document_dossiers
BEGIN UPDATE booking_handovers SET control_epoch=control_epoch+1 WHERE id=NEW.booking_id; END;
