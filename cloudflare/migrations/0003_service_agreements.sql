-- Recurring service foundation. NOT YET APPLIED. Requires authenticated Worker API gate.
CREATE TABLE IF NOT EXISTS service_agreements (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  customer_id TEXT NOT NULL,
  location_id TEXT NOT NULL,
  service_name TEXT NOT NULL,
  rate_cents INTEGER NOT NULL CHECK (rate_cents >= 0),
  estimated_minutes INTEGER NOT NULL CHECK (estimated_minutes > 0),
  starts_on TEXT NOT NULL,
  ends_on TEXT,
  frequency TEXT NOT NULL CHECK (frequency IN ('daily','weekly','biweekly','monthly','custom')),
  interval_days INTEGER CHECK (interval_days IS NULL OR interval_days > 0),
  days_of_week TEXT,
  preferred_start_minute INTEGER CHECK (preferred_start_minute BETWEEN 0 AND 1439),
  preferred_finish_minute INTEGER CHECK (preferred_finish_minute BETWEEN 1 AND 1440),
  fixed_start_minute INTEGER CHECK (fixed_start_minute BETWEEN 0 AND 1439),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (id,business_id),
  FOREIGN KEY (location_id,business_id,customer_id)
    REFERENCES service_locations(id,business_id,customer_id)
);
CREATE INDEX IF NOT EXISTS agreement_due_idx ON service_agreements(business_id,active,starts_on);
CREATE TABLE IF NOT EXISTS service_visits (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  agreement_id TEXT NOT NULL,
  scheduled_date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'due' CHECK(status IN ('due','planned','in_progress','completed','skipped')),
  actual_minutes INTEGER CHECK(actual_minutes IS NULL OR actual_minutes>=0),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(agreement_id,scheduled_date),
  FOREIGN KEY(agreement_id,business_id) REFERENCES service_agreements(id,business_id)
);
CREATE INDEX IF NOT EXISTS visits_schedule_idx ON service_visits(business_id,scheduled_date,status);
