CREATE TABLE booking_vgm_readings(
 id TEXT PRIMARY KEY, booking_id TEXT NOT NULL REFERENCES booking_handovers(id),owner TEXT NOT NULL,
 document_id TEXT NOT NULL REFERENCES operation_documents(id),document_hash TEXT NOT NULL,
 status TEXT NOT NULL,lease_until INTEGER NOT NULL DEFAULT 0,result TEXT,error TEXT,created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX booking_vgm_reading_active ON booking_vgm_readings(document_id) WHERE status='reading';
CREATE INDEX booking_vgm_reading_owner ON booking_vgm_readings(owner,booking_id,created_at);
CREATE TABLE booking_vgm_approvals(
 id TEXT PRIMARY KEY,booking_id TEXT NOT NULL REFERENCES booking_handovers(id),owner TEXT NOT NULL,
 container_number TEXT NOT NULL,reading_id TEXT NOT NULL REFERENCES booking_vgm_readings(id),
 fingerprint TEXT NOT NULL,snapshot TEXT NOT NULL,reason TEXT NOT NULL,created_at TEXT NOT NULL,
 revoked_at TEXT,revocation_reason TEXT
);
CREATE INDEX booking_vgm_approval_owner ON booking_vgm_approvals(owner,booking_id,created_at);
CREATE TRIGGER booking_vgm_reading_insert AFTER INSERT ON booking_vgm_readings BEGIN
 UPDATE booking_handovers SET evidence_revision=evidence_revision+1 WHERE id=NEW.booking_id;
END;
CREATE TRIGGER booking_vgm_reading_update AFTER UPDATE ON booking_vgm_readings BEGIN
 UPDATE booking_handovers SET evidence_revision=evidence_revision+1 WHERE id=NEW.booking_id;
END;
