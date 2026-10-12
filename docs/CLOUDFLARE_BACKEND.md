# GreenCollar on Cloudflare

GreenCollar's Cloudflare resources are separate from News Smyrna. Do not connect this app to any News Smyrna database or Worker.

- D1 database: `greencollar-db` (US jurisdiction; configured ID is recorded in the existing operator setup).
- Worker: `greencollar-api`.
- Migration source: `cloudflare/migrations/`.
- Worker source: `cloudflare/src/`.

## Current status

The repository contains signed-token verification, business onboarding, customer/day/visit endpoint source, membership checks, and Worker tests. The latest recorded deployment status says the Worker is health-only; this has not been freshly inspected during this work. Treat authenticated routes as undeployed until a direct deployment check confirms otherwise.

The actual hosted recurring-service tables were previously reported to use a minimal schema that differs from committed migrations. Do not run migrations against production until the schema and migration history are reviewed and a staging reconciliation passes.

## Security

D1 does not provide PostgreSQL-style row-level security. Every protected request must verify identity and check membership server-side. Filter every query by business ID and preserve tenant-scoped foreign-key integrity.

No keys or tokens in this repository.
