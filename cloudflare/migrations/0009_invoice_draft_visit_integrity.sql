-- Enforce that every persisted invoice draft remains attached to a visit
-- from the same business. Existing rows are copied through the constraint;
-- migration fails if any draft has no matching visit, preserving fail-closed behavior.
CREATE UNIQUE INDEX IF NOT EXISTS service_visits_id_business_uq
  ON service_visits(id,business_id);

CREATE TABLE invoice_drafts_next (
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
  UNIQUE(business_id,service_visit_id),
  FOREIGN KEY(service_visit_id,business_id)
    REFERENCES service_visits(id,business_id) ON DELETE RESTRICT
);

INSERT INTO invoice_drafts_next (
  id,business_id,service_visit_id,customer_id,customer_name,issued_on,due_on,
  service_description,quantity,unit_price_cents,tax_basis_points,status,notes,created_at,updated_at
)
SELECT
  id,business_id,service_visit_id,customer_id,customer_name,issued_on,due_on,
  service_description,quantity,unit_price_cents,tax_basis_points,status,notes,created_at,updated_at
FROM invoice_drafts;

DROP TABLE invoice_drafts;
ALTER TABLE invoice_drafts_next RENAME TO invoice_drafts;

CREATE INDEX IF NOT EXISTS invoice_drafts_business_date_idx
  ON invoice_drafts(business_id,issued_on DESC);
