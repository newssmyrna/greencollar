# GreenCollar authentication smoke test plan

Status: code prepared; live customer API NOT deployed.

## Protected session endpoint
`GET /v1/session` returns `{ "authenticated": true }` only after JWT verification with Clerk's public JWKS, expected issuer and audience. It deliberately does not return customer data, token claims or a raw user ID.

On a deployment containing this endpoint:
- No token → 401
- Expired, tampered, wrong issuer/audience token → 401
- Correct signed Clerk template token → 200 with authenticated:true
- Unconfigured verifier → 503

## Verified app template
Client requests `getToken({ template: 'greencollar-api' })` on authenticated backend calls.

## Release gates
1. Verify the Cloudflare Worker's JWT verification succeeds with a real issued Clerk test JWT using an authorized application client. Never paste JWTs into chat or GitHub.
2. Run tenant membership tests against D1 using two distinct test users and two distinct test businesses.
3. Confirm no cross-business customer/address/visit reads or writes.
4. Connect the API from a development iPhone build before real customer entry.
5. Launch only after full privacy and billing tests.

The currently deployed `greencollar-api` remains a health-check service. Source commits alone do not deploy the protected API.
