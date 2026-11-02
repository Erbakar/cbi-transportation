CREATE TABLE IF NOT EXISTS cma_vgm_jobs (
 id TEXT PRIMARY KEY, owner TEXT NOT NULL, booking_id TEXT NOT NULL,
 payload TEXT NOT NULL, payload_hash TEXT NOT NULL, state TEXT NOT NULL,
 send_authorized INTEGER NOT NULL DEFAULT 0, lease TEXT, lease_until INTEGER NOT NULL DEFAULT 0,
 result TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
 UNIQUE(owner,payload_hash), FOREIGN KEY(booking_id) REFERENCES booking_handovers(id)
);
CREATE INDEX IF NOT EXISTS cma_vgm_jobs_owner ON cma_vgm_jobs(owner,updated_at);
CREATE TABLE IF NOT EXISTS cma_vgm_agents (
 owner TEXT PRIMARY KEY, heartbeat INTEGER NOT NULL, version TEXT NOT NULL, check_id TEXT, check_state TEXT, check_message TEXT, checked_at INTEGER
);

CREATE UNIQUE INDEX IF NOT EXISTS cma_vgm_container_active ON cma_vgm_jobs(owner,json_extract(payload,'$.booking'),json_extract(payload,'$.container')) WHERE state<>'blocked';
