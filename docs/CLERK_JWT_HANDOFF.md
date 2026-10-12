# GreenCollar Clerk JWT handoff

## Implemented in GitHub
The app requests `getToken({ template: 'greencollar-api' })` for both business onboarding and daily-data requests. This must match the Clerk JWT template name exactly.

## Verification before API deployment
The supplied publishable key is a development key identifying the Clerk instance, not a secret. **Do not assume** its hostname establishes the JWT template's actual `iss`, signing algorithm or JWKS URL without inspection.

1. Open Clerk → Configure → Sessions → JWT templates → `greencollar-api`.
2. Verify JWT claims include `"aud":"greencollar-api"`, and the signing algorithm uses an asymmetric key supported by the Worker JWT verifier.
3. Inspect Clerk's documented instance issuer and public JWKS URL from the dashboard/official metadata. Never share a secret key, user token, or signing private key.
4. Configure trusted `OIDC_ISSUER`, `OIDC_AUDIENCE`, `OIDC_JWKS_URL` on the *GreenCollar* Worker only. Expected audience: `greencollar-api`.
5. Verify cryptographic signature plus issuer, audience, expiry and `sub`, then verify owner/worker membership in D1. Validate with two separate demo users and businesses.
6. Deploy protected endpoints only after integration tests pass. Do not treat a green TypeScript test as proof of Clerk integration.
7. Never change News Smyrna Workers or databases.

## Current deployment
Cloudflare GreenCollar Worker remains health-check-only. The new protected API routes remain in GitHub; the iPhone app has not been run on-device. This is a development setup, not a live customer service.
