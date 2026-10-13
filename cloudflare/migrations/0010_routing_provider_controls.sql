-- Aggregate-only controls for the disabled-by-default Edgewater routing pilot.
CREATE TABLE IF NOT EXISTS business_routing_settings (
  business_id TEXT PRIMARY KEY REFERENCES businesses(id) ON DELETE CASCADE,
  enabled INTEGER NOT NULL DEFAULT 0 CHECK (enabled IN (0,1)),
  notice_version TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS routing_notice_acknowledgements (
  business_id TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  subject TEXT NOT NULL,
  notice_version TEXT NOT NULL,
  acknowledged_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (business_id,subject,notice_version)
);

-- One global provider meter, with no tenant IDs, points, route values, or keys.
CREATE TABLE IF NOT EXISTS road_provider_usage_monthly (
  billing_month TEXT PRIMARY KEY CHECK (billing_month GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]' AND substr(billing_month,6,2) BETWEEN '01' AND '12'),
  element_count INTEGER NOT NULL CHECK (element_count BETWEEN 0 AND 19500),
  estimated_cost_micro_usd INTEGER NOT NULL CHECK (estimated_cost_micro_usd BETWEEN 0 AND 120000000),
  updated_at TEXT NOT NULL
);
