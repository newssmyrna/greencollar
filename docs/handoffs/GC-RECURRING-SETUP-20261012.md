# GC-RECURRING-SETUP-20261012 — phase handoff

Work: REVIEW. Delivery: PREPARED. Primary owner: RIVET; coordination: SWITCH.
Source: service-location PR #21 head 94144c26b1e7f5ef478d69bb5721651ed441764f.
Role authority: main README blob a63f87c0f81fe61826645a621035688e30edcadf, read October 12, 2026.
Branch: green/recurring-setup-20261012. Depends on PR #21, which depends on #20.
Phase started October 12, 2026 at 14:49 America/New_York. Exact elapsed completion time and CI outcome are recorded in this phase's PR.
Role attention times below are approximate and overlapping; individual timers were not recorded. These are conceptual perspectives applied by one assistant, not separate workers or independent QA.

## Acceptance and affected surfaces
- Planned implementation: mobile Customers recurring-service form and list; Today saved-workday refresh; authenticated GET/POST agreement API.
- Existing stable customer/location IDs preserved. New agreement IDs generated independently.
- Shared bounded JSON reader refactor preserves location endpoint behavior.
- Testing only: synthetic validation, client response → actual saved-day summary, worker authorization/ownership and exact SQLite insertion behavior.
- Documentation only: docs/SERVICE_AGREEMENT_SETUP.md and this handoff.
- Live pages/posts impacted: none. No release or migration occurred.
- Acceptance: app/Worker typechecks and tests pass; own/customer/location insertion succeeds while cross-business and wrong-customer addresses insert zero rows; created weekly service enters the due queue and is removed from pending after completion.
- Existing-record edits, historical price snapshots, time-window form controls, deployed JWT/D1 reconciliation and device acceptance remain unfinished.

## Fifteen-role review
| Role | Considered | Completed | Approximate attention | Impact |
| --- | --- | --- | --- | --- |
| SWITCH | Phase order and scope | Stacked work behind customer/address setup; defined next release handoff | 0.5 min | Planned + documentation |
| LEDGER | Discoverable continuity | Added acceptance, paths, dependency and capability handoff | 0.5 min | Documentation |
| INK | Form labels and touch selection | Added address/schedule selections and accessible field labels using existing styles | 0.5 min | Planned Customers screen |
| PROOF | Ownership, malformed input and queue regression | Auth/tenant tests and synthetic queue compatibility checks; self-review only | 1 min | Testing |
| LANTERN | Existing recurrence semantics | Read actual recurrence source; preserved weekly/month-end behavior | 0.3 min | Planned + documentation |
| FORK | Stable IDs, integer cents and synthetic data | Preserved customer/location IDs; used clearly synthetic fixtures | 0.3 min | Planned + testing |
| SIGNAL | Save and follow-up read outcomes | Separate successful-save notice from failed queue refresh | 0.2 min | Planned Customers screen |
| THREAD | Single GreenCollar identity and vocabulary | Reused existing visual style and recurring-service wording | 0.2 min | Planned Customers screen |
| SPARK | Bounded friction reduction | Added scheduled occurrence preview and queue refresh within existing workflow | 0.3 min | Planned Customers + Today |
| RIVET | API, validation, data contracts and integration | Implemented agreement create/list, client adapter, UI and shared JSON helper | 3 min | Planned app/API + testing |
| INNOVATOR | Readable schedule and price information | Displayed service, per-visit price, duration, dates and occurrence count | 0.2 min | Planned Customers screen |
| LAWYER | Customer privacy and historical billing changes | Kept fixtures synthetic; recorded price-snapshot prerequisite for edits; no legal research/clearance | 0.2 min | Documentation |
| USER | Phone setup and interrupted requests | Added direct selection, error/empty states and duplicate-save guard; real device test pending | 0.5 min | Planned Customers screen |
| ACCOUNTANT | Engineering and provider expense | Reused queue/recurrence logic; no new routing/SMS/payment provider work | 0.2 min | Planned + testing |
| CONNECTOR | Source/version access and deployment readiness | Verified GitHub read/write path; preserved existing deployment gates | 0.3 min | Documentation + testing |

## Exact paths
App.tsx
src/domain/service-agreement.ts
src/data/service-agreement-api.ts
cloudflare/src/service-agreement-api.ts
cloudflare/src/request-json.ts
cloudflare/src/service-location-api.ts
cloudflare/src/index.ts
tests/service-agreement.test.ts
cloudflare/tests/service-agreement-api.test.ts
docs/SERVICE_AGREEMENT_SETUP.md
docs/handoffs/GC-RECURRING-SETUP-20261012.md

Next owner: SWITCH, for review of the dependent PR chain and current-source integration.
Next implementation: persisted completed-visit price snapshots and effective-date rules before agreement editing; authenticated staging full workflow verification.
