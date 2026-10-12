-- Append-only operator-confirmed location events. Store only coarse GPS classification, never raw coordinates.
CREATE TABLE IF NOT EXISTS location_confirmations (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL,
  agreement_id TEXT NOT NULL,
  service_date TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('arrival','departure')),
  operator_subject TEXT NOT NULL,
  confirmed_at INTEGER NOT NULL CHECK (confirmed_at >= 0),
  source TEXT NOT NULL CHECK (source IN ('gps_suggestion','manual')),
  proximity TEXT NOT NULL CHECK (proximity IN ('within_radius','outside_radius','uncertain','unavailable','manual')),
  manual_reason TEXT CHECK (manual_reason IS NULL OR length(manual_reason) <= 280),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE,
  FOREIGN KEY (agreement_id,business_id) REFERENCES service_agreements(id,business_id) ON DELETE CASCADE,
  CHECK ((source='manual' AND manual_reason IS NOT NULL AND length(trim(manual_reason)) > 0 AND proximity='manual')
      OR (source='gps_suggestion' AND manual_reason IS NULL
          AND ((kind='arrival' AND proximity='within_radius') OR (kind='departure' AND proximity='outside_radius'))))
);
CREATE INDEX IF NOT EXISTS location_confirmations_day_idx ON location_confirmations(business_id,service_date,confirmed_at,id);
