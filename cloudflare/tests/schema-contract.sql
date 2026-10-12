-- CI-only schema contract: compile the core queries used by the authenticated API.
-- Wrangler applies migrations to its local D1 database before executing this file.
SELECT id,name,phone,email,notes,created_at
  FROM customers
  WHERE business_id='schema-check'
  ORDER BY name LIMIT 0;

SELECT id,customer_id,address,preferences
  FROM service_locations
  WHERE business_id='schema-check'
  ORDER BY address LIMIT 0;

SELECT a.id,a.customer_id,a.location_id,a.service_name,a.rate_cents,a.estimated_minutes,
       a.starts_on,a.ends_on,a.frequency,a.interval_days,a.days_of_week,
       a.preferred_start_minute,a.preferred_finish_minute,a.fixed_start_minute,a.active,
       l.address,l.preferences
  FROM service_agreements a
  JOIN service_locations l ON l.id=a.location_id AND l.business_id=a.business_id
  WHERE a.business_id='schema-check' AND a.active=1
    AND a.starts_on<='2026-10-12'
    AND (a.ends_on IS NULL OR a.ends_on>='2026-10-12')
  ORDER BY a.id LIMIT 0;

SELECT agreement_id,scheduled_date,status,actual_minutes
  FROM service_visits
  WHERE business_id='schema-check' AND scheduled_date='2026-10-12' LIMIT 0;

SELECT agreement_id,actual_minutes
  FROM service_visits
  WHERE business_id='schema-check' AND status='completed'
    AND actual_minutes BETWEEN 1 AND 1439 AND scheduled_date<'2026-10-12'
  ORDER BY scheduled_date DESC LIMIT 0;
