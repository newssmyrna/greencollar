# GC-BILLING-SNAPSHOT-20261012 — phase handoff

Work: REVIEW. Delivery: PREPARED. Primary owner: RIVET; coordination: SWITCH.
Branch: green/billing-snapshots-20261012. Base: recurring-service PR #22 at green/recurring-setup-20261012; depends on PRs #20–#22.
Role authority: GreenCollar role guide in main README; 15 conceptual review perspectives applied by one assistant, not separate workers or independent QA.
Phase started October 12, 2026 at 14:59 America/New_York. Actual elapsed time and checks are recorded in the PR. Per-role attention estimates are approximate and overlap.
Acceptance: authenticated completion atomically records a visit and its customer ID/name, service name and integer-cent agreed price; completed visits are immutable on retry; daily reads expose the snapshots; invoice drafts use those fields and hold legacy unsnapshotted visits for manual review.
Live pages/posts impacted: none. No deployment or migration was performed.
Planned app pages: Today completion status; Invoices draft review.
Testing only: synthetic completion/authorization/conflict cases, legacy invoice hold, and SQLite migration/write behavior.
Documentation only: this handoff and migration comments.
Schema migration is additive and un-applied. D1 schema reconciliation, backup, staging migration and authenticated device workflow remain gates before release.

| Role | Considered | Completed | Approx. attention | Impact |
| --- | --- | --- | ---: | --- |
| SWITCH | Dependency order and release gates | Stacked after customer, location and recurring-service setup; scoped migration and PR | 0.4 min | Documentation; planned |
| LEDGER | Durable phase record and next action | Recorded source dependency, acceptance, checks, exact paths and deployment state | 0.4 min | Documentation |
| INK | Invoice clarity for historical gaps | Added a plain manual-review notice when old visits lack snapshots | 0.3 min | Planned Invoices page |
| PROOF | Tenant identity, repeat writes, malformed input, legacy billing | Added focused Worker/domain tests; self-review only | 0.9 min | Testing only |
| LANTERN | Existing completion and invoice path | Traced completion write and current agreement-based invoice projection | 0.3 min | Documentation |
| FORK | Stable visit and agreement identifiers | Retained existing IDs; snapshots are fields on the original visit | 0.2 min | Planned data |
| SIGNAL | Completion and billing hold feedback | Preserved completion response; explained legacy review hold in Invoices | 0.2 min | Planned Today/Invoices |
| THREAD | GreenCollar vocabulary and voice | Reused existing visit and invoice language | 0.1 min | Planned pages |
| SPARK | Narrow history protection | Captured completion-time price and service/customer identity without adding payment flows | 0.3 min | Planned Today/Invoices |
| RIVET | API, schema, read path and invoice projection | Added atomic snapshot upsert, daily fields, migration and domain mapping | 2.8 min | Planned API/app; testing |
| INNOVATOR | Invoice readability | Draft now carries customer/service names from completion time | 0.2 min | Planned Invoices page |
| LAWYER | Billing history and customer information risk | Avoided inventing legacy prices; captured minimum invoice identity; no legal clearance | 0.3 min | Planned behavior; documentation |
| USER | Owner reviewing today’s finished work | Made old visits requiring manual review visible; phone/device test remains pending | 0.3 min | Planned Today/Invoices |
| ACCOUNTANT | Amount accuracy and added operating cost | Preserved integer cents; no payment, accounting or external provider added | 0.2 min | Planned + testing |
| CONNECTOR | Repository/CI/migration readiness | Used dependent GitHub PR workflow; documented un-applied migration and staging gates | 0.3 min | Documentation + testing |

Exact changed paths:
cloudflare/src/visit-completion-api.ts
cloudflare/src/day-data-api.ts
src/data/greencollar-api.ts
src/domain/invoice.ts
src/domain/completed-invoice.ts
App.tsx
tests/completed-invoice.test.ts
docs/handoffs/GC-RECURRING-SETUP-20261012.md
cloudflare/tests/visit-completion-api.test.ts
cloudflare/migrations/0005_visit_billing_snapshots.sql

Next owner: SWITCH for dependent PR review and schema/backup reconciliation. Next implementation after this source phase: staging migration and full authenticated device verification; only then consider agreement editing.
