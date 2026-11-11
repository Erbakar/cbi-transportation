-- Mail conversations that are not bills of lading (pre-alert, VGM). 'bl' keeps the existing flow.
ALTER TABLE mail_threads ADD COLUMN kind TEXT NOT NULL DEFAULT 'bl';
-- Per-conversation work items (files, upload ids, pending positions) for non-B/L kinds.
ALTER TABLE mail_threads ADD COLUMN items TEXT;
