# GreenCollar worker-day UI preview

This archive contains the locally tested Expo web export for the worker-day UI, browser smoke script, synthetic-data screenshots, and a source patch.

## Provenance

- Repository: `newssmyrna/greencollar`.
- Source branch: `codex/worker-day-ui-redesign`.
- Source commit: `83ecab608f8aee4da5963c489d0e625f88f5def6`.
- Parent implementation: stop-deferral baseline `73093b582e35bd1ed0a691c7c4d1d64778545681` (the `codex/worker-stop-deferral` PR line).
- The earlier route/lunch artifact remains preserved at `docs/ui-preview/worker-route-lunch/greencollar-worker-route-lunch-export.tar.gz`; its verified SHA-256 is `585cc8b1d7bd0bdd1ddb3b063ffbf3a49f174f2d3731ca511a5bd95cc29c6383`.
- Export command: `EXPO_PUBLIC_GREENCOLLAR_APP_PREVIEW=true EXPO_NO_TELEMETRY=1 EXPO_OFFLINE=1 npm run export:web`.
- Export bundle: `dist/_expo/static/js/web/AppEntry-fc1f36378468e5534e45ef8c877060cd.js` (1,197,334 bytes), SHA-256 `ada88c68fd2119377f434793e7465666186a25389630206eeb25148c3b63e50b`.
- The archive’s SHA-256 is recorded in the adjacent `.sha256` file.

## Contents

- `dist/` — tested static web export.
- `worker-day-ui-smoke.py` — Playwright smoke script for start-of-day, route/lunch/delay recalculation, stop actions, details, deferral and restore, repeated navigation, task/action fit, reload, viewport sizing, and external-request checks.
- `worker-day-ui-source.patch` — source delta from the stop-deferral baseline above.
- `screenshots/` — phone and desktop examples captured from the tested build.

## Verification

- `npm run typecheck` — passed.
- `npm test` — 344 passed, 0 failed.
- Expo web export — passed with offline mode enabled.
- Browser smoke — passed at 390×844, 320×568, 320×340, 1440×1000, and 150% simulated text enlargement at both phone sizes. At default text, the full current-task card and its primary action fit together in the main viewport at 390×844 and 320×568. The test also checked the scroller/action/nav boundaries and repeated back/continue/tab navigation at both sizes.
- The full sample flow remains covered: lunch and delay changes to return estimates, no-slot blocking, repeated-tap protection, contact details, local photo selection, work notes, deferral and restore, timer transitions, and reload/continue. Browser checks reported 0 JavaScript errors and 0 external requests.
- The 150% enlargement is a CSS simulation in Chromium; native operating-system font settings are not emulated. Enlarged text can wrap and scroll to the primary action on short phones.
- Browser run reported 0 JavaScript errors and 0 external requests.
- The 320×340 check simulates the reduced viewport available with a keyboard open; it does not emulate an operating-system keyboard.

To rerun the browser smoke from the repository, start a local static server with `python3 -m http.server 8773 -d dist`, then run `python3 docs/ui-preview/worker-day-ui/worker-day-ui-smoke.py`. Set `WORKER_PREVIEW_URL` to override the default local URL. The smoke script requires Python Playwright and Chromium.

## Demo boundaries

All records and route legs are synthetic. Changes, work notes, photos, day start, and visit states are saved in browser-local preview storage only. The schematic route and time estimates use fixed sample travel minutes and do not use GPS, live navigation, traffic, dispatch messaging, authentication, a business backend, billing, or payments.
