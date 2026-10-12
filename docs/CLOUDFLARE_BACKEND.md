# GreenCollar on Cloudflare

Cloudflare account is shared with News Smyrna but GreenCollar resources are fully separate.

- D1 database: `greencollar-db` (US jurisdiction), id `2c168587-dbe5-41f2-ac57-bbe762842ea2`
- Worker: `greencollar-api` (health check only until user auth is finished)
- Schema source: `cloudflare/migrations/0001_core.sql`

DO NOT connect GreenCollar to `news-smyrna-food`, `news-smyrna-votes`, or any News Smyrna worker.

## Security gate

D1 has no PostgreSQL-style RLS. Every access must validate a signed session and derive a business id from the authenticated membership on the server. Never accept a client-supplied business id as proof of access. Cross-business reference integrity is protected with composite foreign keys. Customer endpoints have not been enabled.

## Still needed

Authentication/verification, business and membership tables, managed onboarding, tenant filtering and tests, customer photo R2 store, recurring visit system, routing, notifications, billing, background processing. No real customer data until these are implemented and tested.

No keys or tokens in this repository.
