# Engineering notes and known gaps

Current scheduler is a deterministic **greedy baseline** and does not claim globally optimal road routing. Synthetic matrix is not realistic road data. Fixed appointments, recurring visits, deadlines and time zones require additional solver work. Current code has no Supabase client and does not persist records.

## Critical database work before running SQL

The draft schema in `supabase/migrations/0001_core.sql` must **not** be deployed as production-ready. Strengthen tenant-scoped cross-table relationships so a valid member cannot link a record to another tenant's customer/site/job by UUID. Limit owner/admin-only write operations, add safe creation pathways, and test RLS with multiple real authenticated roles. Use a separate staging environment and automated isolation tests.

## Test commands

`npm install`, then `npm test` and `npm run typecheck`.

These tests have been authored but **not executed against an installed dependency environment yet**; actual CI green status remains unverified.

## Next engineering order

1. Tighten database integrity and access control.
2. Exercise the scheduler with additional property-based and fixed-appointment cases.
3. Implement customer persistence, profiles and full app screens.
4. Add road matrix with graceful offline/manual fallback.
5. Continue integrated day execution, messages and billing.
