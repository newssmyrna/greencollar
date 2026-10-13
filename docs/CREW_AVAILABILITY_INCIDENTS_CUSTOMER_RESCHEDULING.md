# Crew availability, job incidents, and customer rescheduling

**Status:** Phase 73 product requirements; documentation only. No availability, incident-photo, or SMS workflow is implemented or live. No SMS provider is configured and no messages are sent.

## Purpose and boundaries

The schedule recalibration workflow must handle ordinary capacity changes and job-site incidents as separate events. A shortened day can result from rain or any other reason. Lunch breaks and sick-day absences change crew capacity; property damage or equipment incidents require a report and follow-up; customer rescheduling requires an explicit manager decision and customer response.

These events may be linked to the affected route/day, but one event must not silently create or approve another. An incident report must not automatically contact the customer. A proposed new date must not alter a scheduled visit until the manager authorizes the proposal and the customer accepts it.

## Roles

| Capability | Owner/operator | Admin/manager | Worker |
|---|---:|---:|---:|
| Set own availability and report own break/absence | Yes | Yes | Yes |
| Report an early day or job-site incident | Yes | Yes | Yes |
| Review team availability and incident inbox | Yes | Yes | No |
| Build and approve schedule proposals | Yes | Yes | No |
| Authorize a customer reschedule message | Yes | Yes | No |
| Send a message or record customer response | Within approved workflow | Within approved workflow | No |
| Perform field work while retaining management access | Yes | No by default | Yes |

Owner/operator receives both management and field capabilities. Admin remains management-focused; worker is limited to field reporting and assigned work.

## Availability and lunch

- Provide a simple day status: available, lunch/break, sick/unavailable, or other unavailable.
- Store date, affected time range (or all-day), worker, and optional operational note. Do not ask for diagnosis or sensitive medical details.
- Allow planned availability to be entered ahead of the route and unplanned absence to be reported the same day.
- Represent lunch as a time block with start/end; it reduces available service time for that worker/team. A sick-day entry removes that worker from capacity for the selected period.
- A manager may correct an entry with an audit record; preserve the original reporter and change history.
- Recalculation must show which routes/stops are affected, the assumed available crew/truck capacity, and what remains unplaced. Never infer that the remaining crew can absorb the work without showing the resulting load.
- Do not make payroll, attendance discipline, or employment-performance decisions from these records.

## Job-site incident report

- Worker can start a report from an assigned stop or route and choose a category such as property damage, near miss, equipment issue, access problem, or other.
- Capture incident time, location/visit reference, narrative, immediate action, whether the customer was informed, and optional witnesses/contact details.
- Permit one or more photo attachments. Keep originals private, tenant-scoped, access-controlled, and linked to the incident. Do not put image data in public URLs or customer-facing messages by default.
- Save a draft offline when connectivity is unavailable, then clearly show pending upload/sync status. Never claim an attachment is saved until upload confirmation.
- Give owner/admin an incident inbox with status (new, acknowledged, follow-up, resolved), assignee, timestamps, and an append-only history.
- Worker can view their own submitted report and status; only authorized managers can view business-wide incidents and attachments.
- Incident submission does not modify the visit schedule, admit liability, or send a customer message automatically.

## Customer reschedule consent

1. A route interruption or availability change produces a draft proposal with affected visits and alternatives.
2. Manager sees per-option stops moved/unplaced, delay, capacity/service-time utilization, revenue at risk, and warnings for constraints not modeled. The proposal must say whether travel time, customer windows, lunch, equipment, and crew availability were included.
3. Manager selects the exact affected customer/visit, a proposed date, and an available time window; reviews message text and authorizes sending.
4. The customer receives a concise request asking whether the proposed next-day (or other selected) visit works. Provide clear accept/decline choices and a way to contact the business. No reply is not acceptance.
5. Record message delivery state and the customer's response with timestamps. If declined, expired, or undelivered, leave the visit unchanged and return it to manager review.
6. Only after an affirmative response may the manager commit the visit change. Recheck schedule version/capacity at commit time and preserve an audit trail of old and new dates and the approving manager.
7. Send a confirmation only after the schedule change is committed. Do not message unrelated customers or disclose crew/incident details.

Before any real messaging is enabled, choose and configure a provider, establish a spending limit, verify recipient-number and consent handling, define opt-out and failure handling, and test using a non-customer destination. This phase does not authorize purchasing or sending.

## Acceptance checks

- A lunch block changes available minutes only for its time range; a sick-day absence removes the worker only for the chosen dates.
- An absence never silently changes a route; a manager sees options and load metrics first.
- Worker and manager permissions follow the role table; an owner can both report field work and manage a route.
- Incident photos remain private and inaccessible to another business; failed uploads remain visibly pending.
- Incident details and images are not included in reschedule texts by default.
- Draft, declined, expired, and undelivered reschedule requests leave schedule records unchanged.
- Only manager-authorized, customer-accepted, version-safe changes become scheduled visits.
- Every report, edit, proposal, authorization, message result, customer response, and schedule commit is attributable and timestamped.
- Tests cover rain and non-rain shortened days, lunch, sick-day absence, overlapping capacity, photo access, duplicate submissions, role denial, customer decline/no response, delivery failure, and stale schedule versions.

## Phase report classification

- **Completed:** product requirements and acceptance checks.
- **Documentation only:** this file and the roadmap entry.
- **Planned:** availability capture, incident-photo workflow, replan metrics UI, manager approval, customer-consent messaging, provider/budget selection.
- **Testing only:** none; no implementation or runtime test occurred.
- **Live:** none; no schedule, customer, or public page changed.
