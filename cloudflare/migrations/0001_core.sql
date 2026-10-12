-- GreenCollar D1 schema. Applied to greencollar-db on 2026-10-12.
-- All application read/write actions MUST enforce authenticated tenant membership.
CREATE TABLE IF NOT EXISTS businesses (id TEXT PRIMARY KEY,name TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS customers (id TEXT PRIMARY KEY,business_id TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,name TEXT NOT NULL,phone TEXT,email TEXT,notes TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,UNIQUE(id,business_id));
CREATE TABLE IF NOT EXISTS service_locations (id TEXT PRIMARY KEY,business_id TEXT NOT NULL,customer_id TEXT NOT NULL,address TEXT NOT NULL,lat REAL,lon REAL,preferences TEXT,UNIQUE(id,business_id,customer_id),FOREIGN KEY(customer_id,business_id) REFERENCES customers(id,business_id));
CREATE TABLE IF NOT EXISTS jobs (id TEXT PRIMARY KEY,business_id TEXT NOT NULL,customer_id TEXT NOT NULL,location_id TEXT NOT NULL,service_name TEXT NOT NULL,rate_cents INTEGER NOT NULL DEFAULT 0 CHECK(rate_cents>=0),estimated_minutes INTEGER NOT NULL DEFAULT 60 CHECK(estimated_minutes>0),status TEXT NOT NULL DEFAULT 'pending',scheduled_for TEXT,FOREIGN KEY(customer_id,business_id) REFERENCES customers(id,business_id),FOREIGN KEY(location_id,business_id,customer_id) REFERENCES service_locations(id,business_id,customer_id));
CREATE INDEX IF NOT EXISTS customers_business_idx ON customers(business_id);
CREATE INDEX IF NOT EXISTS jobs_business_idx ON jobs(business_id,scheduled_for);
