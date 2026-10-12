# Live data integration status — 2026-10-12

Completed and verified:
- GreenCollar D1 database is separate from News Smyrna.
- Cloudflare D1 tables businesses, business_memberships, customers, service_locations, jobs, service_agreements and service_visits exist.
- Application source implements authenticated daily data retrieval and an in-app preview of saved records.
- Pure saved-day view model calculates which recurring agreements are due and filters completed/skipped visits.

Important limitations:
- The deployed Worker currently exposes health only. **Customer/day endpoints are not deployed**, pending Clerk issuer/JWKS/audience configuration, trusted business onboarding and cross-tenant tests.
- The recurring tables created via Cloudflare API have a minimal schema. They are NOT identical to the stricter migration document (which contains extra checks/indexes/created_at). Before production use, create an additive migration to reconcile constraints and indexes, or recreate with reviewed migration in a fresh staging environment. Do not treat applying that stricter CREATE TABLE IF NOT EXISTS migration as a retrofit.
- Zero real businesses or customers have been onboarded.
- The Daily Work Queue is NOT a travel-optimized route; no road matrix/fuel API yet.
- GreenCollar iPhone build and Clerk session have not been tested on-device.

Next gating steps: Clerk verified JWT template/issuer/audience; owner provisioning; customer/business CRUD and isolation tests; deployed authenticated endpoints; secure mobile configuration; road travel matrix; then full Autopilot workflow.
