# Architecture

**Status:** This describes the current source architecture and the proposed product integrations. Source presence does not prove production deployment.

## Mobile client

- Expo / React Native / TypeScript app.
- Clerk sign-in and API bearer tokens.
- SecureStore-backed local work-session state.
- Saved business, customer, and day-data adapters.
- Synthetic example cards and a workload preview are still present; they are not production scheduling.

## Identity, API, and data

- Clerk JWTs are verified by the Cloudflare Worker using configured issuer, audience, and trusted HTTPS JWKS metadata.
- Worker endpoints apply business-membership checks before tenant-scoped database access.
- Cloudflare D1 is the active backend direction. Committed SQL is under `cloudflare/migrations/`.
- The `supabase/` migration is an archived alternative design, not the active deployment plan.
- The last recorded production status says the Worker exposes health only and the live recurring-service schema differs from the committed migrations. Verify these facts directly before using real customer data.

## Existing domain modules

- Recurring visit generation uses calendar dates and explicit frequency rules.
- Saved-day summaries filter completed/skipped visits and use historical durations where available.
- Planning and road-matrix modules exist, but the app's Planner tab does not yet call the road-planning pipeline. No routing provider is activated.
- Invoice draft generation and price review are local only. Invoice delivery, payment reconciliation, and durable duplicate prevention are not implemented.
- Timer state is local; the reliability improvements in open PRs are not yet in `main`.

## Planned integrations

- Real road routing and constrained schedule optimization.
- Opt-in GPS/geofence assistance with manual controls.
- Customer messaging with consent, opt-out, delivery state, and history.
- Durable invoices and payment links/status.
- Offline-safe event queue and customer-facing portal.

## Critical behavior

- Tenant identity must come from verified membership, not a client-supplied business ID alone.
- Never bill or message solely because of a location event.
- Treat addresses, contact details, access instructions, and photos as sensitive tenant data.
- Keep third-party costs, retention, failures, and manual correction paths visible.
