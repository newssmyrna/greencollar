# Clerk login setup (development)

The Expo app now contains a Clerk-hosted sign-in/sign-up gate. The supplied publishable key is a test key. It is deliberately not committed to GitHub.

1. In the Clerk GreenCollar dashboard open **Native applications** and enable **Native API**.
2. Register iOS bundle ID and Android package: `com.nsbtechnology.greencollar`.
3. Copy the **publishable** key (starts with `pk_test_`). Never share or commit a Clerk **secret** key.
4. Create local `.env` from `.env.example` and add `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY=...`.
5. From repository root use `npx expo install @clerk/expo expo-secure-store expo-auth-session expo-crypto expo-web-browser` to align dependency versions with the installed Expo SDK; test with Expo Go or a development build according to the Clerk hosted-auth guide.
6. Confirm sign-in/sign-out and persistence on a device.

## Cloudflare API remains restricted

The deployed Cloudflare Worker currently only answers a health check. Customer endpoints exist in source but have **not** been deployed.

Before deploying customer endpoints:
- Configure a trusted Clerk token issuer, matching JWKS URL and an API-specific audience or verified JWT template.
- Check each bearer token cryptographically and require membership in the requested business.
- Add owner onboarding and multiple-business isolation tests.
- Test invalid/expired tokens, wrong audience and unauthenticated access.

**Signing into the mobile app does not yet create a GreenCollar business or persist customers.**
