# Foreground location assistance

**Status:** active-job GPS suggestions and operator confirmations are integrated on a review branch. Service coordinates flow from the saved location into today's due-work view. This remains a prototype pending device acceptance testing, production deployment, and server-side retention/export policy.

## Operator behavior

- Request location only after the operator taps the one-shot check on an active saved job; no background tracking is configured.
- Require foreground permission. If permission is denied, no saved pin exists, the fix is weak, or location is uncertain, keep manual confirmation available.
- A confident fix can suggest arrival or departure. The operator must confirm it. GPS never starts, pauses, completes, or bills a visit.
- Current prototype thresholds are a 100 m site radius and 50 m maximum reported accuracy. Treat these as unvalidated product assumptions, not guarantees.
- Manual arrival/departure requires a short reason. GPS confirmation stores only its coarse classification; exact device coordinates are not put in the confirmation event.
- Timer and billing actions remain separate. Visit completion still uses its explicit workflow.

## Implemented

- `src/domain/location-assist.ts` validates coordinate inputs, classifies one fix using reported accuracy and uncertainty, creates a confirmation event only after operator action, and bounds local history to 20 events.
- `src/data/local-location-confirmations.ts` stores compact confirmation events in a device-local SecureStore outbox scoped to the signed-in operator. Each new record has a stable event ID, business/agreement/date scope, and pending/synced state; retrying sends the same ID.
- The review branch adds `POST/GET /v1/location-confirmations` and migration `0006_location_confirmations.sql`. The API verifies JWT and business membership, checks the service agreement/date, enforces GPS action matching or a manual reason, and supports idempotent retries by event ID. It stores no exact coordinates and offers no edit/delete route.
- The Today screen connects the active scheduled job with its saved site pin and provides one-shot GPS suggestions, matching explicit GPS confirmation, manual arrival/departure, reason capture, and recent history.
- Service-site coordinates are optional, captured only on the operator's tap (or manually entered), explicitly saved to the tenant-scoped service location, and carried through the authenticated business-scoped day API.
- Tests cover boundary uncertainty, poor accuracy, invalid inputs, matching GPS confirmation, required/length-bounded manual reasons, and bounded history.

## Remaining integration and release checks

- Client sync/retry is implemented in the review branch. New confirmations are saved locally first, then POSTed to the audit endpoint; failures remain pending and can be retried without changing the event ID.
- The API and migration are review-branch code only. Apply and reconcile migration 0006 only in a separately verified staging D1; no hosted D1 migration or Worker deployment was performed.
- Add server retention/export controls and document the audit policy before production.
- Pending local records are limited to 20 entries; older pre-sync events remain visible as local-only and cannot be reconstructed into the server queue. Server retention and export are not solved.
- Test denied/approximate permission, delayed or stale fixes, indoor drift, airplane mode, app termination, storage failure, and manual correction on current iOS and Android devices.
- Review the 100 m / 50 m thresholds with field testing and product feedback.
- Verify on-device that a location event never changes timer, service status, invoice, or payment state.
- Keep photos, work notes, offline uploads, retries, routing, and fuel estimates as separate future features.

Expo SDK 54 `expo-location` uses `~19.0.8` and its foreground permission maps to iOS “When In Use.” See [Expo SDK 54 Location docs](https://docs.expo.dev/versions/v54.0.0/sdk/location/).

