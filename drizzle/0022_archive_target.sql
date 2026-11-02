-- Preserve existing load uploads; new pre-alert documents may target their position.
ALTER TABLE booking_tmaxx_documents ADD COLUMN target_kind TEXT NOT NULL DEFAULT 'good' CHECK(target_kind IN ('good','position'));
ALTER TABLE booking_tmaxx_documents ADD COLUMN target_id INTEGER;
UPDATE booking_tmaxx_documents SET target_id=good_id WHERE target_id IS NULL;
