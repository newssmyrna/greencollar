# Database setup and validation

## Active path: Cloudflare D1

Cloudflare D1 is the current backend direction. Migration source is in `cloudflare/migrations/`; it must be reconciled with the actual hosted schema before real customer use.

The latest recorded live-data review found that recurring-service tables had been created with a minimal schema that differs from the stricter committed migrations. `CREATE TABLE IF NOT EXISTS` will not retrofit missing constraints or indexes. This review did not inspect the live database during the current code changes.

Before connecting real customer data:

1. Make a reviewed staging copy or create a clean staging database.
2. Inspect actual tables, indexes, constraints, and applied migration history.
3. Prepare an additive reconciliation migration for the real schema; do not apply the stricter create-table script as if it altered existing tables.
4. Test business isolation, owner/admin/worker roles, cross-tenant foreign keys, onboarding races, duplicate completion, invalid payloads, and rollback.
5. Verify backup and restore procedures, then document the tested snapshot and migration state.
6. Only after staging passes, decide and record the production migration and deployment.

Do not place live customer data in test fixtures or source control.

## Archived alternative

`supabase/migrations/0001_core.sql` is retained as an alternative design only. Supabase is not the active backend path and that migration is not a production deployment artifact.
