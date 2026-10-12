# GC-STAGING-ENDPOINT-20261012 — phase handoff

Work: CONFIGURED. Delivery: source configuration only; Worker has not been deployed and the URL is not live.
Phase interval: October 12, 2026 15:21:32–15:23:00 America/New_York (1m28s observed; actual work elapsed may run longer). The 15 roles are conceptual review lenses used by one assistant; role times are approximate and overlap.

## Decision and change
The owner has no custom domain yet. Use Cloudflare's account workers.dev subdomain temporarily for staging. Cloudflare account subdomain read-only lookup returned `email-42c.workers.dev`; expected staging URL after deploy: `https://greencollar-api-staging.email-42c.workers.dev`. This expected URL is not live yet.

In the staging environment only, `cloudflare/wrangler.toml` now sets `workers_dev = true` and `preview_urls = false`. Production has no workers.dev setting change, route or deployment. Staging continues to bind only D1 `greencollar-staging` (`8e427f86-efc4-4a1c-a92c-1d2f57093bf8`), with the five migrations and auth metadata from phase #24. No secrets were added. Authenticated routes reject missing/invalid Bearer tokens.

## Verification / remaining work
- Worker inventory confirmed only `greencollar-api` exists; `greencollar-api-staging` has not been uploaded. Therefore no public endpoint exists at handoff.
- Account workers.dev subdomain read and staging config review completed.
- CI dry-run still required on the updated staging config (run expected from PR #24 head).
- Next: deploy this reviewed source to the staging Worker, verify /health and unauthenticated /v1/session (expected 401), then connect Clerk/app staging URL and test authenticated phone workflow with synthetic records only.
- Production schema reconciliation and migration remain blocked pending verified backup and baseline plan.

## Surface impact
- **Live:** no public pages or production API changed.
- **Planned:** temporary staging API URL for Today/Invoices device tests; custom branded domain can replace it after purchase.
- **Documentation only:** this handoff.
- **Testing only:** account subdomain/config inspection and upcoming CI dry-run; no device tests yet.

| Role | Considered | Completed | Approx. attention | Pages/posts impact |
| --- | --- | --- | ---: | --- |
| SWITCH | Advance staging while keeping release order and production isolated | Selected temporary staging endpoint path; left deployment as next gate | 0.1 min | Planned staging API |
| LEDGER | Preserve the endpoint choice and exact state | Recorded account subdomain, expected URL and not-live status | 0.1 min | Documentation only |
| INK | Make phone workflow reachable without domain purchase | Identified future test URL, kept Today/Invoices device test pending | 0.1 min | Planned Today/Invoices |
| PROOF | Confirm the route is actually published | Verified staging script is absent; no false claim of a live URL | 0.1 min | Testing only |
| LANTERN | Check current hosting topology and account route | Read account workers.dev subdomain and current script inventory | 0.1 min | Documentation only |
| FORK | Isolate exposure from production and preview builds | Enabled only the staging environment in source; disabled preview URLs | 0.1 min | Planned staging API |
| SIGNAL | State operational readiness accurately | Marked configured, not deployed; deployment and 401 health checks remain | 0.1 min | Testing only |
| THREAD | Keep temporary endpoint consistent with brand/environment | Set expected name to `greencollar-api-staging` on account workers.dev | 0.1 min | Planned staging API |
| SPARK | Avoid waiting on a domain purchase for testing | Chose the temporary endpoint path with no custom domain change | 0.1 min | Planned Today/Invoices |
| RIVET | Validate the Wrangler environment flags | Set `workers_dev=true`, `preview_urls=false`; CI dry-run is pending | 0.2 min | Staging config; testing |
| INNOVATOR | Make the handoff evidence easy to interpret | Added the phase note distinguishing expected and live URLs | 0.1 min | Documentation only |
| LAWYER | Reduce public exposure and production risk | Kept preview URLs off, kept production config untouched, added no secrets | 0.1 min | Staging config; no live pages |
| USER | Reach an authenticated mobile workflow | Prepared a temporary staging URL path; sign-in/device check still pending | 0.1 min | Planned Today/Invoices |
| ACCOUNTANT | Avoid a domain purchase as a release dependency | Used the existing account subdomain; no new paid service or route resource | 0.1 min | Planned staging API |
| CONNECTOR | Confirm Cloudflare route prerequisites | Read account subdomain; identified staging Worker upload as the blocker | 0.2 min | Staging API; documentation |

## Changed paths
- `cloudflare/wrangler.toml` (staging-only route setting)
- `docs/handoffs/GC-STAGING-ENDPOINT-20261012.md` (this handoff)
