# GreenCollar 🌱

**Your business. On autopilot.**

Mobile-first operating software for on-site service businesses across industries.

## Product vision

Customer setup → daily planning → road-aware routing → GPS-assisted arrival and job timers → customer communication → invoices and payments → learning from completed work.

GreenCollar is designed for owner-operators first, with an architecture that can grow to teams and multiple vehicles. Lawn care is an example service, not the product category.

## Current status

The repository contains an Expo / React Native app, Clerk sign-in integration, Cloudflare Worker API source, D1 migrations, recurring-service logic, a local work timer, and automated tests. The app can load saved business/customer/day data when the authenticated API is configured. The planner remains a synthetic workload preview; invoices remain local drafts.

See [the current status and release gates](docs/CURRENT-STATUS.md) for the difference between source code, CI, deployed services, and real-world verification. The current timer-reliability and API-validation work is in open pull requests and is not yet part of `main`.

## Active technical direction

- Mobile app: Expo / React Native and TypeScript.
- Identity: Clerk-issued signed JWTs, verified by the Worker against trusted JWKS metadata.
- API and database: Cloudflare Workers and D1, with tenant membership checks in the Worker.
- Road planning, SMS, payments, customer portal, and GPS automation remain future integrations.

The SQL under `supabase/` is an archived alternative design; Supabase is not the active backend path.

## Product principles

- Industry-independent, mobile-first workflows.
- Planning that explains constraints, travel, and duration estimates.
- Operator control over schedule approval, prices, customer messages, and exceptions.
- Tenant isolation, least-privilege access, and permission-based location use.
- Complete end-to-end workflow before a paid public launch.

**Working brand:** GreenCollar (GrnCollar fallback). **Proposed business umbrella:** NSB Technology Group.
