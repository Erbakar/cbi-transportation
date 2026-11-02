CREATE TABLE booking_tmaxx_container_runs (
 id TEXT PRIMARY KEY,booking_id TEXT NOT NULL REFERENCES booking_handovers(id),owner TEXT NOT NULL,
 good_id INTEGER NOT NULL,container_id INTEGER,container_no TEXT NOT NULL,plan TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('prepared','sending','complete','unknown','cancelled')),
 remote_id INTEGER,result TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX tmaxx_container_active ON booking_tmaxx_container_runs(owner,good_id,container_no) WHERE status IN ('prepared','sending','unknown');
CREATE UNIQUE INDEX tmaxx_container_entity_active ON booking_tmaxx_container_runs(owner,container_id) WHERE container_id IS NOT NULL AND status IN ('prepared','sending','unknown');
