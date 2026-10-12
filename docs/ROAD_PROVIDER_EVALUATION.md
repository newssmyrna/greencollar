# Road provider evaluation

**Status:** evaluation complete; provider selection and integration are pending  
**Reviewed:** 2026-10-12  
**Pricing snapshot:** provider pages checked 2026-10-12; Google pricing page reports last updated 2026-10-08

## Current GreenCollar state

The app currently uses a synthetic travel-time matrix. `cloudflare/src/road-provider.ts` contains a dormant adapter for an OSRM-compatible HTTPS matrix endpoint; it has no configured host, credentials, or caller. No routing provider is live, and no customer coordinates have been sent to a routing vendor.

The adapter is not a provider integration. Google and Mapbox have different request/authentication formats from the adapter's OSRM-compatible contract, so either would need a provider-specific adapter and response mapping.

## Candidate comparison

| Candidate | Matrix capabilities and limits | Published usage pricing snapshot | Integration notes |
|---|---|---|---|
| Google Routes Compute Route Matrix Essentials | Up to 625 elements per request for standard routing; traffic-aware-optimal and transit requests are limited to 100 elements. Bills by origin × destination element. | 10,000 free usage cap per month, then $5 per 1,000 elements in the first paid band (up to 100,000). Advanced traffic features may bill under a higher SKU. | HTTPS POST with field masks and per-element responses. Enabling the service requires a billed Google Cloud project and a protected key/token. |
| Mapbox Matrix API | Up to 625 elements for standard driving, 25 input coordinates; driving-traffic allows 10 coordinates and has a lower request-per-minute limit. Returns duration and distance matrices; unreachable pairs are null. | First 100,000 monthly elements free; $2 per 1,000 in the 100,001–500,000 band. Higher-volume pricing changes by tier or requires sales. | HTTPS request includes an access token. Matrix responses are duration/distance arrays and require explicit coordinate ordering/mapping. |
| HERE Matrix Routing | Candidate for a later review. | Not evaluated in this snapshot; do not infer cost or terms. | Reopen if account availability, coverage, or commercial terms make it preferable. |
| Self-hosted OSRM-compatible service | Fits the dormant adapter contract if the service provides the expected HTTPS table endpoint and response. | No vendor API usage charge implied; hosting, operations, data updates, and support still have costs. | Production readiness depends on lawful/commercial map data use, attribution, uptime, capacity, and maintenance. A public demo endpoint is not a production service. |

Prices and quotas can change and are not a quote. Actual invoices depend on SKU selection, account usage, features, taxes, negotiated terms, and quota setup. Recheck provider pricing and contractual terms before enabling production traffic.

## Example workload model

A symmetric matrix of **8 points** (for example, one depot and seven service stops) has **8 × 8 = 64 elements**. This is a planning example, not measured GreenCollar usage.

| Hypothetical workload | Elements/month | Google Essentials estimate* | Mapbox estimate* |
|---|---:|---:|---:|
| 1 business × 20 full matrix builds | 1,280 | $0 within 10,000 free cap | $0 within 100,000 free tier |
| 10 businesses × 20 full matrix builds each | 12,800 | About $14 (2,800 billable elements × $5/1,000) | $0 within 100,000 free tier |

\*Assumes all requests use only the listed matrix SKU and no other use consumes that free cap. Google price is Essentials only; a higher-priced feature/SKU changes the estimate. It excludes retries, partial/asymmetric calls, taxes, and negotiated discounts. One matrix rebuild uses another 64 elements; refreshes, replans, and retries must be counted.

The current data model does not capture actual routing rebuild counts or element usage. Add server-side metering and a hard quota before using these estimates to choose a budget.

## Recommendation and open decision

Keep both **Google Routes Essentials** and **Mapbox Matrix API** on the shortlist. Mapbox has a larger published free element band for this simple workload; Google has a clear server-side matrix product and optional traffic features, which may use a more expensive SKU. The information available does not establish a best provider for GreenCollar because the owner has not selected a monthly budget, traffic requirement, map display approach, or acceptable location-data terms. **No provider is selected in this phase.**

Before enabling an integration, record:

1. Provider account owner and project/environment.
2. Maximum monthly spend and hard monthly/per-account request/element quotas.
3. Whether traffic-aware ETAs are required and what route points are submitted.
4. User-facing location disclosure and the applicable consent/legal review.
5. Provider data retention, caching, attribution, and map-display rules for this exact use.
6. Key storage/rotation, authentication, per-business authorization, rate limiting, audit redaction, timeout behavior, and safe fallback.
7. Device acceptance tests and an operational way to disable the provider.

## Release gates

- Do not send client-provided coordinates from an unauthenticated endpoint.
- Do not put provider credentials in the mobile app or logs.
- Require signed-in operator authorization, business scoping, user-facing disclosure, and reviewed consent/lawful-basis language before third-party location transfer.
- Meter matrix elements per authorized business, enforce server-side quotas/spend guardrails, and define retry limits.
- Follow provider-specific terms for storage/caching and attribution; do not assume route results can be cached indefinitely.
- Keep provider integration disabled until a provider, account, and spend limit are explicitly configured.
- Preserve null for unreachable routes; never replace a failed road route with a straight-line estimate.
- Add provider-specific contract tests, then validate real routing only with approved test locations before customer data is used.

## Sources

- [Google Routes API pricing](https://developers.google.com/maps/billing-and-pricing/pricing): Compute Route Matrix Essentials lists 10,000 free usage cap and $5 per 1,000 in its first paid band; page last updated 2026-10-08.
- [Google Routes API usage and billing](https://developers.google.com/maps/documentation/routes/usage-and-billing): matrix billing per element, feature-dependent SKU, quotas, request limits, and daily quota controls.
- [Google Compute Route Matrix overview](https://developers.google.com/maps/documentation/routes/compute-route-matrix-over): standard matrix request capacity and returned route data.
- [Mapbox Matrix API docs](https://docs.mapbox.com/api/navigation/matrix/): matrix element billing, supported profiles, limits, null handling, and response shape.
- [Mapbox pricing](https://www.mapbox.com/pricing): Matrix API monthly element bands and rates, including the first 100,000 free and $2 per 1,000 in the next band.
- [HERE Matrix Routing introduction](https://docs.here.com/routing/docs/matrix-routing-intro): candidate reference for a future evaluation.
