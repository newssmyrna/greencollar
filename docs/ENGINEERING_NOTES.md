# Engineering notes and known gaps

## Verified in source and CI

The repository includes an Expo app, Clerk integration, authenticated Cloudflare Worker source, business/customer/day adapters, recurring-service logic, local timer persistence, road-matrix/planning modules, and local invoice-draft review.

GitHub Actions runs app typecheck/tests and Worker typecheck/authentication tests. The latest recorded main-branch run passed; the current timer and API-validation pull requests also have passing checks on their latest commits. These checks do not establish production deployment, live schema compatibility, or device acceptance.

## Current boundaries

- The Planner tab is a synthetic workload preview; it does not call the road-planning pipeline.
- The road-provider adapter is not activated for protected API routes.
- Customer entry is incomplete: saved customer creation captures a name, while full location/agreement editing remains unfinished.
- Invoice draft review is local memory only; there is no durable invoice API/table, delivery, payment reconciliation, or duplicate-billing protection.
- Timer state is stored locally. Timer reliability changes are under review in open PRs.
- GPS, complete offline sync, messaging, payment links, and customer portal remain unimplemented.

## Next engineering order

1. Merge and validate timer durability and server-side payload/visit eligibility changes.
2. Inspect the hosted D1 schema and migration history; test a reviewed reconciliation in staging.
3. Reconcile dependency locks and use reproducible CI installs.
4. Verify signed authentication through real endpoint flows and two-business isolation.
5. Complete customer location/service agreement workflows and connect the real route planner.
6. Add durable invoice/payment records, communications, and mobile/device acceptance.

Do not infer a release from repository source alone.
