# Authentication integration

## Current source

The app uses Clerk Expo sign-in and requests a JWT from the `greencollar-api` token template. Cloudflare Worker source verifies bearer tokens against configured issuer, audience, and HTTPS JWKS metadata, then checks the authenticated subject's business membership.

The current source branch includes customer/day/business endpoints. The current timer and endpoint-validation work is in open pull requests and remains separate from `main` until merged.

## Production status

The latest recorded deployment status says the Worker exposes health only; authenticated endpoints have not been verified against production. Production issuer/audience/JWKS values and native sign-in behavior must be checked directly before treating authentication as live. Development metadata in configuration is not proof of production setup.

## Verification gates

1. Confirm Clerk's token template, issuer, audience, algorithm, JWKS URL, callback URLs, and mobile deep links.
2. Configure Worker values through the deployment environment, never in the app bundle or source.
3. Test valid, missing, expired, malformed, wrong-issuer, and wrong-audience tokens.
4. Test owner/admin/worker permissions and isolation across two businesses.
5. Verify account onboarding and membership creation are atomic and safe under retries/races.
6. Test the deployed API and native sign-in on a device before enabling real customer data.

No signing secret, service-role key, or production token belongs in GitHub.
