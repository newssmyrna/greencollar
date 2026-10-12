# Road routing and fuel estimates

**Status (2026-10-12):** provider comparison and distance/fuel estimation are prepared in a review branch. No provider, hostname, key, or paid account is configured. No customer coordinates are sent to an external routing service.

## Provider comparison

Published prices and limits below were checked against provider documentation on 2026-10-12. Prices are per 1,000 billed elements unless noted; verify current pricing before launch.

| Option | Published allowance/pricing | Matrix ceiling and tradeoffs |
|---|---|---|
| Mapbox Matrix API | Up to 100,000 matrix elements/month free; $2 per 1,000 for 100,001–500,000, with lower volume tiers after that. | Up to 625 elements per request (25×25). Attractive for a small pilot; needs a key, billing controls, attribution/terms review, and batching for 50 jobs. |
| Google Routes Compute Route Matrix Essentials | 10,000 free elements/month; $5 per 1,000 through 100,000, with lower tiers after that. | Up to 625 elements per request; Pro/Enterprise features have different SKU rates. Mature managed option, with higher basic matrix cost after the free tier. |
| Self-hosted OSRM | No per-request vendor fee; operating cost is infrastructure, map-data processing, updates, and monitoring. | OSRM Table returns duration and distance. More control, but the routing service and map data need ongoing operations. |
| Public OSRM demo server | No dependable commercial price or SLA. | Do not use for production: access is best-effort and may be withdrawn; the project asks clients to avoid excessive load and provide ODbL/OSRM attribution. |

A 51-node matrix (depot plus 50 candidate locations) contains 2,601 elements. One full matrix per day for 30 days would total 78,030 elements before replans. At current published tiers this is within Mapbox's initial 100,000 monthly elements. Comparable Google Essentials usage has about 68,030 paid elements after its 10,000-element allowance (about $340.15 at $5/1,000, assuming all elements are billed in that tier). Matrix chunking, retries and repeated replans affect request counts and cost.

**Recommendation:** evaluate Mapbox first for a limited, server-side pilot because its current matrix allowance and initial paid tier fit low-volume planning more comfortably. Keep the provider boundary neutral. Do not activate routing until the owner selects a provider and supplies an approved server-side credential. Self-hosted OSRM remains the no-per-call alternative if the project is willing to operate routing infrastructure. This is an evaluation, not an account selection or purchase.

## Fuel estimate behavior

The domain helper uses routed miles and editable assumptions for vehicle MPG, MPG while towing, whether a trailer is attached, and cents per gallon. It reports gallons and estimated fuel cost. This is a planning estimate, not an actual fuel transaction; idling, terrain, traffic, payload and vehicle-specific variation affect real use.

The planner reports miles and fuel only when the provider supplies a complete distance matrix for the selected route. Missing distances produce unknown values, never straight-line substitutes.

## Activation and safety gates

- Keep routing server-side; never put provider keys in the mobile app.
- Before sending coordinates, authenticate and authorize the business, disclose third-party coordinate processing and obtain any required consent.
- Enforce per-business quotas, provider request/element budgets, timeout and retry limits, and an operator-visible failure state.
- Cache only after the selected provider's current storage/retention terms are checked. Scope cache entries to the business and normalized coordinates/profile; do not log customer coordinates or provider secrets.
- Until a provider is configured, keep synthetic matrices labeled test/demo only. If a live request fails, surface “route unavailable”; use a prior matrix only if its freshness and provider terms allow it.

## Sources checked 2026-10-12

- [Mapbox Matrix API pricing](https://www.mapbox.com/pricing)
- [Mapbox Matrix API element billing and request limits](https://docs.mapbox.com/api/navigation/matrix/)
- [Google Maps Platform pricing](https://developers.google.com/maps/billing-and-pricing/pricing)
- [Google Compute Route Matrix limits](https://developers.google.com/maps/documentation/routes/compute_route_matrix)
- [OSRM Table service documentation](https://project-osrm.org/docs/v26.5.0/http#table-service)
- [OSRM demo server usage policy](https://github.com/Project-OSRM/osrm-backend/wiki/Api-usage-policy)
