# Staging D1 schema reconciliation

This runbook prepares the service-agreement schema for staging verification. It does not authorize production changes. Do not run a remote write until the target database has been positively identified as staging and its recovery path is recorded.

## 1. Confirm the target

From `cloudflare/`, inspect the active Wrangler configuration and the Cloudflare dashboard together:

- Record the staging database name and UUID from the dashboard.
- Confirm the selected Wrangler config binds `DB` to that exact staging UUID. The checked-in `wrangler.toml` currently has one D1 binding; its name alone does not establish that it is staging.
- If the repository has no staging-specific config, stop and have the maintainer create one with the verified staging UUID. Do not edit the existing binding by guesswork.
- Confirm the Worker environment points to the staging Clerk issuer, audience, and JWKS URL. Never copy production or development credentials into this runbook.

Record the database name, UUID, config path, environment, date, and operator in the release record. If any value is unknown or inconsistent, stop here.

## 2. Capture the current state (read-only)

Use the explicitly verified staging config for every command below. Keep exported data in an access-controlled local directory; it may contain test customer information, and it must not be committed.

```sh
cd cloudflare
npx wrangler d1 list
npx wrangler d1 info greencollar-db --config ./wrangler.staging.toml
npx wrangler d1 migrations list greencollar-db --remote --config ./wrangler.staging.toml
npx wrangler d1 export greencollar-db --remote --no-data --output /tmp/greencollar-staging-schema-before.sql --config ./wrangler.staging.toml
npx wrangler d1 execute greencollar-db --remote --command "SELECT name, sql FROM sqlite_master WHERE type = 'table' ORDER BY name" --config ./wrangler.staging.toml
```

Replace `greencollar-db` and `wrangler.staging.toml` only with values already verified in step 1. If the migration ledger table is present, inspect it read-only:

```sh
npx wrangler d1 execute greencollar-db --remote --command "SELECT name, applied_at FROM d1_migrations ORDER BY applied_at" --config ./wrangler.staging.toml
```

If that query reports that the table is missing, record that fact; do not create or seed the ledger manually. Compare the observed schema and migration history with all committed files under `migrations/` (currently `0001_core.sql` through `0004_owner_unique.sql`). A migration filename is not proof that it ran on this database.

## 3. Review the difference before applying anything

Have a maintainer review the schema export, migration ledger, and SQL diff. Resolve any manually created tables, partial migrations, conflicting names, or unexpected data before proceeding. Do not mark migrations as applied by editing the ledger, and do not edit an already-applied migration to force the comparison to match.

Confirm a recoverable staging snapshot exists and record its ID and timestamp. Wrangler's migration apply flow captures a backup, but record the available restore mechanism for this database's storage version before execution. Never test a restore on the only staging copy.

## 4. Apply only to the verified staging database

After the target and diff have been reviewed, apply pending migrations interactively (do not use CI or a non-interactive confirmation skip):

```sh
npx wrangler d1 migrations apply greencollar-db --remote --config ./wrangler.staging.toml
```

Read Wrangler's proposed migration list and confirm only if every migration is expected for this staging database. If the list is surprising, cancel and investigate.

## 5. Verify and record

```sh
npx wrangler d1 migrations list greencollar-db --remote --config ./wrangler.staging.toml
npx wrangler d1 execute greencollar-db --remote --file tests/schema-contract.sql --config ./wrangler.staging.toml
npx wrangler d1 export greencollar-db --remote --no-data --output /tmp/greencollar-staging-schema-after.sql --config ./wrangler.staging.toml
```

Compare the after-schema with the reviewed expected schema. Then run authenticated location and agreement create/list/pause/resume smoke tests using a dedicated staging tenant and disposable test records. Verify tenant isolation with a second staging tenant. Do not use real customer records.

Record the command output, migration versions, schema comparison result, backup ID, Worker version, test tenant, and operator in the release record. Remove local exports when the review is complete under the project's data-handling policy.

## Stop conditions

Stop without applying a migration if the database UUID is unverified, the config resolves to a non-staging environment, the current schema/history differs unexpectedly, a backup/recovery path is unavailable, or any check would use live customer data. Production reconciliation needs its own reviewed release plan and explicit authorization.
