-- Preserve the customer and agreed service price as they stood when a visit was completed.
-- Legacy completed rows remain NULL so invoice preparation can require manual review.
ALTER TABLE service_visits ADD COLUMN completed_customer_id TEXT;
ALTER TABLE service_visits ADD COLUMN completed_customer_name TEXT;
ALTER TABLE service_visits ADD COLUMN completed_service_name TEXT;
ALTER TABLE service_visits ADD COLUMN completed_rate_cents INTEGER;
