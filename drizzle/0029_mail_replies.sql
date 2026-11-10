-- Missing-information loop for bills of lading received by e-mail.
ALTER TABLE mail_messages ADD COLUMN reply_to TEXT NOT NULL DEFAULT '';
ALTER TABLE mail_messages ADD COLUMN references_header TEXT NOT NULL DEFAULT '';
ALTER TABLE mail_messages ADD COLUMN automated INTEGER NOT NULL DEFAULT 0;
-- pending -> done | ignored | failed. Messages observed before this migration stay 'observed'.
ALTER TABLE mail_messages ADD COLUMN intake_state TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE mail_messages ADD COLUMN intake_note TEXT;
ALTER TABLE mail_messages ADD COLUMN intake_attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE mail_messages ADD COLUMN thread_id TEXT;
UPDATE mail_messages SET intake_state='observed';
CREATE INDEX mail_messages_intake ON mail_messages(intake_state,received_at);
-- One conversation per bill-of-lading record.
CREATE TABLE mail_threads (
 id TEXT PRIMARY KEY, tag TEXT NOT NULL UNIQUE, record_id TEXT NOT NULL, owner TEXT NOT NULL,
 subject TEXT NOT NULL, customer TEXT NOT NULL, cc TEXT NOT NULL DEFAULT '',
 message_ids TEXT NOT NULL DEFAULT '[]', rounds INTEGER NOT NULL DEFAULT 0,
 -- waiting_customer | complete | staff
 state TEXT NOT NULL, note TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX mail_threads_record ON mail_threads(record_id);
-- Every outgoing e-mail is journaled before the SMTP conversation. A send whose
-- outcome is not known is never retried automatically (no duplicate customer mail).
CREATE TABLE mail_outbox (
 id TEXT PRIMARY KEY, thread_id TEXT NOT NULL REFERENCES mail_threads(id), round INTEGER NOT NULL,
 message_id TEXT NOT NULL UNIQUE, recipients TEXT NOT NULL, subject TEXT NOT NULL, body TEXT NOT NULL,
 -- queued | sending | sent | unknown | failed
 state TEXT NOT NULL DEFAULT 'queued', attempts INTEGER NOT NULL DEFAULT 0, error TEXT,
 created_at TEXT NOT NULL, sent_at TEXT, UNIQUE(thread_id,round)
);
-- started_at: mail received before intake was first enabled is never answered.
CREATE TABLE mail_intake_control (id TEXT PRIMARY KEY, lease TEXT, lease_until INTEGER NOT NULL DEFAULT 0, started_at TEXT, sent_hour TEXT, sent_in_hour INTEGER NOT NULL DEFAULT 0);
INSERT INTO mail_intake_control(id) VALUES('intake');
