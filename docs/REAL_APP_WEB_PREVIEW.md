# GreenCollar real-app web preview

## Source and preview mode

This preview build renders the actual `GreenCollarDashboard` from `App.tsx`: Today, Customers, Planner, Invoices, and Schedule. `EXPO_PUBLIC_GREENCOLLAR_APP_PREVIEW=true` supplies a visibly named sample owner and workspace so all five real screens are available without an account or API call.

The in-app banner says Clerk and the Cloudflare API are disconnected. `EXPO_PUBLIC_GREENCOLLAR_API_URL` is intentionally unset. Values labeled Sample or Example are fixtures.

## What works in the preview

- Tab navigation across Today, Customers, Planner, Invoices, and Schedule.
- Browser-local creation of clearly labeled sample customers and service addresses.
- Browser-local recurring job creation using the app's current customer, service-location, and service-agreement field contracts. Daily, weekly, biweekly, monthly, and custom-day recurrences produce due visits on Today and Schedule.
- Customer, address, and schedule dialogs have Back, Cancel, validation messages, and guarded saves. Repeated save taps do not create duplicate entries.
- Planner workload calculations from fictional sample fixtures.
- Today supports building and saving a sample workday, starting/pausing/resuming a timer, saving visit notes, and completing planned visits with local billing snapshots. Invoice drafts can be prepared from those snapshots, edited, and saved locally.
- Workday, timer, visit, invoice, customer, address, and schedule changes persist in this browser's local storage. If storage is blocked, edits remain in page memory until reload. Clearing browser storage removes the saved preview edits. The reset confirmation restores the fictional workspace.

## Working UI verification

The branch's local Expo web export was checked in Chromium at 390 × 844 (phone-sized) and 1440 × 1000 (desktop). The checks covered customer/address/schedule forms and dialogs; workday planning and approval; cancel/back and validation paths; timer pause/resume across reload; visit completions with local billing snapshots; invoice-draft preparation, edits, save, and reload; reset cancel/confirm; and the session-only disclosure when browser storage is blocked. Both layouts fit without horizontal overflow and reported no application JavaScript errors. This verifies the local export, not the separate GitHub Actions artifact below. The standard-export favicon request may return 404 in the local static server; it does not affect the app.

The GitHub Actions candidate is run `38479510667`, artifact `greencollar-expo-web` (ID `11856342330`), built from commit `8b880e6f7a4ff7cf9ac88e1ae3bfe63990946e54`, with archive digest `sha256:106c98a809b3ceff2e59aabaddb83a8848e9d51c9466dfa5a341235911c487b9`. Its exact ZIP could not be retrieved for this Chromium smoke test. The supplied Library item (`libfile_3f090c8e9ec08191a1cfe1c4f50f569a`, 319,577 bytes) was recognized, but the signed-transfer helper failed and its returned workspace path was absent from the execution environment. The earlier connector download returned HTTP 403, and Chromium could not establish a tunnel to that temporary file host. Do not treat the local-export checks above as verification of this CI archive.

## What requires Clerk and/or the Cloudflare API

- Sign in, account creation, and user session/token require `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` and a configured Clerk instance.
- In a normal signed-in app session, business lookup/creation and saved customer reads/writes require Clerk session tokens plus `EXPO_PUBLIC_GREENCOLLAR_API_URL` pointing to a deployed Cloudflare Worker with the matching D1 database.
- In a normal signed-in app session, saved service locations and recurring service agreements require the authenticated Cloudflare API. Device GPS additionally requires browser/device location permission. The preview uses local sample records and does not request location access.
- In a normal signed-in app session, saved workday loading, queue status, completion/skip events, roster/availability, and schedule-draft saves require the authenticated Cloudflare API and matching migrations. In preview mode, the corresponding workday, timer, visit completion, and invoice-draft UI flows save only to this browser's demo workspace.
- In a normal signed-in app session, weather reports, invoice-draft load/save, routing readiness controls, and Google route-matrix requests require the authenticated Cloudflare API. Route-matrix requests also require provider configuration, enabled business settings, consent, and budget controls.

Preview edits are fictional browser data. They are not production records, do not create backend work orders, and do not notify or contact customers. No preview action writes to Clerk or Cloudflare. Server-backed workday, customer, schedule, invoice, and fieldwork writes, live routing, and location capture remain unavailable. The signed-in app retains its existing API guards and data contract.

## Upstream baseline Expo export

The values below describe the upstream artifact used for the existing Site version before this working UI update. The branch's local export verification and the separate CI artifact's provenance and smoke-test status are recorded above.

- Source commit: `76912dfa09af6c00ab6ae2336fad6a710c9b1bce`
- Upstream source before the visual-preview route: `dd6293972388c13f8f79a86d23621c81f7b1f3a0`
- GitHub Actions run: https://github.com/newssmyrna/greencollar/actions/runs/38445403402
- Result: dependency install, Expo web export, and artifact upload succeeded.
- Artifact: `greencollar-expo-web` (artifact ID `11837809194`, expires 2026-10-20 18:17 UTC).
- Bundle output: `dist/`; no Clerk key or API URL was supplied.

Reproduce with:

```sh
npm install
EXPO_PUBLIC_GREENCOLLAR_APP_PREVIEW=true npm run export:web
```

The `GreenCollar Expo web export` workflow runs this on pull requests and retains the `dist/` artifact for seven days.

## Private hosting status

Sites supports the compiled static bundle in `dist/`. An owner-private Sites project has been created for this preview:

- Project ID: `appgprj_6ace74f5f8548191b9bdb42f82f4c663`
- Current published version: version 1, deployment `appgdep_6ace87b3af188191bf319f67ac3f9c7b`
- Current published app source: `76912dfa09af6c00ab6ae2336fad6a710c9b1bce`
- Intended URL: `https://greencollar-actual-app-preview.nobleloach1.chatgpt.site`
- Access: owner-only
- The URL is live and was verified against the existing private Site. The next preview update must reuse this project and URL and publish the tested export from the new source commit.

No Site publish is part of this source change. The existing owner-only URL remains on the current published version until the tested export for this change is published to the same project.

## Deployment steps

1. Use the existing Site project ID above and obtain a fresh source-write credential.
2. Open its source with the installed Sites `site-workflow.mjs --project-id <project-id>` helper. Keep credentials on hidden stdin; never paste them into commands, files, or GitHub.
3. Copy the GreenCollar source at the reviewed commit into the Site checkout. Preserve `.openai/hosting.json` and `static.directory: dist`.
4. Put the exact tested Expo export in `dist/`, then package that source state with the Sites helper.
5. Publish using the owner-private Sites operation. Verify deployment success and the returned URL before calling the update live.
6. Record the pushed source SHA, Sites version, deployment ID, artifact digest, and verified URL here.

Do not enable public access. Do not deploy the Cloudflare Worker or configure a production API as part of this visual preview.
