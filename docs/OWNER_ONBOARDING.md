# GreenCollar owner onboarding — code complete, deployment gated

## Workflow
1. Clerk user signs in and receives a cryptographically verifiable API JWT.
2. Mobile requests GET /v1/business with the bearer token.
3. If no business exists, user enters a business name and requests POST /v1/business.
4. Worker verifies issuer, JWKS signature and audience, and stores a newly generated business ID with the verified subject as owner.
5. Unique membership subject index prevents concurrent duplicate businesses for the solo-operator release.
6. GET /v1/customers and GET /v1/day require both a verified user and membership to the business.
7. App fetches due service records using the returned business ID rather than a hardcoded environment business ID.

## Security and deployment gates
- Current deployed Worker remains health-only. The new endpoints are committed **in source**, not deployed.
- Configure Clerk JWT issuer, audience and trusted JWKS URL on the Worker after validating Clerk's token type and signing algorithm.
- Apply the unique index `0004_owner_unique.sql` after confirming existing membership uniqueness.
- Verify real signed test tokens, wrong issuer/audience, expired tokens, cross-business isolation and retry/race cases.
- D1 recurring-service tables were created with minimal schema; reconcile schema with reviewed migrations before using real customer data.
- Current GitHub Expo CI validates the mobile app but does not yet run a standalone Cloudflare Worker type-check or deploy smoke tests.
- No real customer data or credentials in GitHub.

## Still needed
Verified token configuration, live endpoint deployment, Clerk device sign-in, end-to-end tests, persistent customer forms and site/service agreement editing.
