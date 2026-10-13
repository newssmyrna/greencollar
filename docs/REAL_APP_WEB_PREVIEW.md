# GreenCollar real-app web preview

## Source and preview mode

This preview renders the actual `GreenCollarDashboard` screen from `App.tsx`, including Today, Customers, Planner, Invoices, and Schedule. The Schedule tab normally appears after Clerk loads an owner/admin business membership. For this visual build, `EXPO_PUBLIC_GREENCOLLAR_APP_PREVIEW=true` supplies a clearly named sample workspace only to expose the real Schedule screen. It does not create an account or call the API.

The in-app preview banner states that Clerk and the Cloudflare API are disconnected. `EXPO_PUBLIC_GREENCOLLAR_API_URL` is intentionally unset.

## What works in this visual build

- Tab navigation across the real dashboard screens.
- Local Planner workload calculations and form previews.
- Sample customers explicitly marked as examples and in-memory only.
- Read-only inspection of layouts and labels.

## What requires Clerk and/or the Cloudflare API

- Sign in, account creation, and user session/token: requires `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` and a configured Clerk instance.
- Business lookup/creation and saved customer reads/writes: require Clerk session tokens plus `EXPO_PUBLIC_GREENCOLLAR_API_URL` pointing to a deployed Cloudflare Worker with the matching D1 database.
- Saved service locations and recurring service agreements: require the authenticated Cloudflare API. Device GPS additionally requires browser/device location permission.
- Loading the saved workday, queue status, completion/skip events, workday roster/availability, and saving schedule drafts: require the authenticated Cloudflare API and matching migrations.
- Weather interruption reports, invoice draft load/save, routing readiness controls, and Google route-matrix requests: require the authenticated Cloudflare API. Route-matrix requests also require provider configuration, enabled business settings, consent, and budget controls.

No real customer records, schedule changes, invoice drafts, notifications, GPS points, or routing requests are available in the visual build. Existing authenticated app actions retain their existing guards.

## Export and verification

```sh
npm install
EXPO_PUBLIC_GREENCOLLAR_APP_PREVIEW=true npm run export:web
```

Expo writes the static bundle to `dist/`. The `GreenCollar Expo web export` GitHub Actions workflow runs this export on pull requests and uploads `dist/` as the `greencollar-expo-web` artifact for seven days.

## Hosting

The selected destination is the owner-private Sites project `appgprj_6ace74f5f8548191b9bdb42f82f4c663` (static `dist/` is supported by Sites). Intended URL: https://greencollar-actual-app-preview.nobleloach1.chatgpt.site

Deployment is pending until the compiled bundle is attached to the Sites source version and the deployment reports success. Record the final source commit, Sites version, and verified URL here after publication. The upstream app source used for this work was commit `dd6293972388c13f8f79a86d23621c81f7b1f3a0` on `codex/read-only-demo-entry`.
