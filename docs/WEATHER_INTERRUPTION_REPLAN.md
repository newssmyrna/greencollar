# Early-ending workday and schedule recalibration

**Status:** Phase 71 adds the pure draft calculator and role-capability map. Phase 72 stages authenticated, persistent interruption capture and an owner/admin-only report inbox. Draft option UI, schedule publishing, and customer notifications remain planned; nothing is live.

## Scenario

A workday can end early for any reason. Rain is a common Florida example: for example, a ten-stop route completes two visits before crews must stop. GreenCollar must preserve those completions, make the eight unfinished visits visible, and show how moving them affects tomorrow and the following schedule days. It must never silently rewrite a route or notify customers without a manager's decision.

## Roles and decision rights

Use capabilities rather than mutually exclusive job titles:

- **Owner/operator:** has manager capabilities and can also use the field-worker workflow for their own stops.
- **Manager/admin:** reviews and approves schedule proposals for the business.
- **Field worker:** records completed work and a weather interruption, sees their assigned work and manager-approved updates, and may request a replan. A worker cannot publish a schedule change or contact customers through an unapproved proposal.

This maps to the existing `owner` / `admin` / `worker` membership roles. Phase 71's capability map gives owners both manager and field-work capabilities, admins manager capability, and workers field-work capability. An owner who also mows should not need a second account or lose manager authority to use the worker screen.

## Proposed flow

1. A worker or owner records a weather interruption for the active workday. Keep completed visits intact; identify unfinished visits from the saved work order.
2. Save an interruption event with business, local work date, actor, stop time, reason category, completed visit IDs, and remaining visit IDs. Do not use device GPS or a weather API as a prerequisite.
3. Generate a **draft only** recalibration across a manager-selected horizon (initial default: next five operating days). Show alternatives such as moving all remaining visits to tomorrow, spreading them across available crews/days, or keeping them on their original due dates for a manager to handle manually. The engine must respect working hours, staff/truck capacity, service windows, existing commitments, and the operator's chosen stop order wherever possible.
4. Compare each alternative against the currently approved plan. Explain every moved visit and any unscheduled visit. Include:
   - visits completed, carried over, moved, and still unplaced;
   - daily visits, crew hours, service minutes, drive minutes, and utilization by crew/truck;
   - overtime or capacity conflicts, appointment-window conflicts, and how many days each service is delayed;
   - projected revenue by day and any recurring-work impact;
   - customer notifications that would be needed, clearly separated from schedule changes.
5. The manager chooses an option, edits it if needed, and sees a final diff before committing. Only the explicit manager confirmation publishes the new work plan. Customer notifications require a separate review and confirmation.
6. Workers then see the approved changes for the next shift. Preserve the prior plan and interruption/proposal/decision in an audit history so the team can explain what changed and why.

## Scheduling and data rules

- Do not mark unfinished visits complete, skipped, or canceled because of weather.
- Keep recurring agreement cadence separate from a one-off weather reschedule. Record a dated schedule exception/override with a link to the original visit rather than changing the recurring agreement.
- Replanning is advisory until approved. Never auto-move visits because it is raining, because a device went offline, or because a worker tapped the interruption control.
- Use current saved business locations and approved travel estimates only. Any future road matrix request must retain the existing explicit consent and monthly budget gates.
- Recalculate against the latest server schedule version at approval. If it changed since the proposal, show the conflict and require a refreshed proposal.
- Keep workers from approving business-wide changes. Owner/operator accounts retain both management and field capabilities.
- Support retry/idempotency so offline interruption capture cannot duplicate events or proposals.

## Acceptance checks for implementation

- Completing two of ten route visits and recording rain leaves exactly eight unfinished; completed work and billing state remain unchanged.
- Two managers reviewing the same event cannot silently overwrite a newer schedule version.
- Worker captures an interruption but cannot publish a proposal; owner/operator can capture work and approve a plan.
- Every option shows the same defined metrics and discloses capacity/window violations before approval.
- Commit requires a named manager and creates an auditable before/after diff. Notifications remain a separate action.
- Failed, stale, or offline recalculation preserves the existing approved queue and all visit states.
- Test examples cover moving 8 visits into tomorrow, spreading them over multiple days/trucks, insufficient capacity, fixed service windows, and the owner/operator acting as both manager and worker.

## Open decisions before implementation

Confirm the replan horizon, which schedule constraints are hard versus warning-only, whether customer notifications are in scope, whether the initial planner can use manual drive-time estimates only, and which managers may approve. The pilot's stated 10 stops/day remains ambiguous as a total across the three trucks or per truck; do not infer capacity from the current three-truck preview.

## Phase 71 calculation foundation

`src/domain/weather-replan.ts` now creates two review-only alternatives from explicitly supplied due visits and per-truck/day service-minute and stop capacity: put as many visits as possible on the next day, or spread them across the supplied horizon. The report includes completed visits preserved, moved and unplaced counts, projected revenue, delay days, and daily service-minute utilization. The calculator does not mutate the schedule, persist a proposal, or assign travel time. It warns that drive time, windows, breaks, and route feasibility are not evaluated. Capacity is an explicit input; the code does not infer whether 10 daily stops means total or per truck.

## Phase 72 — interruption capture and manager inbox

A worker or owner can record a weather interruption with the current work date, completed visit IDs, and remaining due visit IDs. The API verifies business membership, requires owner/worker for reporting and owner/admin for inbox reads, checks submitted visits against the business's active agreements, and stores an idempotent event. The report endpoint does not update service visits or agreements. The Today screen exposes field reporting to owner/worker and a date-scoped report inbox to owner/admin. Manager-facing alternatives and schedule changes are still absent.

## Phase report classification

- **Testing only:** pure calculator scenarios and authenticated interruption API tests cover reporting, manager-only inbox access, visit validation, and role capabilities.
- **Planned:** manager review of schedule alternatives, metrics UI, schedule publishing, audit of manager decision, and separately approved customer notifications.
- **Live:** none. The staged app/API behavior is not deployed and never mutates work schedules.


### Reason capture

The report records either rain or other. Other covers any non-rain reason for ending the day early, including lightning, unsafe conditions, equipment trouble, staffing, customer changes, or an owner/operator decision. No reason is required to fit a weather-only category.
