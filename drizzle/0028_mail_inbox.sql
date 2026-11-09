-- Phase 1 (silent observation): read-only metadata of the automation mailbox.
-- Bodies and attachments are not stored; nothing is sent, flagged or deleted.
CREATE TABLE mail_messages (
 mailbox TEXT NOT NULL, uid_validity INTEGER NOT NULL, uid INTEGER NOT NULL,
 message_id TEXT, from_name TEXT NOT NULL DEFAULT '', from_address TEXT NOT NULL DEFAULT '',
 to_addresses TEXT NOT NULL DEFAULT '', cc_addresses TEXT NOT NULL DEFAULT '', subject TEXT NOT NULL DEFAULT '',
 sent_at TEXT, received_at TEXT NOT NULL, size INTEGER NOT NULL DEFAULT 0,
 attachments INTEGER NOT NULL DEFAULT 0, in_reply_to TEXT, synced_at TEXT NOT NULL,
 PRIMARY KEY(mailbox,uid_validity,uid)
);
CREATE INDEX mail_messages_received ON mail_messages(received_at);
-- A mailbox rebuild (new UIDVALIDITY) must not duplicate already-observed messages.
CREATE UNIQUE INDEX mail_messages_message_id ON mail_messages(mailbox,message_id) WHERE message_id IS NOT NULL AND message_id<>'';
CREATE TABLE mail_sync_state (
 mailbox TEXT PRIMARY KEY, uid_validity INTEGER, last_uid INTEGER NOT NULL DEFAULT 0,
 lease TEXT, lease_until INTEGER NOT NULL DEFAULT 0, next_at INTEGER NOT NULL DEFAULT 0,
 failures INTEGER NOT NULL DEFAULT 0, last_attempt_at TEXT, last_success_at TEXT,
 last_status TEXT NOT NULL DEFAULT 'idle', message TEXT
);
INSERT INTO mail_sync_state(mailbox) VALUES('INBOX');
