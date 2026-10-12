# GC-STAGING-ENDPOINT-20261012 — phase handoff

Work: CONFIGURED. Delivery: source configuration and a manual deploy path; the Worker has not been deployed and the URL is not live.
Phase interval: October 12, 2026 15:21:32–15:26:30 America/New_York (about 5m elapsed at this handoff). The 15 roles are conceptual review lenses used by one assistant; role times are approximate and overlap.

## Decision and change
The owner has no custom domain yet. Use Cloudflare's account workers.dev subdomain temporarily. Cloudflare account subdomain read-only lookup returned `email-42c.workers.dev`; expected staging URL after deploy: `https://greencollar-api-staging.email-42c.workers.dev`. This expected URL is not live yet.

In the staging environment only, `cloudflare/wrangler.toml` now sets `workers_dev = true` and `preview_urls = false`. Production has no workers.dev setting change, route or deployment. Staging binds only D1 `greencollar-staging` (`8e427f86-efc4-4a1c-a92c-1d2f57093bf8`), with the five migrations and public Clerk development OIDC metadata. No secrets were added.

Added `.github/workflows/deploy-staging.yml`: manual dispatch on `main`, requires typing `DEPLOY-STAGING`, uses the GitHub `staging` environment, and runs only `npx wrangler deploy --env staging` with `CLOUDFLARE_API_TOKEN`. No automatic deploy, preview URL, or production deploy is configured. The workflow cannot run successfully until the PR chain is merged and that secret is available.

## Verification / remaining work
- Worker inventory confirmed only `greencollar-api` exists; `greencollar-api-staging` has not been uploaded. Therefore no public endpoint exists at handoff.
- Account workers.dev subdomain read and staging config review completed.
- CI run #115 (commit `0a4b18a`) passed the Cloudflare job, including Worker typecheck, staging dry-run bundle and auth gate tests. The run was ultimately marked cancelled as later branch commits superseded it; its app typecheck and scheduling test steps completed successfully.
- Next: finish CI; review/merge the stacked source PRs; ensure GitHub has the `CLOUDFLARE_API_TOKEN` secret; run manual staging deploy; verify `/health` and unauthenticated `/v1/session` (expected 401); then connect Clerk/app staging URL and test authenticated phone workflow with synthetic records only.
- Production schema reconciliation and migration remain blocked pending a verified backup and baseline plan.

## Surface impact
- **Live:** no public pages, production API, or production data changed.
- **Planned:** temporary staging API URL for Today/Invoices device tests; custom branded domain can replace it after purchase.
- **Documentation only:** this handoff.
- **Testing only:** account subdomain/config inspection and CI dry-run; no staging Worker/device tests yet.

| Role | Considered | Completed | Approx. attention | Pages/posts impact |
| --- | --- | --- | ---: | --- |
| SWITCH | Advance staging while preserving release order and production isolation | Selected temporary endpoint path; added a gated staging-only deployment route | 0.2 min | Planned staging API |
| LEDGER | Preserve endpoint decision and exact state | Recorded account subdomain, expected URL, deploy prerequisites and not-live status | 0.2 min | Documentation only |
| INK | Make phone workflow reachable without domain purchase | Identified future test URL; kept Today/Invoices device run pending | 0.1 min | Planned Today/Invoices |
| PROOF | Confirm the route and Worker are actually published | Verified staging script is absent; no false claim of a live URL | 0.2 min | Testing only |
| LANTERN | Check current hosting topology and account route | Read account workers.dev subdomain and Worker inventory | 0.2 min | Documentation only |
| FORK | Isolate exposure from production and preview builds | Set staging only; kept preview URLs off; made deploy manual and environment-scoped | 0.3 min | Planned staging API |
| SIGNAL | State operational readiness accurately | Marked configured, not deployed; documented health/auth checks as gates | 0.2 min | Testing only |
| THREAD | Keep temporary endpoint consistent with brand/environment | Set expected Worker name to `greencollar-api-staging` | 0.1 min | Planned staging API |
| SPARK | Avoid a domain purchase as a release dependency | Used existing account subdomain path; no new paid service or custom route | 0.2 min | Planned Today/Invoices |
| RIVET | Validate Wrangler settings and deployment command | Staging dry-run passed; manual workflow pins deploy command to `--env staging` | 0.4 min | Staging config; testing |
| INNOVATOR | Make handoff evidence easy to interpret | Added the phase note distinguishing expected, configured and live URLs | 0.2 min | Documentation only |
| LAWYER | Reduce public exposure and production risk | Kept preview/automatic deployment off; no production config or secrets changed | 0.3 min | Staging config; no live pages |
| USER | Reach an authenticated mobile workflow | Prepared temporary endpoint path; sign-in/device check still pending | 0.2 min | Planned Today/Invoices |
| ACCOUNTANT | Avoid domain expense as a release dependency | Used existing account subdomain and existing GitHub Actions; no paid service added | 0.2 min | Planned staging API |
| CONNECTOR | Confirm Cloudflare/GitHub prerequisites | Found account subdomain; documented need for merged source and deploy token | 0.3 min | Staging API; documentation |

## Changed paths
- `cloudflare/wrangler.toml` (staging-only route setting)
- `.github/workflows/deploy-staging.yml` (manual staging-only deploy path)
- `docs/handoffs/GC-STAGING-ENDPOINT-20261012.md` (this handoff)
