# Authentication integration — configured but not live

GreenCollar's Cloudflare Worker customer API uses standards-based signed OIDC JWT bearer tokens. Tokens are validated using the trusted provider's JWKS, exact issuer and audience, then checked against D1 business memberships.

## Required Worker configuration

- `OIDC_ISSUER`: trusted issuer value
- `OIDC_AUDIENCE`: the API audience/identifier
- `OIDC_JWKS_URL`: trusted HTTPS JWKS endpoint

Select and configure an OIDC provider with native mobile PKCE sign-in. This is **not yet selected/configured**. Do not put signing secrets into the mobile app or GitHub.

## Provisioning

1. Verify provider configuration, callback URIs and mobile deep links.
2. Build trusted account onboarding that creates a business and its verified owner membership atomically. Do not let clients create their own role bindings.
3. Test with two separate synthetic businesses and real signed test tokens.
4. Verify rejection of missing tokens, invalid signatures, wrong issuer/audience, expired tokens and cross-tenant access.
5. Test least-privilege worker role and tenant ownership for every create/read/update/delete operation.
6. Enable customer endpoints only after validation; use staging first.

At this stage, GET/POST `/v1/customers?business_id=<id>` are implemented in source but **have not been deployed**. Unconfigured OIDC fails closed. Existing deployed Worker is health-only. No actual business or customer data has been inserted.

The migration `0002_auth_memberships.sql` creates membership records, but does not grant membership to anyone.
