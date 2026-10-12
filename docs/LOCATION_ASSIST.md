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

- Add and review the platform permission flow and user-facing explanation before enabling native location.
- Add a visible, accessible suggestion plus explicit confirm/reject/manual controls in the active-job screen.
- Persist append-only arrival/departure events with tenant authorization and retention rules; avoid collecting precise coordinates unless a documented requirement and consent justify it.
- Keep notes and photo capture, upload queue, retry, conflict handling and offline reconnection separate from timer completion.
- Test denied permission, approximate permission, stale fixes, indoor drift, airplane mode, app termination, manual correction, and iOS/Android devices.
- Verify no location event alone changes the timer, service status, invoice or payment.

The radius and accuracy limits are product settings, not legal or safety guarantees. Tune them using field testing and make manual operation first-class.
