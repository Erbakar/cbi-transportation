-- What the sender asked for in the e-mail text (hold, correction, question, special request).
-- A thread with a hold is never transferred automatically; staff decides.
ALTER TABLE mail_threads ADD COLUMN hold TEXT;
