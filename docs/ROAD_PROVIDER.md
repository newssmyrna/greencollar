# Routing provider integration (not live)
`cloudflare/src/road-provider.ts` includes a network adapter for a server-configured OSRM-compatible **HTTPS** table service. It validates point count, geographic coordinates, response dimensions, returned durations, and 8-second timeout. Unreachable roads remain `null`.

This is **not yet activated**. No provider hostname, subscription, key, or usage cost is configured. Do not call the adapter from an unauthenticated or unmetered endpoint. Before integration: select a provider with a suitable commercial use policy; assess location data disclosure/consent, provider rate limits, cost caps and caching policy; add authorization and per-account quotas; map response into the mobile planning workflow. Do not expose the provider's key in the mobile app.


## Provider decision screen — 2026-10-13

**Decision status:** no provider selected; no provider account, hostname, credential, or API request is configured. This is a technical and commercial-readiness screen from current public vendor documentation. Recheck prices and terms before procurement.

### Current GreenCollar integration seam

`cloudflare/src/road-provider.ts` is an optional server-side adapter for an OSRM-compatible HTTPS table endpoint. It accepts 2–25 unique latitude/longitude points and expects a square `durations` matrix in seconds, with `null` for unreachable pairs. It builds an OSRM `/table/v1/driving` URL and times out after eight seconds. The helper does not provide tenant authorization, consent, a provider credential, metering, or budget enforcement. No Worker route calls it.

### Shortlist

| Path | Current fit | Usage and commercial gate | Adapter work |
|---|---|---|---|
| Keep the OSRM-compatible seam | Closest to the existing helper; still requires an operator-selected service or operated endpoint. The 25-point limit is GreenCollar's current adapter limit. | No service, price, commercial rights, coverage, retention, or support level has been chosen. | Configure only after provider/service selection; keep its URL and credential server-side. |
| Google Routes Compute Route Matrix | Supports up to 625 elements for ordinary matrix requests; the limit is 100 elements for traffic-aware-optimal or transit requests. | Charged by origin × destination element and SKU. The current global price sheet lists a 10,000-element Essentials free usage cap and $5 per 1,000 elements in its first paid tier; Pro and Enterprise features have different rates. Requires billing and an API key or OAuth token. Daily API quotas are available. Most Routes content has caching restrictions, and map-displayed results must be displayed on a Google Map with attribution. | New adapter: Google returns per-element results that must be validated and assembled into GreenCollar's ordered square matrix. |
| Mapbox Matrix API | Standard driving matrix supports 25 coordinates/625 elements; driving-traffic supports 10 coordinates/100 elements. It returns travel-time/distance matrices, not route geometry. | Billed by matrix element. The current public page lists up to 100,000 monthly elements free, then $2 per 1,000 in the first paid tier, with lower rates at higher tiers. Mapbox says a Commercial Application License is required for non-production and production vehicle usage; it includes an annual subscription and may include a per-user or seat component. Obtain written confirmation and a quote for GreenCollar's intended crew workflow. | The duration response resembles the current matrix shape, but the URL, token handling, provider-specific limits, and configuration require a distinct adapter. |

Public references checked 2026-10-13:

- [Google Routes API usage and billing](https://developers.google.com/maps/documentation/routes/usage-and-billing)
- [Google Maps Platform pricing](https://developers.google.com/maps/billing-and-pricing/pricing)
- [Google Routes API policies and attribution](https://developers.google.com/maps/documentation/routes/policies)
- [Mapbox Matrix API](https://docs.mapbox.com/api/navigation/matrix/)
- [Mapbox pricing](https://www.mapbox.com/pricing)
- [Mapbox commercial application licensing](https://www.mapbox.com/pricing#licensing)
- [Cloudflare Workers Rate Limiting](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/)

### Usage estimate and activation gates

For a full square matrix with `N` stops, billable elements are generally `N × N`; at GreenCollar's current 25-point limit, one full matrix is up to 625 elements. Estimate monthly volume by summing matrix elements across all planning sessions, businesses, refreshes, and retries. A per-request price alone is not a safe monthly budget.

#### Edgewater pilot volume (owner input, 2026-10-13)

Pilot area: Edgewater, Florida. Expected workload: 10 stops per day.

| Matrix points included in one daily plan | Elements per full matrix | 22 planning days/month | 30 planning days/month | With one additional full rerun each day |
|---|---:|---:|---:|---:|
| 10 visit stops | 100 | 2,200 | 3,000 | 4,400 / 6,000 |
| 10 visit stops plus start and end depots | 144 | 3,168 | 4,320 | 6,336 / 8,640 |

Assumptions: one business/crew and one full square matrix per planning run; “22” and “30” are alternative operating-day counts, not a claim about the schedule. If the starting point or depot is not sent as a matrix node, use the 10-stop row. Additional crews, businesses, planning sessions, retries, or other API usage multiply the estimate. One distinct extra matrix node would make 11² = 121 elements per run.

At 10 stop nodes and one run/day, the estimate is 2,200–3,000 monthly matrix elements. That is below the currently published 10,000-element Google Routes Essentials free usage cap and Mapbox's 100,000 monthly Matrix free tier, assuming no other usage shares the billing account and the request stays in those price categories. This does not establish a zero-dollar project cost: provider features/SKU, shared account usage, account-specific terms, and (for Mapbox vehicle use) the separate commercial license can change the bill. Recheck the rate sheet before enabling calls.

Before enabling a provider:

1. **Set the pilot scope:** initial service area, representative routes to validate, expected active businesses, routes planned per day, typical stop counts, and how often operators refresh or re-run planning.
2. **Set the spend boundary:** monthly provider budget, allowed feature/SKU, expected matrix volume, and an operator who can disable routing spend.
3. **Approve data handling:** decide which customer coordinates may leave GreenCollar, what operator/customer consent is needed, which provider terms apply, and whether any returned data may be cached and for how long.
4. **Confirm the commercial fit:** written/contract terms, coverage, attribution/display rules, retention/caching permissions, service limits, and support expectations for the actual business use.
5. **Add server-side controls:** authenticated tenant-scoped Worker endpoint, provider secret stored only in Cloudflare, durable per-tenant element/spend accounting with a hard deny at the agreed limit, plus rate limiting for bursts. Cloudflare's Worker rate-limiting binding is local to each Cloudflare location, eventually consistent, and explicitly not an accurate accounting system; it cannot alone enforce a global hard spending cap.
6. **Integrate and verify:** provider-specific response mapping, bounded timeout/error behavior, synthetic matrix tests, staging calls with authorized test coordinates, and mobile acceptance for the planning/approval flow. Keep customer/provider calls disabled until those gates pass.

### Phase handoff

Phase #67 completes the provider-readiness screen only. It does not activate routing, settle licensing, approve coordinate disclosure, or change route estimates. The next provider-integration phase needs the pilot-volume, budget, data-handling, and vendor decision above.
