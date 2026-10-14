# Worker travel, arrival, and visit evidence follow-up

Prepared on 2026-10-14 from source commit `a61320658edaa550a041581ded25da4ea5a6f5a4` on `codex/worker-travel-arrive-photo`, based on sanitized PR87 head `68348b8`. This is a local UI follow-up; it has not been deployed.

## What changed

- Worker flow now has separate local actions for beginning sample travel, confirming sample arrival, and starting the visit timer. The timer stays unavailable until arrival is confirmed.
- Each stop shows the assigned sample drive duration and estimated arrival. The existing schematic route, inter-stop timing, worker-selected lunch, delay controls, conflicts, and return-to-depot estimate remain in the route panel.
- Work notes save to the local preview as the worker types, so a reload does not discard a draft.
- Workers can add, preview, and remove up to two compressed JPEG sample photos per visit in the web preview. Photos, travel state, and notes survive browser reloads and replanning; visit photos remain visible after completion.
- Copy identifies travel and arrival as simulated. Photo copy says images stay in this browser and are not uploaded or sent.

The route, travel state, arrival, timer, notes, photos, and any invoice examples are preview data. The preview does not use device GPS, live navigation, customer messaging, real authentication, a backend write, real billing, or payment processing. The local photo picker is implemented for the browser preview; native Expo photo picking is not implemented.

## Export artifact

- Static export archive: [`greencollar-worker-travel-arrive-photo-export.tar.gz`](greencollar-worker-travel-arrive-photo-export.tar.gz) (314,577 bytes)
- SHA-256: `e19d014738e21ac593838356413e7d60cfe8beadb577f7eaadaf4cf32ae61a9b`
- Checksum sidecar: [`greencollar-worker-travel-arrive-photo-export.tar.gz.sha256`](greencollar-worker-travel-arrive-photo-export.tar.gz.sha256)
- Archive contains the tested Expo `dist/` static web export.
- The prior route/lunch export remains preserved at `../worker-route-lunch/greencollar-worker-route-lunch-export.tar.gz`; its SHA-256 was rechecked as `585cc8b1d7bd0bdd1ddb3b063ffbf3a49f174f2d3731ca511a5bd95cc29c6383`.

## Validation

- `npm run typecheck` — passed.
- `npm test` — 338 passed, 0 failed.
- `EXPO_PUBLIC_GREENCOLLAR_APP_PREVIEW=true EXPO_NO_TELEMETRY=1 EXPO_OFFLINE=1 npm run export:web` — passed.
- [`browser-smoke.py`](browser-smoke.py) (Python Playwright and Pillow) — passed the sequence start day → travel → reload → arrival → timer → note/photo add, cap, and remove → reload → pause/resume → complete → next stop → travel. It observed zero JavaScript errors and zero external requests.

## Browser evidence

- [Phone: en route with arrival action](phone-en-route.png)
- [Phone: active visit, saved note, local photo](phone-active-with-note-photo.png)
- [Desktop: active visit, note and photo controls](desktop-active-with-note-photo.png)
- [Phone: next stop with inter-stop estimate and travel action](phone-next-stop.png)

Screenshots use fictional sample records and a generated illustration selected only inside the local browser smoke test.
