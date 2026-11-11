-- Items asked of the sender in earlier rounds; later rounds may only repeat these.
ALTER TABLE mail_threads ADD COLUMN asked TEXT;
