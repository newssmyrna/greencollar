-- Availability entries are auditable inputs to capacity planning; they never change routes.
CREATE TABLE IF NOT EXISTS crew_availability_events (
  business_id TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  event_id TEXT NOT NULL,
  work_date TEXT NOT NULL,
  member_subject TEXT NOT NULL,
  reported_by TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('break','sick','unavailable')),
  start_minute INTEGER NOT NULL CHECK (start_minute BETWEEN 0 AND 1439),
  end_minute INTEGER NOT NULL CHECK (end_minute BETWEEN 1 AND 1440 AND end_minute > start_minute),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (business_id,event_id,reported_by)
);
CREATE INDEX IF NOT EXISTS crew_availability_business_date_idx
  ON crew_availability_events(business_id,work_date,start_minute);
CREATE INDEX IF NOT EXISTS crew_availability_member_date_idx
  ON crew_availability_events(business_id,member_subject,work_date);
