# GC-STAGING-PREFLIGHT-20261012 — phase handoff

Work: REVIEW. Delivery: STAGING_DEPLOYED for the database schema only; Worker/app access is blocked.
Phase started October 12, 2026 at 15:09:44 America/New_York. Exact total elapsed time and final CI run are recorded in the PR. Per-role times are approximate and overlap; the 15 roles are conceptual lenses applied by one assistant, not independent reviewers.
Branch: green/staging-preflight-20261012. Depends on PR #23 and PRs #20–#22.
Acceptance: use a dedicated synthetic staging database; apply and track the current migration chain; verify the exact completion write against D1; remove synthetic rows; keep production untouched; document any access blocker.
Cloudflare resource: `greencollar-staging`, ID `8e427f86-efc4-4a1c-a92c-1d2f57093bf8`, US jurisdiction / ENAM primary. Created October 12 at 19:13:06 UTC. Five source migrations applied and filenames recorded in Wrangler's standard `d1_migrations` table. The generated ledger layout was checked against Cloudflare Workers SDK migration helper source.
Staging tests: synthetic business, owner, customer, location, agreement and due visit. Cloudflare D1 returned the captured customer/service/$76.50; after changing the agreement, repeated completion returned no row and left the original snapshot and 45 minutes intact. All synthetic rows were deleted and zero remaining rows were confirmed.
Production impact: none. The existing production D1 and Worker were inspected read-only. The production D1 has 7 application tables but no `d1_migrations` table; its existing agreement/visit tables predate or differ from the current source migrations, and it has no billing snapshot columns. The current Worker has its D1/OIDC bindings, but no configured workers.dev endpoint, preview URLs, custom Worker domain, or zone route. Its deployed source contains the health route and none of the new /v1 API route markers.
The staging Wrangler binding now targets only the new staging ID with `workers_dev = false`. CI runs Wrangler's dry-run bundle validation without uploading/deploying. No real customer rows, JWTs, or secret values were read or written.
Remaining gate: choose/enable a staging-only public URL or attach an approved custom domain, then deploy the staging Worker, configure the app’s staging API URL, and run authenticated sign-in/completion/invoice review on a device. Production schema reconciliation requires a verified backup and migration-ledger baseline before any migration.
D1 usage is small and within Cloudflare's published included storage allowance; this phase added an 8 KiB empty database before migrations and no ongoing workload beyond a few tests.

| Role | Considered | Completed | Approx. attention | Pages/posts impacted |
| --- | --- | --- | ---: | --- |
| SWITCH | Release order and scope | Kept production untouched; staged the database after PR #23 and wrote the next gate | 0.5 min | Staging database; documentation |
| LEDGER | Versioned environment record | Recorded D1 ID, migration set, results, source/dependency and blocked owner action | 0.6 min | Documentation only |
| INK | Phone acceptance and route status clarity | Made the absence of a public staging route an explicit acceptance blocker | 0.2 min | Planned device pages |
| PROOF | Actual migrations, writes, retries and cleanup | Verified Cloudflare D1 schema and exact write; confirmed synthetic cleanup | 1.0 min | Testing only |
| LANTERN | Production schema and source history | Compared deployed table metadata and Worker routes with repository migrations | 0.8 min | Documentation |
| FORK | Synthetic identifiers and dataset isolation | Used stable test IDs in staging and removed the synthetic rows | 0.3 min | Staging database; testing |
| SIGNAL | Distinguishing stage success from device readiness | Recorded DB migration success separately from unavailable API/device flow | 0.3 min | Planned Today/Invoices |
| THREAD | One GreenCollar brand and environment naming | Used `greencollar-staging` and `greencollar-api-staging` | 0.2 min | Planned staging app |
| SPARK | Smallest useful staging setup | Added a dedicated D1 and no-deploy bundle check | 0.3 min | Staging config; CI |
| RIVET | Wrangler config and migration compatibility | Added staging D1/env config and CI dry-run bundle validation | 0.7 min | Staging API config; testing |
| INNOVATOR | Evidence legibility | Recorded exact snapshot behavior and route absence in the handoff | 0.2 min | Documentation |
| LAWYER | Tenant privacy, billing, and production data risk | Used synthetic staging data only; no production writes or live backup export | 0.4 min | Staging/test only; documentation |
| USER | Authenticated phone workflow | Confirmed there is no address to load the staging app yet; phone run remains pending | 0.3 min | Planned Today/Invoices |
| ACCOUNTANT | Cost and avoidable work | Reused D1, used a tiny isolated DB, ran no extra CI job, and removed fixtures | 0.3 min | Staging resource; CI |
| CONNECTOR | Cloudflare, GitHub and endpoint readiness | Confirmed account, D1, Worker bindings/deployments and missing public route | 0.8 min | Staging resource; documentation |

Changed paths:
cloudflare/wrangler.toml
.github/workflows/checks.yml
docs/handoffs/GC-STAGING-PREFLIGHT-20261012.md

Next owner: CONNECTOR to enable a staging-only route choice; RIVET/SWITCH to deploy and verify the API once an endpoint is available. Production work stays blocked until D1 backup/schema history are reconciled.
