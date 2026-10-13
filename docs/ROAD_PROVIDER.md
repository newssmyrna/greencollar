# Routing provider integration (not live)
`cloudflare/src/road-provider.ts` includes a network adapter for a server-configured OSRM-compatible **HTTPS** table service. It validates point count, geographic coordinates, response dimensions, returned durations, and 8-second timeout. Unreachable roads remain `null`.

This is **not yet activated**. Google Routes API Compute Route Matrix Essentials is selected for the Edgewater pilot, but no Google project, billing account, key, provider call, or production usage is configured. Do not call the adapter until the public GreenCollar Terms of Use and Privacy Policy are available on the future domain, the coordinate notice and authorization gates are implemented, and the hard monthly element meter is tested. Keep Google's credential server-side; never put it in the mobile app.


## Edgewater pilot provider decision — 2026-10-13

**Selected provider:** Google Routes API, **Compute Route Matrix Essentials**. Pilot use is limited to ordinary `DRIVE` mode with `TRAFFIC_UNAWARE` routing for transient travel-time estimates. This is a documented selection, not an active account or API integration.

The selection favors a published Essentials unit price that can be budgeted for this workload and avoids Mapbox's separate commercial vehicle-use license, which requires an annual subscription and may have a per-user/seat component. GreenCollar's existing OSRM-compatible helper cannot call Google directly: a server-side Google adapter and response mapper still need implementation. Before use, verify the current Google account agreement and price sheet.

**Vehicle scope:** the selected route profile is a standard driving estimate. It does not model truck height, weight, axle, hazmat, or other commercial-vehicle restrictions. If any of the three trucks requires those constraints, keep that route manual and reassess the provider/SKU before activation.

### Pilot operating assumptions

- Service area: Edgewater, Florida.
- Owner's stated expected work: 10 stops per operating day; 5 operating days per week; 6 people and 3 trucks (modeled as two people per truck).
- For a conservative spend ceiling, size the meter for **up to 10 stops per truck per day (30 stops total)**. This is a budgeting ceiling, not a change to the stated 10-stop daily expectation.
- Each truck plan includes a start and an end point. Actual depot coordinates are not yet set; this model counts two endpoint slots per truck.
- One initial matrix per truck plus one complete rerun of all three trucks on each operating day.
- Five workdays per week average about 22 operating days per month.

| Workload calculation | Elements |
|---|---:|
| One truck: 10 stops + start + end = 12 points; 12 × 12 | 144 |
| Three truck plans per daily pass: 3 × 144 | 432/day |
| One full rerun: 432 × 2 | 864/operating day |
| Monthly ceiling forecast: 864 × 22 | 19,008/month |
| Hard monthly allowance | **19,500 elements/month** |
| Remaining model headroom | 492 elements/month |

If the 10 stops/day are the total for all three trucks, actual use should fall below this ceiling. Additional plans, partial reruns, retries, or extra customer accounts all consume the same element allowance. The backend meter must count every requested origin × destination cell before dispatch, reserve it atomically, and conservatively keep the reservation for timeouts or ambiguous failures.

### Monthly routing spend policy

**Recommended hard boundary: $120 per calendar month for Google Routes matrix usage, before tax.** This is a pilot provider-usage limit, separate from Cloudflare hosting and other GreenCollar infrastructure. Keep the Google project dedicated to this route-matrix pilot. Do not enable other Google Maps APIs in that project.

At the current published Essentials rate, the first paid tier is $5 per 1,000 elements after a 10,000-element free monthly usage cap. At the 19,500-element hard meter, the no-free-usage upper estimate is $97.50 before tax; if the free cap is available, charges may be lower. The $120 boundary leaves $22.50 of pre-tax headroom at the current Essentials rate. Google aggregates usage for a service across projects on the customer billing account, so do not assume this GreenCollar project receives all of the free allowance.

**Enforcement policy:**

1. Maintain a durable, atomic monthly ledger for the dedicated project. Before a provider call, reserve its origin × destination elements and the no-free-credit estimated list-price exposure. Reject new calls when either 19,500 elements or $120 estimated pre-tax provider usage is reached, whichever comes first, or whenever the meter is unavailable. At the current $5/1,000 rate, $120 is $0.005 per element and the 19,500-element stop is tighter: $97.50 worst-case before tax.
2. Count retries, timeouts, and incomplete/ambiguous calls conservatively. Do not refund reserved elements or estimated cost unless billing evidence confirms the request was not metered.
3. At either limit, fall back to manual travel-time entry. No background retries or new calls after the monthly stop. Reset the ledger at the next calendar month after reconciling provider usage.
4. Add Google Cloud Billing alert-only thresholds at $60 (50%), $96 (80%), and $120 (100%). Alerts are useful signals, not the hard cap: Google's current spend-cap eligibility list does not include the Routes API, and its alerts-only budgets do not automatically block usage.
5. Keep the Routes API quota as a secondary traffic safeguard. The application ledger remains the spend gate. Check the current price before activation and each monthly reset; update the price version in the meter, reprice and reapprove before changing SKU/features, and fail closed if the configured rate is stale or the provider returns a different SKU. Do not silently use Pro or Enterprise.
6. The selected meter is scoped to the Essentials SKU at the current $5/1,000 rate. It does not authorize traffic-aware features, truck-specific routing, route optimization, geocoding, map loads, or other billable APIs.

### Location and provider-data policy

This is an internal operating-policy draft for product implementation, not legal approval or a published GreenCollar notice.

- **Purpose and trigger:** calculate estimated driving durations for a signed-in operator's workday plan. Make a provider request only after the operator deliberately selects “calculate/refresh drive times” and the business administrator has enabled routing and acknowledged the location-data notice. Do not continuously track a person, phone, or truck.
- **Data sent:** send only the manually selected job coordinates and configured/selected dispatch start/end coordinates needed for the matrix. Do not send customer names, contact details, customer or job IDs, service notes, employee names/IDs, or device GPS.
- **Notice and consent:** before the first request and when the notice changes, explain that selected coordinates are sent to Google for route-duration calculation. The public GreenCollar Privacy Policy must say this plainly and link Google's current Terms of Service and Privacy Policy. No public domain exists yet, so keep the provider disabled until those pages are publicly accessible.
- **Authorization and credential:** require a signed-in authorized operator and tenant-scoped server endpoint. Keep the API key in a Cloudflare Worker secret, restrict it to the Routes API, and never return it to the app.
- **Retention and caching:** do not log request coordinates, response bodies, coordinate-bearing URLs, or keys. Use the returned matrix in memory for the active planning request and discard it afterward. Do not persist/cache the raw matrix or derived Google durations in the database, device storage, queue approval snapshot, or analytics unless the then-current Google agreement expressly permits it. Existing saved approval data must exclude provider-derived route values before launch. Keep only aggregate monthly element counts for spend control; no coordinates in the meter.
- **Display:** show Google Maps attribution with provider-derived durations. If a map is added, show Routes results on a Google Map and follow Google's attribution rules. If public terms, privacy notice, attribution, authorization, or coordinate notice is missing, do not call Google; offer the existing manual travel-time workflow instead.

### Provider screen and references

Google Routes Compute Route Matrix Essentials is the selected fit for a basic duration matrix: requests are billed by origin × destination element, ordinary non-transit requests support up to 625 elements, and the current global pricing list shows a 10,000 monthly free usage cap followed by $5 per 1,000 elements in the first paid tier. The Edgewater matrix size (144 elements per truck) is below the ordinary request maximum. Do not use `TRAFFIC_AWARE` or `TRAFFIC_AWARE_OPTIMAL` without a separate Pro-cost decision.

Mapbox remains unselected. Its public terms require a separate commercial application license for vehicle use, with an annual subscription and possible user/seat component; obtain a written quote before reconsidering it.

Official sources checked 2026-10-13:

- [Google Routes API usage and billing](https://developers.google.com/maps/documentation/routes/usage-and-billing)
- [Google Routes matrix request limits](https://developers.google.com/maps/documentation/routes/compute_route_matrix)
- [Google Maps Platform current global pricing list](https://developers.google.com/maps/billing-and-pricing/pricing)
- [Google Routes API policies, public ToU/privacy and attribution](https://developers.google.com/maps/documentation/routes/policies)
- [Google Cloud Billing budgets and alerts](https://cloud.google.com/billing/docs/how-to/budgets)
- [Google Cloud spend-cap eligible services](https://cloud.google.com/billing/docs/how-to/budgets-spend-caps)
- [Mapbox vehicle-use licensing and pricing](https://www.mapbox.com/pricing)

### Phase #67 handoff

Provider selection, the pilot volume ceiling, and the privacy/spend policy are defined. The integration is still **inactive**: no Google account/project, API key, billing configuration, provider request, code integration, live public policy page, or deployment was created. The next implementation must deliver the secure adapter, atomic element meter, authorization/notice gates, response validation, tests, and mobile/manual fallback, then run acceptance on the actual Edgewater workflow.
