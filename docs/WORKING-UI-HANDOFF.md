# GreenCollar working UI handoff

## Scope

This is a bounded UI pass on the existing Expo app. The signed-in dashboard and Clerk/API paths are unchanged. The preview flag and signed-out sample entry open the working sample screens in `src/components/WorkingDemo.tsx`.

The sample covers owner setup and the worker's start-of-day journey:

- Owner has five tabs: Today, Customers, Planner, Schedule, and Invoices. Worker has Today and Schedule.
- Customer creation is a two-step form with required-field and email validation, optional contact/access notes, back navigation that keeps the draft, and cancel/Escape discard recovery.
- A first service can be added with the customer, or a one-time/weekly visit can be scheduled for an existing customer. The planner shows waiting work, checks service-hour and visit limits, leaves unfit jobs visible, and requires a local review before approval.
- The Worker Today screen opens with a clearly labeled synthetic Crew Green assignment and Truck 02, three sample stops, an illustrative map, and an approximate finish time. A fixed sample travel matrix estimates the depot-to-first-stop, inter-stop, and return legs without reordering assigned stops. The worker can choose a sample local start time, a 30- or 60-minute lunch after an eligible stop, and a 0–60-minute delay allowance before the next unstarted stop or return. Appointment, lunch, and workday-limit conflicts are shown and block day start when the plan is infeasible. The start/continue action remains pinned above mobile navigation and at the bottom of the desktop worker view while route controls scroll; its summary shows the selected lunch and return estimate, or why the start is blocked. “Start my day” records a local day-start and opens the first stop. It does not start the separate visit timer. Repeated starts are idempotent; returning workers can continue or go back to the day overview. An empty assignment state offers a working switch to Owner view instead of simulating dispatch.
- The first stop provides service details and the existing visit timer's start, pause, resume, note, completion-confirmation, and undo actions. Day-start, visit timing, and completion remain separate states.
- The finish estimate uses the fixed sample travel matrix, sample service minutes, the chosen start time, editable sample lunch, and local delay allowance. It is illustrative only: it does not use coordinates, GPS, live traffic, external routing, or route optimization and does not promise an actual shift finish. Lunch is part of the schedule estimate and does not start or pause a visit timer.
- Invoices is a review-only snapshot of local completions. It does not issue, send, or bill.

The sample uses synthetic records shaped like the app's existing `SavedCustomer`, `SavedServiceLocation`, `SavedServiceAgreement`, and workday data. Planning and timer transitions call existing domain functions. Browser edits use the versioned `greencollar.preview.workspace.v2` local-storage key. If browser storage is unavailable, edits last only for the open session. Reset clears local edits and restores the examples. Day start, lunch choice, and delay allowance survive reload only in that local preview store.

Every preview screen discloses that records are fictional and local. Arrival does not read GPS; approval does not notify a worker; invoice snapshots are not payable. No server or production write is connected to this sample.

## Latest worker action-footer pass (2026-10-14)

This follow-up fixes the worker’s next-action visibility: the guarded “Start my day” / “Continue my day” control and a readiness summary stay visible while the route, lunch, and delay settings scroll. The sample route, local-only behavior, and separate visit timer are unchanged.

- Source branch: `codex/worker-primary-ui`.
- UI source commit: `d2046ff777035b8dc7ef7f52e3fb95f9a8df4b89`.
- The app continues on the existing owner-private preview; this follow-up has not been published.
- Hosted visual verification of this change and explicit owner acceptance are pending. Per the repository visual acceptance gate, status remains **INCOMPLETE — OWNER VISUAL ACCEPTANCE PENDING** until the owner checks the updated worker screen at the approved URL. Parent coordination is required before publishing this new export.

## Latest worker-day flow pass (2026-10-15)

The worker screen now presents a compact start-of-day summary and a fixed, state-specific next-action bar. Route, schematic map, inter-stop drive estimates, estimated depot return, lunch selection, and delay controls open in a dedicated sheet. The worker can also open sample contact details, add browser-local photos and work notes, and defer or restore a stop. Deferral remains scrollable with its actions visible in a short keyboard-sized viewport. Day start remains separate from travel, arrival, and the visit timer; a repeated fast tap cannot skip a state.

- Source branch: `codex/worker-day-ui-redesign`, based on the saved `codex/worker-stop-deferral` line.
- Source commit: `0ba710c5330f4f54197687dd134bdd32afb8020a`.
- The earlier route/lunch archive remains preserved and verified: `docs/ui-preview/worker-route-lunch/greencollar-worker-route-lunch-export.tar.gz`, SHA-256 `585cc8b1d7bd0bdd1ddb3b063ffbf3a49f174f2d3731ca511a5bd95cc29c6383`.
- Export bundle: `dist/_expo/static/js/web/AppEntry-8f9f0a61715c9f5280ebe252241c074c.js` (1,195,781 bytes), SHA-256 `82aaf2121c1f87874a246ba875defdeb87962304472c248a5d5e2ffaeb3bcb7c`.
- New local preview archive: `docs/ui-preview/worker-day-ui/greencollar-worker-day-ui-export.tar.gz`, SHA-256 `57addbff10e545fb3aa40945f4e1615493e98dae32844f6c7901e0c20780602b` (also in the adjacent `.sha256` sidecar).
- The archive includes the static `dist/` export, smoke script, screenshots, and a source patch against stop-deferral commit `73093b582e35bd1ed0a691c7c4d1d64778545681`.
- No Site was created or updated and nothing was deployed. The current private Site remains at v6. Existing preview review and owner visual acceptance are still required before publication.

## Latest mobile task/action layout correction (2026-10-15)

At default text size, the worker’s complete current-task card and primary action now fit in the main viewport at 390×844 and 320×568. At 390px, the action footer has a measured gap from the main scroll area and bottom navigation. At 320px, the action sits directly below the task in the scroll area, with bottom navigation separate. Enlarged text can reflow and scroll to the action.

- Source branch: `codex/worker-day-ui-redesign`.
- Source commit: `83ecab608f8aee4da5963c489d0e625f88f5def6`.
- Export bundle: `dist/_expo/static/js/web/AppEntry-fc1f36378468e5534e45ef8c877060cd.js` (1,197,334 bytes), SHA-256 `ada88c68fd2119377f434793e7465666186a25389630206eeb25148c3b63e50b`.
- Updated export archive: `docs/ui-preview/worker-day-ui/greencollar-worker-day-ui-export.tar.gz` (975,537 bytes), SHA-256 `9e5305009f45a00493121f358e907bd8161f0bff83e66ed5491f84b2ee25ee32` (also in the adjacent `.sha256` sidecar).
- Browser verification covered task/action fit, no footer/nav overlap, and repeated overview/continue/tab navigation at both target sizes; route, lunch, delay, deferral, photo, note, timer, and reload flows still pass. It reported 0 JavaScript errors and 0 external requests. `npm run typecheck` passed and all 344 tests passed.
- [Phone first stop at 320×568](ui-preview/worker-day-ui/phone-first-stop-320x568.png), [phone active visit at 320×568](ui-preview/worker-day-ui/phone-active-visit-320x568.png), and [phone enlarged text at 320×568](ui-preview/worker-day-ui/phone-enlarged-text-320x568.png) were added to the archive.
- Text enlargement was simulated with CSS in Chromium; native operating-system font settings were not emulated. No Site was updated and nothing was deployed.

## Build provenance

- Repository: `newssmyrna/greencollar`.
- App source line: `codex/read-only-demo-entry`, from app-export commit `76912dfa09af6c00ab6ae2336fad6a710c9b1bce` and docs-only commit `fd00f316dbd156ee8922810f07cbc9b89065d298`.
- Isolated implementation branch: `codex/worker-primary-ui`.
- Route/lunch baseline source commit: `2751ab0d578c527c8e30433883c78afc4f025525`.
- The baseline route/lunch archive remains preserved at `docs/ui-preview/worker-route-lunch/greencollar-worker-route-lunch-export.tar.gz` (312,481 bytes), SHA-256 `585cc8b1d7bd0bdd1ddb3b063ffbf3a49f174f2d3731ca511a5bd95cc29c6383`. Its source commit and checksum were verified before this follow-up.
- The follow-up UI source commit is `d2046ff777035b8dc7ef7f52e3fb95f9a8df4b89`.
- Export command: `EXPO_PUBLIC_GREENCOLLAR_APP_PREVIEW=true EXPO_NO_TELEMETRY=1 EXPO_OFFLINE=1 npm run export:web`.
- Follow-up export bundle: `dist/_expo/static/js/web/AppEntry-e440471718fa8137193b5547178f9556.js` (1,161,219 bytes), SHA-256 `a1d470fcfb1ea51d2f5b738840876059b3eb116b6f097e2b11851de8408b9b45`.
- Follow-up static export artifact: `docs/ui-preview/worker-route-lunch/greencollar-worker-route-lunch-footer-export.tar.gz` (312,715 bytes), SHA-256 `2ea2e9617a8cc56ec43b3e07d770e6ebbec4687ff34c2731cca327dd79eb575a`. It contains the tested `dist/` export mapped to the follow-up source commit above, including HTML, metadata, JavaScript bundle, and favicons. The `.sha256` sidecar is next to the archive.

## Verification

- `npm run typecheck` — passed after the follow-up UI edit.
- `npm test` — 335 passed, 0 failed after the follow-up UI edit.
- Expo web export — passed from follow-up source commit `d2046ff777035b8dc7ef7f52e3fb95f9a8df4b89`.
- Chromium interaction checks at 390×844 with mobile touch emulation and 1440×1000 — passed with no page or console errors. The start/continue control was visible above mobile navigation and in the desktop viewport; 11:15 with 60-minute lunch displayed a no-slot conflict and disabled start; 30/60-minute lunch changed the return estimate from 12:25 PM to 12:55 PM; a 15-minute delay changed it to 1:10 PM. Day start, timer start, pause/resume, completion cancel/confirm, and undo all worked. Desktop had no horizontal overflow. A 320×740 compact-phone check also passed with the action visible and no horizontal overflow.
- The baseline route checks also covered sample travel legs and return, keyboard time entry, phone badge bounds, repeated day start, reload/resume, and persisted local state.
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
- [Phone worker start action remains visible](ui-preview/worker-route-lunch/phone-worker-action-footer.png)
- [Phone lunch conflict with blocked start action](ui-preview/worker-route-lunch/phone-worker-lunch-conflict-footer.png)
- [Phone first stop after starting the separate timer](ui-preview/worker-route-lunch/phone-worker-first-stop-footer-transition.png)
- [Desktop worker start action remains visible](ui-preview/worker-route-lunch/desktop-worker-action-footer.png)
- [Phone compact start-of-day summary](ui-preview/worker-day-ui/phone-start-of-day.png)
- [Phone route, lunch, and delay sheet](ui-preview/worker-day-ui/phone-route-lunch-sheet.png)
- [Phone first stop with pinned next action](ui-preview/worker-day-ui/phone-first-stop.png)
- [Phone first stop at 320×568](ui-preview/worker-day-ui/phone-first-stop-320x568.png)
- [Phone deferral with keyboard-sized viewport](ui-preview/worker-day-ui/phone-deferral-short-keyboard.png)
- [Phone deferred stop and route sheet](ui-preview/worker-day-ui/phone-deferred-route-sheet.png)
- [Phone active visit](ui-preview/worker-day-ui/phone-active-visit.png)
- [Phone active visit at 320×568](ui-preview/worker-day-ui/phone-active-visit-320x568.png)
- [Phone enlarged text](ui-preview/worker-day-ui/phone-enlarged-text.png)
- [Phone enlarged text at 320×568](ui-preview/worker-day-ui/phone-enlarged-text-320x568.png)
- [Desktop next stop](ui-preview/worker-day-ui/desktop-next-stop.png)

The latest worker-day browser smoke verifies complete task/action visibility at both target phone sizes, repeated navigation, enlarged-text reflow, and the existing sample flows. It reported no JavaScript errors or external requests. `npm run typecheck` passed and `npm test` passed all 344 tests.

## Remaining integration work

This is a working local preview UI export, not a new Site publication. It does not create or edit real customer accounts, persist to the backend, configure Clerk, send dispatch messages, use device location or live routing services, issue invoices, process payments, or calculate an actual travel-aware shift finish. The route estimate uses a fixed illustrative sample matrix only. The real authenticated dashboard remains on its existing path for future backend hookup.
