# GreenCollar working UI handoff

## Scope

This is a bounded UI pass on the existing Expo app. The normal signed-in dashboard and Clerk/API paths are unchanged. The preview flag and signed-out sample entry open the working sample screens in `src/components/WorkingDemo.tsx`.

The sample covers the handoff from a customer to a scheduled visit and a worker’s day:

- Owner has five tabs: Today, Customers, Planner, Schedule, and Invoices. Worker has Today and Schedule.
- Customer creation is a two-step form with required-field and email validation, optional contact/access notes, back navigation that keeps the draft, and cancel/Escape discard recovery.
- A first service can be added with the customer, or a one-time/weekly visit can be scheduled for an existing customer. The planner shows waiting work, checks service-hour and visit limits, leaves unfit jobs visible, and requires a local review before approval.
- Worker arrival is an explicit simulation. The timer supports start, pause, resume, a local note, completion confirmation, and undo. Replanning leaves a completed visit intact.
- Invoices is a review-only snapshot of local completions. It does not issue, send, or bill.

The sample uses synthetic records shaped like the app’s existing `SavedCustomer`, `SavedServiceLocation`, `SavedServiceAgreement`, and workday data. Planning and timer transitions call existing domain functions. Browser edits use the versioned `greencollar.preview.workspace.v2` local-storage key. If browser storage is unavailable, edits last only for the open session. Reset clears local edits and restores the examples.

Every preview screen discloses that records are fictional and local. Arrival does not read GPS; approval does not notify a worker; invoice snapshots are not payable. No server or production write is connected to this sample.

## Build provenance

- Repository: `newssmyrna/greencollar`.
- Source branch starts from the complete Expo app line `codex/read-only-demo-entry`, commit `fd00f316dbd156ee8922810f07cbc9b89065d298`; its app-export ancestor is `76912dfa09af6c00ab6ae2336fad6a710c9b1bce`.
- Isolated implementation branch: `codex/worker-primary-ui`.
- Export command: `EXPO_PUBLIC_GREENCOLLAR_APP_PREVIEW=true EXPO_NO_TELEMETRY=1 EXPO_OFFLINE=1 npm run export:web`.
- Export bundle: `dist/_expo/static/js/web/AppEntry-049a5136bf888415b63709b8b11849ee.js` (1.13 MB), SHA-256 `5c862aaeeb039a38aa7ecd2563e280ebfb9ef56246df02cb1fa0bc7b1ab39ba5`.
- Full static export archive: `/workspace/greencollar-worker-primary-export-20261014.tar.gz`, SHA-256 `c4813af9fed762508867b354f0ba94d8f86ddd8343cd138ca53d5dd6a5fcdee3`. The archive contains the tested `dist/` export, including HTML, metadata, bundle, and favicon assets.

## Verification

- `npm run typecheck` — passed.
- `npm test` — 325 passed, 0 failed.
- Expo web export — passed.
- Chromium interaction checks at 390×844 with mobile touch emulation and 1440×1000 — passed with no page errors or console errors. Checks covered all tabs, phone width and touch targets, input validation and focus, form back/cancel/Escape, duplicate submission, scheduling and planner limits, reload persistence and reset, owner/worker access, arrival/timer transitions, navigation during paused work, finish confirmation, invoice review, replan preservation, and undo.

## Screenshots

All example records and names in these images are synthetic.

- [Phone Today](ui-preview/worker-primary/phone-today.png)
- [Phone customer details](ui-preview/worker-primary/phone-customer-step-one.png)
- [Phone first service](ui-preview/worker-primary/phone-customer-step-two.png)
- [Phone worker paused](ui-preview/worker-primary/phone-worker-paused.png)
- [Desktop reviewed plan](ui-preview/worker-primary/desktop-planner.png)
- [Desktop worker ready](ui-preview/worker-primary/desktop-worker-ready.png)
- [Desktop worker paused](ui-preview/worker-primary/desktop-worker-paused.png)
- [Desktop invoice review](ui-preview/worker-primary/desktop-invoices.png)
- [Desktop replan after completion](ui-preview/worker-primary/desktop-replan.png)

## Remaining integration work

This delivers a working local preview UI. It does not create or edit real customer accounts, persist to the backend, configure Clerk, send dispatch messages, use device location or route services, issue invoices, or process payments. The real authenticated dashboard remains on its existing path for future backend hookup.
