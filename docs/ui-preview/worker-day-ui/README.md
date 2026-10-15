# GreenCollar worker-day UI preview

This archive contains the locally tested Expo web export for the worker-day UI, browser smoke script, synthetic-data screenshots, and a source patch.

## Provenance

- Repository: `newssmyrna/greencollar`.
- Source branch: `codex/worker-day-ui-redesign`.
- Source commit: `0ba710c5330f4f54197687dd134bdd32afb8020a`.
- Parent implementation: stop-deferral baseline `73093b582e35bd1ed0a691c7c4d1d64778545681` (the `codex/worker-stop-deferral` PR line).
- The earlier route/lunch artifact remains preserved at `docs/ui-preview/worker-route-lunch/greencollar-worker-route-lunch-export.tar.gz`; its verified SHA-256 is `585cc8b1d7bd0bdd1ddb3b063ffbf3a49f174f2d3731ca511a5bd95cc29c6383`.
- Export command: `EXPO_PUBLIC_GREENCOLLAR_APP_PREVIEW=true EXPO_NO_TELEMETRY=1 EXPO_OFFLINE=1 npm run export:web`.
- Export bundle: `dist/_expo/static/js/web/AppEntry-8f9f0a61715c9f5280ebe252241c074c.js` (1,195,781 bytes), SHA-256 `82aaf2121c1f87874a246ba875defdeb87962304472c248a5d5e2ffaeb3bcb7c`.
- The archive’s SHA-256 is recorded in the adjacent `.sha256` file.

## Contents

- `dist/` — tested static web export.
- `worker-day-ui-smoke.py` — Playwright smoke script for start-of-day, route/lunch/delay recalculation, stop actions, details, deferral and restore, reload, viewport sizing, and external-request checks.
- `worker-day-ui-source.patch` — source delta from the stop-deferral baseline above.
- `screenshots/` — phone and desktop examples captured from the tested build.

## Verification

- `npm run typecheck` — passed.
- `npm test` — 344 passed, 0 failed.
- Expo web export — passed with offline mode enabled.
- Browser smoke — passed at 390×844, 320×568, 320×340, 1440×1000, and 150% simulated text enlargement. It covered the full sample flow, including lunch and delay changes to return estimates, no-slot blocking, repeated-tap protection, contact details, local photo selection, work notes, defer/restore, timer transitions, and reload/continue.
- Browser run reported 0 JavaScript errors and 0 external requests.
- The 320×340 check simulates the reduced viewport available with a keyboard open; it does not emulate an operating-system keyboard.

To rerun the browser smoke from the repository, start a local static server with `python3 -m http.server 8773 -d dist`, then run `python3 docs/ui-preview/worker-day-ui/worker-day-ui-smoke.py`. The smoke script requires Python Playwright and Chromium.

## Demo boundaries

All records and route legs are synthetic. Changes, work notes, photos, day start, and visit states are saved in browser-local preview storage only. The schematic route and time estimates use fixed sample travel minutes and do not use GPS, live navigation, traffic, dispatch messaging, authentication, a business backend, billing, or payments.
