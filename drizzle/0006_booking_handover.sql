CREATE TABLE booking_handovers (
  id TEXT PRIMARY KEY NOT NULL,
  owner TEXT NOT NULL,
  reference_key TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1,
  data TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(owner, reference_key)
);
CREATE INDEX booking_handovers_owner_updated ON booking_handovers(owner, updated_at);
CREATE TABLE booking_handover_events (
  id TEXT PRIMARY KEY NOT NULL,
  booking_id TEXT NOT NULL REFERENCES booking_handovers(id),
  owner TEXT NOT NULL,
  revision INTEGER NOT NULL,
  action TEXT NOT NULL CHECK(action IN ('created','updated')),
  snapshot TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(booking_id, revision)
);
