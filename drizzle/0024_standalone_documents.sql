-- Preserve all prior VGM jobs; a null booking_id denotes a standalone manual declaration.
CREATE TABLE cma_vgm_jobs_v2 (
 id TEXT PRIMARY KEY, owner TEXT NOT NULL, booking_id TEXT,
 payload TEXT NOT NULL, payload_hash TEXT NOT NULL, state TEXT NOT NULL,
 send_authorized INTEGER NOT NULL DEFAULT 0, lease TEXT, lease_until INTEGER NOT NULL DEFAULT 0,
 result TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
 UNIQUE(owner,payload_hash), FOREIGN KEY(booking_id) REFERENCES booking_handovers(id)
);
INSERT INTO cma_vgm_jobs_v2 SELECT * FROM cma_vgm_jobs;
DROP TABLE cma_vgm_jobs;
ALTER TABLE cma_vgm_jobs_v2 RENAME TO cma_vgm_jobs;
CREATE INDEX cma_vgm_jobs_owner ON cma_vgm_jobs(owner,updated_at);
CREATE UNIQUE INDEX cma_vgm_container_active ON cma_vgm_jobs(owner,json_extract(payload,'$.booking'),json_extract(payload,'$.container')) WHERE state<>'blocked';
CREATE TABLE prealert_uploads (
 id TEXT PRIMARY KEY, owner TEXT NOT NULL, position_id INTEGER NOT NULL, position_reference TEXT NOT NULL,
 filename TEXT NOT NULL, size INTEGER NOT NULL, hash TEXT NOT NULL, object_key TEXT NOT NULL,
 type_id INTEGER NOT NULL, state TEXT NOT NULL DEFAULT 'saved', remote_id INTEGER,
 message TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
 UNIQUE(owner,position_id,hash)
);
CREATE INDEX prealert_uploads_owner ON prealert_uploads(owner,created_at);
CREATE TABLE prealert_upload_steps (
 document_id TEXT NOT NULL REFERENCES prealert_uploads(id), step TEXT NOT NULL,
 status TEXT NOT NULL, result TEXT, PRIMARY KEY(document_id,step)
);
