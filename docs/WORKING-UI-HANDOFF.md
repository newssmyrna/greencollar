# GreenCollar working UI handoff

## Scope

This is a bounded UI pass on the existing Expo app. The signed-in dashboard and Clerk/API paths are unchanged. The preview flag and signed-out sample entry open the working sample screens in `src/components/WorkingDemo.tsx`.

The sample covers owner setup and the worker's start-of-day journey:

- Owner has five tabs: Today, Customers, Planner, Schedule, and Invoices. Worker has Today and Schedule.
- Customer creation is a two-step form with required-field and email validation, optional contact/access notes, back navigation that keeps the draft, and cancel/Escape discard recovery.
- A first service can be added with the customer, or a one-time/weekly visit can be scheduled for an existing customer. The planner shows waiting work, checks service-hour and visit limits, leaves unfit jobs visible, and requires a local review before approval.
- The Worker Today screen opens with a clearly labeled synthetic Crew Green assignment and Truck 02, three sample stops, an illustrative map, and an approximate finish time. A fixed sample travel matrix estimates the depot-to-first-stop, inter-stop, and return legs without reordering assigned stops. The worker can choose a sample local start time, a 30- or 60-minute lunch after an eligible stop, and a 0–60-minute delay allowance before the next unstarted stop or return. Appointment, lunch, and workday-limit conflicts are shown and block day start when the plan is infeasible. “Start my day” records a local day-start and opens the first stop. It does not start the separate visit timer. Repeated starts are idempotent; returning workers can continue or go back to the day overview. An empty assignment state offers a working switch to Owner view instead of simulating dispatch.
- The first stop provides service details and the existing visit timer's start, pause, resume, note, completion-confirmation, and undo actions. Day-start, visit timing, and completion remain separate states.
- The finish estimate uses the fixed sample travel matrix, sample service minutes, the chosen start time, editable sample lunch, and local delay allowance. It is illustrative only: it does not use coordinates, GPS, live traffic, external routing, or route optimization and does not promise an actual shift finish. Lunch is part of the schedule estimate and does not start or pause a visit timer.
- Invoices is a review-only snapshot of local completions. It does not issue, send, or bill.

The sample uses synthetic records shaped like the app's existing `SavedCustomer`, `SavedServiceLocation`, `SavedServiceAgreement`, and workday data. Planning and timer transitions call existing domain functions. Browser edits use the versioned `greencollar.preview.workspace.v2` local-storage key. If browser storage is unavailable, edits last only for the open session. Reset clears local edits and restores the examples. Day start, lunch choice, and delay allowance survive reload only in that local preview store.

Every preview screen discloses that records are fictional and local. Arrival does not read GPS; approval does not notify a worker; invoice snapshots are not payable. No server or production write is connected to this sample.

## Build provenance

- Repository: `newssmyrna/greencollar`.
- App source line: `codex/read-only-demo-entry`, from app-export commit `76912dfa09af6c00ab6ae2336fad6a710c9b1bce` and docs-only commit `fd00f316dbd156ee8922810f07cbc9b89065d298`.
- Isolated implementation branch: `codex/worker-primary-ui`.
- Worker UI source commit used for the export: `2751ab0d578c527c8e30433883c78afc4f025525`.
- Export command: `EXPO_PUBLIC_GREENCOLLAR_APP_PREVIEW=true EXPO_NO_TELEMETRY=1 EXPO_OFFLINE=1 npm run export:web`.
- Export bundle: `dist/_expo/static/js/web/AppEntry-590d2cf5092ee16f7cd4d1c20db349a8.js` (1,159,945 bytes), SHA-256 `d2091e2d71c957ad4c2ffa0a2c2336d25d5febc83eb290bcbe34f39f813810cf`.
- Full static export archive: `docs/ui-preview/worker-route-lunch/greencollar-worker-route-lunch-export.tar.gz` (312,481 bytes), SHA-256 `585cc8b1d7bd0bdd1ddb3b063ffbf3a49f174f2d3731ca511a5bd95cc29c6383`. It contains the tested `dist/` export from the source commit above, including HTML, metadata, JavaScript bundle, and favicon assets.

## Verification

- `npm run typecheck` — passed.
- `npm test` — 335 passed, 0 failed.
- Expo web export — passed from source commit `2751ab0d578c527c8e30433883c78afc4f025525`.
- Chromium interaction checks at 390×844 with mobile touch emulation and 1440×1000 — passed with no page or console errors. The route pass checked first/inter-stop/return sample drive legs, 30/60-minute lunch recalculation, the 11:15 late-start no-slot block, keyboard time entry, phone badge bounds, repeated day start, the separate visit timer, delay recalculation, pause/reload/resume, completion cancel/confirm/undo, and saved local state. Desktop had no horizontal overflow.
- Earlier worker browser checks covered back/continue and reload, the no-assignment fallback, and owner switch. The initial full owner UI pass covered all five tabs, phone sizing and touch targets, customer validation, form back/cancel/Escape, duplicate submission, scheduling and planner limits, reload persistence and reset, owner/worker access, timer transitions, finish confirmation, invoice review, replan preservation, and undo.
- Existing owner UI checks remain covered by the earlier full pass: all five tabs, phone sizing and touch targets, customer validation, form back/cancel/Escape, duplicate submission, scheduling and planner limits, reload persistence and reset, owner/worker access, timer transitions, finish confirmation, invoice review, replan preservation, and undo.

## Screenshots

All example records and names in these images are synthetic.

- [Phone start of day](ui-preview/worker-start-of-day/phone-start-day.png)
- [Phone first stop](ui-preview/worker-start-of-day/phone-first-stop.png)
- [Phone returning worker](ui-preview/worker-start-of-day/phone-returning-day.png)
- [Phone paused visit](ui-preview/worker-start-of-day/phone-paused-visit.png)
- [Phone no-assignment state](ui-preview/worker-start-of-day/phone-no-assignment.png)
- [Desktop start of day](ui-preview/worker-start-of-day/desktop-start-day.png)
- [Desktop first stop](ui-preview/worker-start-of-day/desktop-first-stop.png)
- [Phone route, lunch, and return estimate](ui-preview/worker-route-lunch/phone-route-lunch.png)
- [Phone no-feasible-lunch conflict](ui-preview/worker-route-lunch/phone-route-no-slot.png)
- [Phone started day with timer stopped](ui-preview/worker-route-lunch/phone-route-started.png)
- [Desktop route, lunch, and return estimate](ui-preview/worker-route-lunch/desktop-route-lunch.png)

## Remaining integration work

This delivers a working local preview UI. It does not create or edit real customer accounts, persist to the backend, configure Clerk, send dispatch messages, use device location or live routing services, issue invoices, process payments, or calculate an actual travel-aware shift finish. The route estimate uses a fixed illustrative sample matrix only. The real authenticated dashboard remains on its existing path for future backend hookup.
