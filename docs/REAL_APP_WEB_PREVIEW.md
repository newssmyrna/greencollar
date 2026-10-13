# GreenCollar real-app web preview

## Source and preview mode

This preview build renders the actual `GreenCollarDashboard` from `App.tsx`: Today, Customers, Planner, Invoices, and Schedule. Schedule normally appears after Clerk loads an owner/admin business membership. `EXPO_PUBLIC_GREENCOLLAR_APP_PREVIEW=true` supplies a visibly named sample workspace only to expose that real screen. It does not create an account or call the API.

The in-app banner says Clerk and the Cloudflare API are disconnected. `EXPO_PUBLIC_GREENCOLLAR_API_URL` is intentionally unset. Values labeled Sample or Example are fixtures.

## What works in the visual build

- Tab navigation across the real dashboard screens.
- Local Planner workload calculations and form previews.
- Sample customers explicitly marked as examples and in-memory only.
- Read-only inspection of layout and labels.

## What requires Clerk and/or the Cloudflare API

- Sign in, account creation, and user session/token require `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` and a configured Clerk instance.
- Business lookup/creation and saved customer reads/writes require Clerk session tokens plus `EXPO_PUBLIC_GREENCOLLAR_API_URL` pointing to a deployed Cloudflare Worker with the matching D1 database.
- Saved service locations and recurring service agreements require the authenticated Cloudflare API. Device GPS additionally requires browser/device location permission.
- Saved workday loading, queue status, completion/skip events, roster/availability, and schedule-draft saves require the authenticated Cloudflare API and matching migrations.
- Weather reports, invoice-draft load/save, routing readiness controls, and Google route-matrix requests require the authenticated Cloudflare API. Route-matrix requests also require provider configuration, enabled business settings, consent, and budget controls.

No real customer records, schedule changes, invoice drafts, notifications, GPS points, or routing requests are available in this visual build. The authenticated app retains its existing guards.

## Expo export result

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
- Source branch: `main` in the Sites source repository
- Intended URL: `https://greencollar-actual-app-preview.nobleloach1.chatgpt.site`
- Access: owner-only
- Current deployment: **not published**; the Site has no saved version or live URL yet.

The Sites helper could not reach its authenticated source Git remote from the current workspace (network proxy unavailable). Do not present the intended URL as a live preview.

## Deployment steps

1. Obtain a fresh source-write credential for the exact Sites project ID above.
2. Open the Site source using the installed Sites `site-workflow.mjs --project-id <project-id>` helper in a clean checkout. Keep its credential on hidden stdin; never paste it into commands, files, or GitHub.
3. Copy the GreenCollar source at the source commit above into the Site checkout. Preserve the matching `.openai/hosting.json` project ID and `static.directory: dist`.
4. Put the successful Expo artifact's contents in `dist/`, then use the Sites source helper to commit, push, and package that exact source state.
5. Publish using the owner-private Sites deployment operation. Verify the deployment result is `succeeded` and use its returned URL before calling the preview live.
6. Replace this status with the pushed source SHA, Sites version number, deployment ID, and verified URL.

Do not enable public access. Do not deploy the Cloudflare Worker or configure a production API as part of this visual preview.
