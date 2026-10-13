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


## Phase 74 — Availability event capture foundation
- Add authenticated, tenant-scoped break, sick, and unavailable event capture.
- Workers can report only themselves; owners/admins can record for verified business members and review team availability.
- Store local work date and minute intervals; sick/unavailable may span a full day without collecting diagnoses.
- Event capture never changes jobs or routes; manager replan integration and UI remain future work.


## Phase 75 — General workday and multi-worker route scheduler
- Make the workday planner the home for worker availability, lunch blocks, trucks, routes, and assignments.
- Allow multiple workers per route and separate worker-attributed tasks at the same stop.
- Keep shared truck GPS route-level; task progress remains individual; split crews require explicit route legs.
- Track labor capacity separately from route elapsed time and do not assume two workers double productivity.
- Keep the pilot's 10-stop target scope (operation-wide or per truck) explicit and unresolved.
- Draft/publish versioning and owner/admin recalibration control remain required; this phase is documentation only.


## Phase 76 — Draft workday schedule persistence
- Add a tenant-scoped, versioned draft endpoint for workday route, truck, crew, stop, and task assignments.
- Validate worker membership, active scheduled agreements, stop uniqueness, same-day crew/truck conflicts, and task-to-crew assignments.
- Permit owner/admin draft edits; workers can read only routes assigned to them.
- Draft saves never publish or mutate service agreements; route UI, GPS, availability optimization, and publish remain future work.


## Phase 79 — Availability-aware schedule draft validation
- Reject draft saves when a selected worker's scheduled shift overlaps a recorded sick or unavailable interval for that business date.
- Keep availability checks tenant-scoped and run them on the server before any schedule write.
- Preserve lunch/break events as intervals; do not treat a meal break as a full-shift absence.
- Conflict returns an actionable response without changing the saved draft; lunch-aware route timing remains a follow-on because stops do not yet have time windows.

## Phase 80 — Per-worker lunch blocks in schedule drafts
- Allow an optional lunch interval on each worker assignment, separate from route and truck hours.
- Validate each interval is ordered, within the worker shift, non-overlapping, and limited to three blocks per worker.
- Show separate lunch start/end inputs for each selected worker in the owner/admin draft editor.
- Preserve lunch blocks in saved and loaded drafts for later capacity and route timing calculations.
- Stop arrival times and route feasibility remain unmodeled until travel and stop time windows are available.

## Phase 81 — Reported crew availability and lunch in schedule drafts
- Load business/date-scoped availability alongside the verified crew roster.
- Show break, sick, and unavailable events for each worker; prefill reported breaks into editable lunch blocks.
- Let the owner/admin adjust, remove, or add worker-specific lunch intervals before saving.
- Clear cached availability when business or work date changes, ignore stale roster requests, and keep sick/unavailable overlap enforcement on the server.
- A reported event never publishes or changes a route by itself.


## Phase 82 — Edit saved single-route workday drafts safely
- Hydrate existing single-route drafts into the current editor without dropping truck, worker, lunch, stop order, or task data.
- Preserve multi-route, stale-stop, removed-worker, and unsupported shift drafts as read-only.
- Update using the saved version and reject concurrent edits or deleted drafts.
- Test hydration, preservation, and read-only cases; do not publish routes or contact customers.

## Phase 83 — Edit stop tasks in saved route drafts
- Edit saved task names, estimates, and route-worker assignments while preserving each task ID.
- Remove tasks from the draft with clear feedback when crew changes leave an assignment invalid.
- Validate every selected stop's task names, whole-minute estimates, and assignments against the selected route crew before saving.
- Keep schedule changes draft-only and covered by focused domain tests.

## Phase 84 — Edit saved multi-route drafts one route at a time
- Validate every saved route, route membership, unique visit and route identifiers, and cross-route truck and worker conflicts before enabling edits.
- Let managers select a saved route and edit its crew, shift, lunch, stops, and tasks with the existing editor.
- Save only the selected route while preserving every other route and the schedule version check.
- Keep malformed schedules read-only and retain draft-only behavior; do not publish routes or contact customers.
