# Proposed Worker-Primary Architecture and Gap Map

**Status: PROPOSAL ONLY — NOT IMPLEMENTED, NOT MERGED, AND NOT RELEASE-READY.** This is a docs-only architecture reset proposal based on a read-only review of the repository at baseline commit [d5d4ccc76752e1a18bfe9effffd3cd61edf69518](https://github.com/newssmyrna/greencollar/commit/d5d4ccc76752e1a18bfe9effffd3cd61edf69518) on 2026-10-14. No code, UI, deployment, provider, or production-data changes are included.

This document adds a product-aligned proposal. It does not replace the existing [architecture proposal](./ARCHITECTURE.md), [seven-step workflow](./WORKFLOW.md), [release criteria](./RELEASE_CRITERIA.md), [daily-workflow notes](./DAILY_WORKFLOW.md), [live data status](./LIVE_DATA_STATUS.md), [road-provider notes](./ROAD_PROVIDER.md), or [invoicing notes](./INVOICING.md). Reconcile differences among those docs and the implementation before choosing a backend or release path.

## Product requirements

GreenCollar is an industry-neutral operating tool for on-site service businesses. The owner/admin configures the business, customer/site records, preferred days and times, workers and teams, vehicles/equipment, capacity, schedule and billing/message settings. The primary daily experience is the worker's assigned day and next stop, not a generic dashboard.

The intended flow is: admin plans/assigns an efficient day constrained by worker/vehicle capacity and customer time windows; worker navigates to the next stop; arrival can start a timer and configured customer message; the active-job panel supports pause, photos, contacting admin/customer, notes and early end; the worker confirms completion and departure; the visit is logged and configured completion message, invoice and payment link follow. History improves duration, capacity and time/cost-efficiency recommendations. Rain, cancellation, rescheduling or early day end triggers a rolling replan, with optional fill stops only when eligible and within constraints.

Do not pick an initial vertical in this proposal. Preserve shared service-business workflows and allow configuration/templates to differ by business.

## Proposed architecture

### Business, membership and roles

- Treat each business as a tenant. Every business-owned record and every API read/write must be scoped by authenticated business membership, with tests for cross-tenant denial.
- Keep roles explicit: owner/admin configures records, people, vehicles, billing and messages and approves/dispatches plans; worker sees assigned work and records permitted events. Team/dispatcher distinctions can be added as requirements demand.
- Model worker/team membership and assignment separately from customer ownership. Route stops must point to a business, workday/route revision, assigned worker or team, and assigned vehicle.
- Treat the permission model as a server-side control. Hiding UI controls alone does not enforce roles.

### Setup and planning

Model business settings; worker/team and availability; vehicle/equipment profiles; customer contacts, locations and access/preferences; communication consent and opt-out; service definitions/agreements, recurrence, price and duration; and job constraints such as preferred days, fixed appointment, time window, skill/equipment and capacity.

A workday contains constraints, candidate jobs, assignments and a revisioned route per worker/team/vehicle. A planner must return explicit ordered stops, service/travel estimates, feasibility and reasons for unplaced/moved work. Admin reviews/approves before dispatch. A revised route has a new version and a worker acknowledgment; completed and in-progress stops remain fixed during replanning.

### Worker visit lifecycle and event history

Use an explicit visit state machine, for example: planned → assigned → acknowledged → en route → arrived/working ↔ paused → completion confirmed → departed → completed; canceled and skipped are explicit outcomes. Keep work time, pause time and travel time separate.

Store append-only, timestamped events with a client-generated event ID/idempotency key, worker, route revision, source (geofence or manual), observed and server-received times, location accuracy when applicable, and correction reason. Sync offline events idempotently; retries or late/duplicate location events must not duplicate completion, message, invoice or payment. Corrections append history instead of erasing it.

Geofence entry/exit may trigger timer and notification automation only when permissions and location confidence support it. A missed, delayed or inaccurate signal must surface for worker correction and manual start/stop. Never bill or message solely from an uncertain GPS event. Minimize location retention and disclose tracking clearly.

### Replanning, billing and learning

A rain/cancellation/delay/early-end event creates a proposal for remaining eligible stops. Preserve customer windows, shift bounds, vehicle/worker capacity, completed/in-progress work and fixed commitments. Show moved/unplaced work and reasons; optional fill stops must be eligible and capacity-safe. Publish a route revision only after approval and receive worker acknowledgment.

On confirmed completion, produce an invoice draft from an immutable customer/service/rate snapshot and a unique visit reference. Sending and payment are separate verified events. Use an idempotent outbox for opted-in SMS/payment-link delivery; persist delivery/opt-out state. Verify payment webhook signatures, tenant, amount, currency and unique event ID before marking paid; never accept a client assertion as proof of payment.

Compare planned and actual service/travel time and cost by service, worker and vehicle. Begin with transparent estimates and visible sample counts/confidence. Recommendations stay advisory until validated; do not silently change customer commitments.

## Existing code and gaps

This is a source inventory, not proof of deployed behavior. Candidate code must pass current tests and staging verification before reuse.

| Capability | Repository evidence | Proposed disposition |
|---|---|---|
| Business, customer, service-location and recurring-agreement records | `App.tsx`; `src/data/*-api.ts`; `cloudflare/src/*-api.ts`; Cloudflare migrations | **REUSE CANDIDATE.** Adapt customer/site fields for preferred times, consent, photos/media and admin/worker workflows. Current saved customer data is name/contact/notes; service locations store address/preferences, without coordinates from the current create flow. |
| Tenant/auth foundation | `cloudflare/src/auth.ts`, `business-api.ts`, tenant-access tests | **REUSE CANDIDATE, UNVERIFIED IN DEPLOYMENT.** Current setup is owner-centric; worker invitations, roster, teams and assignments are missing. Confirm actual role schema, JWT configuration, tenant isolation and staging behavior. |
| Recurrence and duration estimates | `src/domain/recurrence.ts`, `daily-workflow.ts`, `planner.ts`, related tests | **REUSE/ADAPT.** Due visits and duration history exist. The current planner is a deterministic greedy single-route baseline using a supplied travel matrix and job/time constraints. It is not multi-worker/team/vehicle assignment or a global optimizer. Current app/API do not expose the full preferred-day/time-window workflow. |
| Road matrix | `src/domain/road-matrix.ts`, `road-planning.ts`, `cloudflare/src/road-provider.ts` | **INTEGRATION MISSING.** Conversion and an OSRM-compatible adapter exist, but no routing provider is selected or activated and no real route endpoint is wired to the worker flow. Vehicle fuel-efficiency/cost modeling is missing. A synthetic matrix must never be labeled a live optimized route. |
| Worker dispatch and route view | `App.tsx` Today shows a due-work list; Planner uses sample jobs | **MISSING / REPLACE AS PRODUCT SPEC.** No worker assignment, team/vehicle capacity planner, approved route or revision acknowledgment. The current tabs do not represent the requested workflow. |
| Timer and visit completion | `src/domain/work-session.ts`, `src/data/local-work-session.ts`, `cloudflare/src/visit-completion-api.ts` | **REUSE CANDIDATE.** Manual start/pause/resume/complete and completion snapshots exist. Timer persistence is device-local; geofence provenance, route assignment, media, durable offline event sync and shared worker/admin state are missing. |
| Location/geofence | `package.json` is Expo SDK 54 and does not include `expo-location`; `app.json` has no location/background configuration | **MISSING; PLATFORM TEST REQUIRED.** Do not promise reliable background geofencing from the existing app. Keep manual correction as a first-class path. |
| SMS/communications | No connected communication implementation found in current source/docs | **MISSING.** Provider, credentials, cost, message policy, consent/opt-out, delivery status and idempotent retry are unresolved. |
| Invoices/payments | `src/domain/invoice.ts`, `completed-invoice.ts`; `docs/INVOICING.md` | **REUSE MATH/SNAPSHOT ONLY.** Current UI creates local review drafts. Persistence, issue/send, payment link, payment verification, provider webhook and customer self-service are missing. |
| Rain/cancel/early-end replanning, event history and cost learning | No multi-worker schedule revision or durable route/event history found | **MISSING.** Replan remaining work without changing completed/in-progress stops; capture actuals and confidence before making recommendations. |

[Live data status](./LIVE_DATA_STATUS.md) reports that the deployed Worker exposes health only, customer/day endpoints are not deployed, no real businesses/customers are onboarded, and auth/device flow is untested. It also flags that Cloudflare-created recurring tables differ from the stricter migration. Inspect actual staging D1 schema and reconcile additively with backup/review; do not assume `CREATE TABLE IF NOT EXISTS` retrofits it. The existing [architecture proposal](./ARCHITECTURE.md) references Supabase while current app/backend source uses Clerk and Cloudflare. This proposal selects neither stack; resolve the documentation/implementation discrepancy from verified deployment evidence.

## Bounded first end-to-end slice

In isolated staging, test one business admin and one worker with a small synthetic schedule: setup customers/sites and preferences; add worker and vehicle assignment; create a capacity- and window-constrained route; admin approves it; worker acknowledges it and completes the next stop with geofence/manual arrival, pause/resume, note/photo, offline replay, manual correction and completion/departure; a reviewable invoice is generated once from the saved price snapshot; cancellation/rain and early-end cases produce explicit replans and worker acknowledgment.

Keep SMS/payment sending disabled unless an already-approved, zero-new-cost test configuration is verified. Use a synthetic route matrix until a policy-compliant, zero-incremental-cost routing option is confirmed. A no-cost software license does not prove hosting, data refresh, messaging, maps or payment operations have zero USD cost. Do not use live customer data or a public demo router for production locations.

## Verification gates

- Run typecheck/tests and check branch/source versions; verify actual staging schema, JWT issuer/audience/JWKS, owner/admin/worker policies and cross-tenant denial.
- Test multiple workers/teams/vehicles, capacity, shifts, time windows, fixed appointments, cancellations, rain, delays and unplaced-job reasons. Measure route quality before using “efficient” as a claim.
- Test duplicate/late/out-of-order geofence events, client/server clock differences, app restart, offline queue/retry, stale route revisions and multiple-device sync. Each event must yield at most one completion, SMS, invoice or payment.
- Test physical iOS and Android devices for foreground/background, app force-quit, reboot, permission denial, inaccurate location and no network. Validate user disclosure and data retention before collecting background location.
- Test invoice snapshot accuracy, payment webhook signature/replay, amount/currency and customer opt-out before enabling production messaging or billing.
- Review any provider’s commercial terms, data handling, quota, usage/cost limits and operating costs before configuration. No provider, secret, paid integration, merge or deployment is authorized by this proposal.

## Platform and routing sources

- [Expo Location for SDK 54](https://docs.expo.dev/versions/v54.0.0/sdk/location/): background location/geofencing requires permissions and top-level tasks; background behavior differs by OS; Expo Go does not support all background service behavior; iOS allows 20 monitored regions and Android up to 100.
- [Android geofencing](https://developer.android.com/develop/sensors-and-location/location/geofencing): alerts can be delayed or missed depending on location/network/device conditions; background limits increase latency.
- [Apple Core Location background guidance](https://developer.apple.com/documentation/corelocation/handling-location-updates-in-the-background): the system may suspend background apps and queue updates; background operation requires appropriate capability and permission.
- [MDN Geolocation watchPosition](https://developer.mozilla.org/en-US/docs/Web/API/Geolocation/watchPosition): browser location requires a secure context and explicit user permission. It does not provide a background-execution guarantee for a PWA.
- [OSRM backend and API](https://github.com/Project-OSRM/osrm-backend): open-source road engine with route/table/trip APIs; self-hosting needs compute and maintained map data.
- [OSRM demo-server policy](https://github.com/Project-OSRM/osrm-backend/wiki/Demo-server): reasonable non-commercial use only, maximum one request per second and no uptime, latency or freshness guarantee. Do not use it for production customer locations.
