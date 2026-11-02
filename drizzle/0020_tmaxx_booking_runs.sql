CREATE TABLE booking_tmaxx_runs (
 id TEXT PRIMARY KEY,booking_id TEXT NOT NULL REFERENCES booking_handovers(id),owner TEXT NOT NULL,
 mode TEXT NOT NULL CHECK(mode IN ('create','update')),booking_revision INTEGER NOT NULL,
 plan TEXT NOT NULL,status TEXT NOT NULL CHECK(status IN ('prepared','sending','complete','unknown','cancelled')),
 created_at TEXT NOT NULL,updated_at TEXT NOT NULL,result TEXT
);
CREATE UNIQUE INDEX booking_tmaxx_run_active ON booking_tmaxx_runs(booking_id) WHERE status IN ('prepared','sending','unknown');
CREATE TABLE booking_tmaxx_run_steps (
 run_id TEXT NOT NULL REFERENCES booking_tmaxx_runs(id),scope TEXT NOT NULL CHECK(scope IN ('position','good')),
 status TEXT NOT NULL CHECK(status IN ('sending','complete','unknown')),remote_id INTEGER,result TEXT,
 updated_at TEXT NOT NULL,PRIMARY KEY(run_id,scope)
);

CREATE UNIQUE INDEX booking_tmaxx_create_reference ON booking_tmaxx_runs(owner,json_extract(plan,'$.good.customerRef')) WHERE mode='create' AND status IN ('prepared','sending','unknown','complete');
