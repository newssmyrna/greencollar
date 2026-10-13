-- Weather interruption reports are auditable events. Reporting never changes visit or agreement state.
CREATE TABLE IF NOT EXISTS weather_interruption_events (
  business_id TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  event_id TEXT NOT NULL,
  work_date TEXT NOT NULL,
  reported_at TEXT NOT NULL,
  reporter_subject TEXT NOT NULL,
  reason TEXT NOT NULL CHECK (reason IN ('rain','other')),
  completed_visit_ids TEXT NOT NULL CHECK (json_valid(completed_visit_ids)),
  remaining_visit_ids TEXT NOT NULL CHECK (json_valid(remaining_visit_ids)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (business_id,event_id,reporter_subject)
);
CREATE INDEX IF NOT EXISTS weather_interruption_business_date_idx
  ON weather_interruption_events(business_id,work_date,created_at DESC);
