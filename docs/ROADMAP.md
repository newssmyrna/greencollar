# Roadmap

## Completed
- Product vision, brand direction, 7-step operator workflow.
- Clickable standalone browser prototype (held outside repository).
- Product blueprint v0.2.
- GitHub repository initialized.

## Phase 2 — Foundation (current)
- Establish app code and conventions.
- Preserve existing wireframe as design reference.
- Build secure customer, services, locations, jobs, recurrence and business settings storage.
- Seed synthetic business/customer fixtures.
- Build working phone UI and automated tests.

## Phase 3 — Integrated Operating Experience
- Scheduling solver and road routing, vehicles/equipment and cost estimates.
- Day execution, GPS-assisted timers, notes, photos, robust offline behavior.
- SMS and customer notifications, invoicing and payment collection, customer portal.
- Historical predictions and mid-day replanning.

## Phase 4 — Product Validation
- Full synthetic end-to-end journey then controlled real-world trials.
- Reliability, app-store readiness, privacy, security and support.
- Launch paid product only after entire journey succeeds.

Keep every change narrowly scoped and tested; never silently remove agreed features.


## Phase 71 — Weather interruption replan foundation
- Pure draft calculator compares next-day carryover with spreading across explicitly supplied future truck/day capacities.
- Completion, remaining visits, moved/unplaced counts, projected revenue, delay, and service-minute utilization are reported.
- Current `owner` / `admin` / `worker` roles map to manager and field-work capabilities; owner/operator has both.
- Manager review UI, interruption capture, persistent audit trail, version-safe schedule commit, and separate notification approval remain future work.


## Phase 72 — Shortened-workday reporting
- Field worker/owner can record an early ending for rain or another reason, with completed and remaining visit IDs.
- Owner/admin can review the date-scoped report inbox; worker cannot access the management inbox.
- Events are idempotent and audited; report writes do not change visits, agreements, schedule, or customer-notification state.
- Schedule option comparison and manager-approved publishing remain planned.


## Phase 73 — Crew availability, incidents, and customer rescheduling
- Define lunch/break and sick/unavailable time blocks without collecting medical diagnoses.
- Define private, tenant-scoped job-site incident reports with photo upload and manager follow-up.
- Define manager-controlled SMS proposals; a customer must affirmatively accept before a manager commits a visit change.
- Specify offline upload, authorization, audit history, schedule-version checks, failure paths, and acceptance tests.
- Documentation only; no provider setup, purchase, text, schedule write, or live change.
