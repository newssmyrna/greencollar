-- Manager-authored drafts for a business day. Draft writes never publish or mutate visits.
CREATE TABLE IF NOT EXISTS workday_schedule_drafts (
  business_id TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  work_date TEXT NOT NULL,
  version INTEGER NOT NULL CHECK (version > 0),
  schedule_json TEXT NOT NULL CHECK (json_valid(schedule_json)),
  updated_by TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (business_id,work_date)
);
CREATE INDEX IF NOT EXISTS workday_schedule_drafts_updated_idx
  ON workday_schedule_drafts(business_id,updated_at DESC);
