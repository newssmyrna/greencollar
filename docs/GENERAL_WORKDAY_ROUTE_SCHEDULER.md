# General workday and crew route scheduler

**Status:** Phase 75 product and data-model requirements. Documentation only; no route-schedule creator or multi-worker task assignment is implemented or live.

## Core model

The day planner creates a workday, then one or more routes. Each route is assigned a truck and one or more workers. Each stop can have multiple work tasks, and each task is assigned to one worker or explicitly marked collaborative. Route order and task order are separate: two workers can perform different tasks at the same property while the vehicle route remains a single itinerary.

| Record | Purpose |
|---|---|
| Workday | Local operating date, business, draft/published status, version, manager |
| Route | Workday, assigned truck, ordered stops, route status |
| Crew assignment | One or more workers on a route, with shift start/end and lunch blocks |
| Stop task | Work to do at a stop, assignee(s), estimated duration, dependencies, status, completion actor |
| GPS trace | Route/truck progress for the shift, linked to the route and device that records it |

Assignments and edits are business-scoped, versioned, and attributable. A worker may be assigned to only one active route at a time unless a manager explicitly splits their shift into non-overlapping blocks.

## Route and crew workflow

1. Owner/admin creates a workday and chooses date, trucks, workers, and working intervals.
2. The scheduler checks availability, existing assignments, scheduled lunch breaks, and truck conflicts.
3. Owner/admin creates routes and assigns one or more workers and a truck to each route.
4. Stops are ordered on the route. For each stop, create tasks (for example mow, edge, trim/weed-whack, blow, or cleanup), select responsible worker(s), and set estimates or dependencies.
5. Review route/crew capacity and unresolved warnings, then publish the workday.
6. Workers see the shared route plus their assigned tasks. A worker can report progress only for tasks assigned to them, unless an owner/admin changes the assignment.
7. A shortened day, sick callout, lunch change, incident, or customer response creates a proposed recalibration. Only the owner/admin can approve and publish the new schedule version.

The owner/operator retains both management and field-work capability. Workers do not publish business-wide schedule changes.

## Capacity and scheduling rules

- Lunch is a time block on a worker’s shift; it reduces that worker’s available labor minutes for the block. Sick/unavailable status removes the worker for the specified interval or whole day. Do not request or store diagnoses.
- Do not treat a two-person crew as automatically twice as productive. Capacity must use task estimates, assignment count, dependencies, and any explicit parallel-work setting.
- Track both route/stop elapsed time and labor minutes. Parallel tasks may reduce elapsed stop duration, while total labor minutes still count for each assigned worker.
- A route cannot be marked feasible solely from service-minute capacity if travel time, customer windows, equipment, breaks, or dependencies are missing. Display modeled inputs and warnings.
- Make the daily stop target scope explicit: **total across the operation** or **per truck/route**. The pilot’s 10 stops/day with 3 trucks remains undecided; do not seed a silent interpretation.
- Show each worker’s available minutes, assigned labor minutes, breaks, route hours, stops, unplaced work, and overtime/conflict warnings before publishing.
- A manager may override a warning only with a recorded reason; hard conflicts (overlapping worker shifts or truck assignments) cannot be overridden by a normal publish.

## Route GPS and two-person crews

- When workers share a truck, the route map follows one route-level GPS trace from the truck/route device. Do not require duplicate tracking streams from both phones to represent the same vehicle trip.
- Both workers see the same current route and stop sequence. Their task checklists and task completion events remain individual and are attributed to the worker account.
- At arrival, the route can record the stop arrival once; completing mowing and weed-whacking remains two separately attributable tasks.
- If workers explicitly split up, create separate route legs/assignments and identify which device/worker is the location source. Do not imply that a worker is at the truck location when the crew separates.
- GPS is active only during the assigned work period and visible to authorized business roles; route tracking does not itself prove task completion.

## Schedule state and recalibration

- Draft schedule creation and edits do not affect active worker views until an owner/admin publishes.
- Each publish includes a monotonically increasing version. On publish, reject stale edits if visits, assignments, availability, or the route have changed since review.
- Rain/early finish, lunch extension, sick absence, equipment issue, or customer decline can trigger a new draft schedule version with alternatives.
- Metrics include completed/unaffected tasks, moved/unplaced stops, worker and truck load, delay, projected revenue at risk, and customer-notification status.
- Schedule edits never send customer texts automatically. Customer reschedule messages follow the separate manager-authorized, affirmative-consent process in [the Phase 73 requirements](CREW_AVAILABILITY_INCIDENTS_CUSTOMER_RESCHEDULING.md).

## Acceptance checks

- A route supports at least two workers with distinct task assignments at a stop and preserves each task’s completion actor.
- A shared truck route produces one route GPS trace and visible progress to all assigned workers.
- Moving a worker’s lunch or adding a sick-day absence recalculates capacity and flags affected routes without publishing automatically.
- Overlapping worker or truck assignments block normal publish; soft capacity warnings are visible and auditable.
- Changing task dependencies or whether work can occur in parallel changes elapsed-time estimates without double-counting labor minutes.
- Switching the stop target between per-operation and per-truck changes capacity expectations and is visible in the schedule summary.
- Worker devices show only assigned routes/tasks; owners/admins can edit and publish.
- A stale route version cannot overwrite a newer schedule.
- Offline task completion and GPS sync show pending/synced/failed states; no pending item is described as saved.
- The UI remains useful for an owner/operator who both manages and performs field work.

## Phase report classification

- **Completed:** schedule creator, route/crew/task model, GPS ownership rules, capacity rules, and acceptance checks documented.
- **Documentation only:** this file and roadmap update.
- **Planned:** persistent route and task assignment model, schedule creator UI, GPS route linkage, manager publish/version flow, offline task sync.
- **Testing only:** none; no route-scheduler implementation or runtime test occurred.
- **Live:** none; no pages, customer schedules, GPS tracking, or public content changed.
