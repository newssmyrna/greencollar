-- Persist review-only invoices from completed tenant-scoped visits.
-- The unique business/visit key prevents duplicate drafts for one completed service.
-- This migration is prepared code and must not be applied before backup and staging review.
CREATE TABLE IF NOT EXISTS invoice_drafts (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  service_visit_id TEXT NOT NULL,
  customer_id TEXT NOT NULL,
  customer_name TEXT NOT NULL CHECK(length(trim(customer_name)) BETWEEN 1 AND 160),
  issued_on TEXT NOT NULL,
  due_on TEXT NOT NULL,
  service_description TEXT NOT NULL CHECK(length(trim(service_description)) BETWEEN 1 AND 240),
  quantity INTEGER NOT NULL DEFAULT 1 CHECK(quantity=1),
  unit_price_cents INTEGER NOT NULL CHECK(unit_price_cents BETWEEN 0 AND 100000000),
  tax_basis_points INTEGER NOT NULL DEFAULT 0 CHECK(tax_basis_points BETWEEN 0 AND 10000),
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status='draft'),
  notes TEXT NOT NULL DEFAULT '' CHECK(length(notes)<=4000),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(business_id,service_visit_id)
);
CREATE INDEX IF NOT EXISTS invoice_drafts_business_date_idx ON invoice_drafts(business_id,issued_on DESC);
