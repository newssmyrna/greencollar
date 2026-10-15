# GreenCollar worker stop deferral preview

This local browser export continues the existing worker-day route and lunch preview. It adds a reasoned stop deferral flow, confirmation and cancel actions, restore/undo, and browser-local persistence. Deferring a stop leaves its assignment and completed visit history intact. The remaining route, lunch slot, drive time, and return-to-depot estimate recalculate from the latest saved sample route position; completed stops no longer add service or drive time to the remaining estimate.

Workers can defer a stop before travel, while sample travel is in progress, or after sample arrival. The latter two transitions clear the in-progress travel/arrival state and retain a local sample route position. A 30- or 60-minute lunch can be rescheduled at the current sample position or after a remaining stop. “Other” requires a note.

## Included files

- `dist/`: self-contained Expo web export
- `phone-start-of-day.png`, `phone-first-stop.png`, `phone-defer-confirmation.png`, `phone-deferred-stops.png`, `phone-deferred-route.png`, `desktop-restored-route.png`: browser evidence
- `worker-stop-deferral-smoke.py`: local Playwright flow used for the browser check
- `source-change.patch.gz`: compressed source and unit-test patch from the branch base

## Verification

- `npm run typecheck`: passed
- `npm test`: 344 passed, 0 failed
- `python docs/ui-preview/worker-stop-deferral/worker-stop-deferral-smoke.py`: passed; 0 browser JavaScript errors and 0 external requests
- Desktop screenshot: no horizontal overflow

The original route/lunch export was verified before reuse and remains unchanged at SHA-256 `585cc8b1d7bd0bdd1ddb3b063ffbf3a49f174f2d3731ca511a5bd95cc29c6383`.

All records and travel figures in this export are fictional sample data. The route is schematic, and the export makes no live GPS, navigation, traffic, SMS, authentication, payment, backend, or customer-contact claims. No Site, deployment, credentials, or paid service was created or changed.
