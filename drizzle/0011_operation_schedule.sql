CREATE TABLE booking_schedules (
 booking_id TEXT PRIMARY KEY REFERENCES booking_handovers(id), owner TEXT NOT NULL,
 revision INTEGER NOT NULL DEFAULT 1, data TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE booking_schedule_events (
 id TEXT PRIMARY KEY, booking_id TEXT NOT NULL REFERENCES booking_handovers(id), owner TEXT NOT NULL,
 revision INTEGER NOT NULL, action TEXT NOT NULL, reason TEXT NOT NULL, snapshot TEXT NOT NULL,
 created_at TEXT NOT NULL, UNIQUE(booking_id,revision)
);
CREATE INDEX booking_schedules_owner ON booking_schedules(owner,updated_at);
CREATE INDEX booking_schedule_events_owner ON booking_schedule_events(owner,booking_id,revision);
