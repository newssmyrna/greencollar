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
- A visible reset confirmation restores the fictional workspace. Edits persist in this browser's local storage; if storage is blocked, they remain in page memory until reload. Clearing browser storage removes the saved preview edits.

## Working UI verification

The current UI change was checked in Chromium against the Expo web export at 390 × 844 (phone-sized) and 1440 × 1000 (desktop). The check covered a valid and invalid customer form, Back clearing an interrupted form, a rapid double tap saving one customer and one recurring job, creating a sample address and schedule, seeing the job on Today and Schedule, invalid-date feedback, reload persistence, reset cancel and confirm, and the browser-storage-blocked session-only disclosure. Both layouts fit without horizontal overflow and reported no application JavaScript errors. The standard-export favicon request may return 404 in the local static server; it does not affect the app.

## What requires Clerk and/or the Cloudflare API

- Sign in, account creation, and user session/token require `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` and a configured Clerk instance.
- Business lookup/creation and saved customer reads/writes require Clerk session tokens plus `EXPO_PUBLIC_GREENCOLLAR_API_URL` pointing to a deployed Cloudflare Worker with the matching D1 database.
- In a normal signed-in app session, saved service locations and recurring service agreements require the authenticated Cloudflare API. Device GPS additionally requires browser/device location permission. The preview has a separate local-only path and never requests location access.
- Saved workday loading, queue status, completion/skip events, roster/availability, and schedule-draft saves require the authenticated Cloudflare API and matching migrations.
- Weather reports, invoice-draft load/save, routing readiness controls, and Google route-matrix requests require the authenticated Cloudflare API. Route-matrix requests also require provider configuration, enabled business settings, consent, and budget controls.

Preview edits are fictional browser data. They are not production records, do not create backend work orders, and do not notify or contact customers. Clerk, Cloudflare writes, live routing, invoice saving, timer/fieldwork writes, and location capture remain unavailable. The signed-in app retains its existing API guards and data contract.

## Upstream baseline Expo export

The values below are the verified upstream artifact used for the existing Site version, before this working UI update. The current tested export is built from this branch and its exact commit and artifact checksum are recorded in the associated draft PR and handoff.

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
