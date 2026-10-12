-- Store short operator work notes with the completed tenant-scoped visit.
-- No existing visit notes are inferred or backfilled.
ALTER TABLE service_visits ADD COLUMN work_note TEXT NOT NULL DEFAULT '' CHECK(length(work_note)<=1000);
