# Recurring service scheduling foundation

Implemented: pure TypeScript recurrence generation for daily, weekly, biweekly, monthly, custom day intervals. It supports start/end dates, preferred windows, fixed times, inactive services and test fixtures.

**Important:** This creates due-visit candidates, **not** a full optimized road itinerary. Due visits can be converted to ServiceJob inputs and given to the current baseline planner; true optimization requires a road travel matrix and a more capable solver.

- ISO calendar dates represent the customer's local day; all comparisons use UTC calendar arithmetic to avoid DST shifting dates.
- Monthly service starting on the 31st falls on the last day of shorter months.
- An agreement yields one idempotent visit ID per due date.
- Saved queues and the baseline planner use valid completed-duration history to adjust configured estimates; predicted duration does not by itself prove an appointment or route is feasible.
- The planned `0003_service_agreements.sql` migration is committed but **not deployed** until Clerk auth and per-business authorization are tested.

## Next

1. Review the stacked source changes and run native acceptance for recurring-service creation and queue review.
2. Verify the target authentication, per-business authorization and existing service-agreement schema before any deployment.
3. Add an explicit workflow for editing existing recurring services; this phase adds appointment fields to creation only.
4. Integrate actual road travel and evaluate conflicts across visits before claiming a feasible daily itinerary.

## Service workload preview

The Planner tab now checks the synthetic example jobs against the entered hours and job-count limit. It reports service-minute overage and how many example jobs fall outside the cap. This is a sample workload indicator only: travel, breaks, fixed appointments, customer windows, and fuel are not modeled, and it does not change the saved queue or claim route feasibility.

## Saved service appointment constraints

Task: GC-SERVICE-APPOINTMENT-CONSTRAINTS-20261013. Implementation and handoff owner: Codex; independent reviewer and native device tester remain to be assigned. Source base: PR #59 at `62114cd13d04d733f0441462ac2b8341ce23e34c`. Branch: `codex/phase-service-appointment-constraints`. Work: REVIEW; delivery: PREPARED. Source date: 2026-10-13 UTC. Exact final commit, PR, elapsed time and CI evidence are recorded in the phase PR.

Customers now accepts optional earliest start, latest finish and fixed appointment start when creating a recurring service. Times use the service location's local 24-hour clock and apply to each occurrence. Blank fields preserve flexible timing. Minutes are stored without timezone conversion; latest finish alone may be 24:00. The configured service estimate must fit within a same-day window, and a fixed start cannot precede the earliest start. Overnight spans, invalid clocks, fractional/out-of-range minute values and individually impossible windows reject before the client sends a write and before the server inserts a row.

The authenticated agreement endpoint binds these fields into the existing nullable columns in `0003_service_agreements.sql` and returns them in the saved agreement. No migration is added or applied. Membership, write role and customer/location ownership checks remain required. If a successful response omits or changes requested appointment times, the client reports that the save may have happened and asks for a reload before retrying; it never repeats the write automatically. This detects an older deployed endpoint that ignores the new fields.

Recurring-service cards and Today show the saved constraints, including midnight. Queue approval binds all three appointment fields alongside the existing order, price, estimate and workload snapshot. A timing change requires a fresh review, and previous snapshot versions cannot restore approval. Flexible services remain valid. This does not add scheduling edits, timezone lookup, actual travel, breaks, cross-visit conflict detection or arrival calculations to Today; workload approval still assesses service minutes and visit counts only.

Acceptance covers valid fixed/window/flexible creation, midnight and 24:00 boundaries, duration/window consistency, exact request/response fields, uncertain acknowledgments without automatic retries, queue readback and timing-bound approval. A synthetic travel-matrix test confirms the existing baseline planner consumes the fields and leaves late or duration-infeasible visits unscheduled. That test is not a live road routing result. Focused local verification: 36 tests passed. Full app/Worker typechecks, regression totals and existing SQLite migration results are tracked on the phase PR.

Changed paths: `App.tsx`, `src/domain/service-time.ts`, `src/domain/service-agreement.ts`, `src/data/service-agreement-api.ts`, `src/data/saved-day.ts`, `src/domain/saved-queue-review.ts`, `cloudflare/src/service-agreement-api.ts`, `tests/service-time.test.ts`, `tests/service-agreement.test.ts`, `cloudflare/tests/service-agreement-api.test.ts`, and this document.

Impact: planned Customers recurring-service form/cards and Today queue/approval; planned API persistence into existing columns; testing-only synthetic fixtures and regressions; documentation-only handoff. No live pages/posts, production data, domain, billing or messages changed. This branch is stacked on PR #59 and must be reviewed with its prerequisites.

Next action: reviewer checks the API columns, uncertain-save message, blank/zero distinction and approval invalidation. Device tester verifies iOS/Android clock entry, long queue readability, screen-reader labels, customer/business changes, save/reload on the target API, and restored approval after timing changes. Before release, coordinate the stacked PR chain and inspect the actual target schema/auth configuration. Self-review and automated tests do not replace independent review, native acceptance or deployment.
