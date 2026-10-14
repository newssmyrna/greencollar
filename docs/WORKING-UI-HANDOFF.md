# GreenCollar working UI handoff

## Scope

This is a bounded UI pass on the existing Expo app. The signed-in dashboard and Clerk/API paths are unchanged. The preview flag and signed-out sample entry open the working sample screens in `src/components/WorkingDemo.tsx`.

The sample covers owner setup and the worker's start-of-day journey:

- Owner has five tabs: Today, Customers, Planner, Schedule, and Invoices. Worker has Today and Schedule.
- Customer creation is a two-step form with required-field and email validation, optional contact/access notes, back navigation that keeps the draft, and cancel/Escape discard recovery.
- A first service can be added with the customer, or a one-time/weekly visit can be scheduled for an existing customer. The planner shows waiting work, checks service-hour and visit limits, leaves unfit jobs visible, and requires a local review before approval.
- The Worker Today screen opens with a clearly labeled synthetic Crew Green assignment and Truck 02, three sample stops, and an approximate service-only finish time. “Start my day” records a local day-start and opens the first stop. It does not start the separate visit timer. Repeated starts are idempotent; returning workers can continue or go back to the day overview. An empty assignment state offers a working switch to Owner view instead of simulating dispatch.
- The first stop provides service details and the existing visit timer's start, pause, resume, note, completion-confirmation, and undo actions. Day-start, visit timing, and completion remain separate states.
- The finish estimate uses sample service minutes only. It explicitly excludes drive time, breaks, setup, delays, live traffic, and route optimization; it is not a promised shift finish.
- Invoices is a review-only snapshot of local completions. It does not issue, send, or bill.

The sample uses synthetic records shaped like the app's existing `SavedCustomer`, `SavedServiceLocation`, `SavedServiceAgreement`, and workday data. Planning and timer transitions call existing domain functions. Browser edits use the versioned `greencollar.preview.workspace.v2` local-storage key. If browser storage is unavailable, edits last only for the open session. Reset clears local edits and restores the examples. Day start survives reload only in that local preview store.

Every preview screen discloses that records are fictional and local. Arrival does not read GPS; approval does not notify a worker; invoice snapshots are not payable. No server or production write is connected to this sample.

## Build provenance

- Repository: `newssmyrna/greencollar`.
- App source line: `codex/read-only-demo-entry`, from app-export commit `76912dfa09af6c00ab6ae2336fad6a710c9b1bce` and docs-only commit `fd00f316dbd156ee8922810f07cbc9b89065d298`.
- Isolated implementation branch: `codex/worker-primary-ui`.
- Worker UI source commit used for the export: `e575fddddaa94bcec55faa5f7cb41468881bdbcf`.
- Export command: `EXPO_PUBLIC_GREENCOLLAR_APP_PREVIEW=true EXPO_NO_TELEMETRY=1 EXPO_OFFLINE=1 npm run export:web`.
- Export bundle: `dist/_expo/static/js/web/AppEntry-5477129c88f5d530553a23a4e628cd35.js` (1.14 MB), SHA-256 `16be8341ffe5e67de67afe7648f5f71397c81f8b4251b72bc06ef2d751c13ef2`.
- Full static export archive: `docs/ui-preview/worker-start-of-day/greencollar-worker-start-of-day-export.tar.gz` (304 KB), SHA-256 `6e8e1af5f3ab9c898eab8e03d792bfd895095a73df2617ee2be80148a1167b2b`. It contains the tested `dist/` export, including HTML, metadata, JavaScript bundle, and favicon assets.
- The preview destination remains the existing private app URL: <https://greencollar-actual-app-preview.nobleloach1.chatgpt.site>. This handoff does not create or publish another host.

## Verification

- `npm run typecheck` — passed.
- `npm test` — 327 passed, 0 failed.
- Expo web export — passed from source commit `e575fddddaa94bcec55faa5f7cb41468881bdbcf`.
- Chromium interaction checks at 390×844 with mobile touch emulation and 1440×1000 — passed with no page errors or console errors. The worker pass covered a fresh sample assignment, finish estimate caveat, rapid repeated start, back/continue and reload, separate timer start/pause/reload/resume/completion/undo, the no-assignment fallback, and owner switch. Desktop checks covered start and first-stop screens with no horizontal overflow.
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

## Remaining integration work

This delivers a working local preview UI. It does not create or edit real customer accounts, persist to the backend, configure Clerk, send dispatch messages, use device location or route services, issue invoices, process payments, or calculate a travel-aware shift finish. The real authenticated dashboard remains on its existing path for future backend hookup.
