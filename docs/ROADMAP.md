# Roadmap

## Foundation — source exists; integration gates remain

Implemented in the repository:
- Expo / React Native application and Clerk sign-in flow.
- Cloudflare Worker source for business onboarding, customers, day data, and visit completion.
- D1 schema migrations, tenant membership checks, recurring-service date generation, and saved-day view model.
- Local work timer persistence, recurrence/planning domain modules, road-matrix adapter, and invoice draft review.
- App and Worker typecheck/test jobs in GitHub Actions.

Still gated:
- Inspect and reconcile the actual D1 schema against committed migrations in a staging copy.
- Verify Clerk issuer, audience, JWKS, native sign-in, and authenticated endpoints in the deployed environment.
- Replace synthetic planner preview with the real road-planning pipeline.
- Finish customer location/agreement editing and durable invoice/payment workflows.

## Integrated operator workflow — next product phase

- Connect saved agreements to an operator-approved daily plan using real travel times and constraints.
- Add vehicle, equipment, fuel-cost assumptions, and transparent route estimates.
- Complete timer transitions, visit notes/photos, offline event recovery, and mid-day replanning.
- Add consent-based customer notices and durable invoice/payment records.
- Keep every externally visible action reviewable, retry-safe, and auditable.

## Validation and launch

- Test a complete synthetic journey across two isolated businesses.
- Verify real signed tokens, authorization roles, schema constraints, retries, and data recovery in staging.
- Run mobile/device acceptance and controlled real-world trials.
- Complete privacy, security, support, app-store, cost, and backup checks before a paid launch.

Never treat source code or green CI as proof that a production service is deployed or verified.
