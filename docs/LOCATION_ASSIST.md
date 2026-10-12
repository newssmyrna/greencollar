# Foreground location assistance

**Status:** pure, tested geofence advisory and confirmation-event contract prepared on a review branch. It is not connected to the app, a device location API, timer transitions, or persistent audit storage.

## Operator behavior

- Request location only while the operator is using an active job screen; no background tracking.
- A GPS fix can display an arrival/departure suggestion. It cannot start, pause, complete, or bill a visit.
- Require the operator to confirm the suggestion. Keep visible manual controls available when permission is denied, accuracy is poor, the fix is delayed, or the operator disagrees.
- Treat fixes whose reported uncertainty overlaps the configured boundary as uncertain. Discard a fix whose accuracy exceeds the configured maximum.
- A manual confirmation records a short reason. A GPS confirmation records only the coarse proximity classification; do not persist exact coordinates in this event.
- Keep timer and billing state transitions independent. Visit completion still requires the explicit completion workflow.

## Implemented in this phase

`src/domain/location-assist.ts` validates coordinates/settings, computes a local straight-line geofence assessment with the fix's reported accuracy, and creates an audit event only after an operator confirmation. The event model deliberately excludes raw coordinates. Automated tests cover boundary uncertainty, poor accuracy, invalid inputs, GPS confirmation matching, and manual override.

## Remaining integration and release checks

- Foreground permission and one-shot current-location capture are wired into service-address creation; the user must explicitly save the form to persist the coordinates. Manual entry remains available.
- Add a visible, accessible arrival/departure suggestion plus explicit confirm/reject/manual controls in the active-job screen. Daily work now carries optional site coordinates, but this app-screen integration is not yet present.
- Persist append-only arrival/departure events with tenant authorization and retention rules; avoid collecting precise coordinates unless a documented requirement and consent justify it.
- Keep notes and photo capture, upload queue, retry, conflict handling and offline reconnection separate from timer completion.
- Test denied permission, approximate permission, stale fixes, indoor drift, airplane mode, app termination, manual correction, and iOS/Android devices.
- Verify no location event alone changes the timer, service status, invoice or payment.

Service-site coordinates are stored in the business's existing tenant-scoped location record and returned only through the authenticated business-scoped day API. No background tracking is configured. Expo SDK 54 `expo-location` is pinned to the documented `~19.0.8`; its foreground permission maps to iOS “When In Use.” See [Expo SDK 54 Location docs](https://docs.expo.dev/versions/v54.0.0/sdk/location/).

The radius and accuracy limits are product settings, not legal or safety guarantees. Tune them using field testing and make manual operation first-class.
