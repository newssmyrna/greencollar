# GreenCollar owner onboarding

## Source workflow

1. The owner signs in through Clerk Expo.
2. The app requests the owner's businesses using a verified API token.
3. If no business exists, the owner can submit a business name to the Worker.
4. The Worker verifies the token and creates a business plus the verified owner's membership.
5. The app uses that business ID to request saved customers and the selected service day.
6. Customer and day endpoints check the authenticated user's membership before tenant-scoped reads or writes.

## Release gates

- Source code and green CI are not deployment evidence. The last recorded production status says the Worker is health-only.
- Verify the production Clerk issuer, audience, JWKS configuration, callbacks, and mobile sign-in.
- Inspect and reconcile the hosted D1 schema; recurring tables were previously reported to differ from committed migrations.
- Test signed endpoint flows, two-business isolation, roles, onboarding races, and duplicate requests against staging.
- Complete persistent customer location/service-agreement forms; the current saved-customer UI collects only a name.
- Complete device acceptance before onboarding real businesses.

## Data handling

No real customer data or credentials belong in repository fixtures, logs, or source control.
