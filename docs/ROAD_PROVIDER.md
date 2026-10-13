# Routing provider integration (inactive)
`cloudflare/src/road-provider.ts` retains the legacy OSRM-compatible adapter and includes a Google Routes Compute Route Matrix adapter. The Google adapter sends coordinates only, validates the complete indexed matrix within a response byte limit, uses an 8-second timeout, and preserves unreachable roads as `null`.

This is **not activated**. Google Routes API Compute Route Matrix Essentials is selected for the Edgewater pilot. Calls remain disabled unless server configuration, a fresh rate review, public GreenCollar Terms/Privacy URLs, admin enablement, current operator notice acknowledgment, and the D1 spend meter all pass. No Google project, billing account, key, provider call, or production usage is configured. The D1 migration is committed for review and has not been applied. Keep Google's credential server-side; never put it in the mobile app.

**Public-policy gate detail:** `ROAD_ROUTING_POLICY_PUBLIC=true` is a future operator attestation. The Worker checks that configured Terms/Privacy URLs use HTTPS, but it does not fetch those pages or review their contents. Before setting the flag, confirm the pages are publicly reachable and the disclosure has been reviewed. This flag and all provider settings are currently unset.


## Edgewater pilot provider decision — 2026-10-13

**Selected provider:** Google Routes API, **Compute Route Matrix Essentials**. Pilot use is limited to ordinary `DRIVE` mode with `TRAFFIC_UNAWARE` routing for transient travel-time estimates. This is a documented selection, not an active account or API integration.

The selection favors a published Essentials unit price that can be budgeted for this workload and avoids Mapbox's separate commercial vehicle-use license, which requires an annual subscription and may have a per-user/seat component. GreenCollar's legacy OSRM-compatible helper cannot call Google directly; a dedicated Google adapter and response mapper are now staged in the Worker. Before use, verify the current Google account agreement and price sheet.

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

Provider selection, the pilot volume ceiling, and the privacy/spend policy are defined. At Phase #67, no Google account/project, API key, billing configuration, provider request, code integration, live public policy page, or deployment existed. Phase #68 stages the secure adapter, atomic element meter, authorization/notice gates, response validation, and tests; mobile integration and actual Edgewater acceptance remain planned.


### Phase #68 handoff — server controls staged, routing inactive

| Feature / functionality | Phase completion | Impact |
|---|---:|---|
| Coordinate-only Google matrix adapter and bounded response validation | 100% | Testing only; server code staged |
| Pacific billing-month meter and $120 / 19,500-element atomic stop | 100% | Testing only; migration unapplied |
| Tenant roles, admin activation, operator notice, and public-policy gates | 100% | Testing only; disabled without configuration |
| Ephemeral result response, attribution, and manual fallback | 100% | Testing only; mobile app unchanged |
| Public Terms/Privacy pages and operator-facing app flow | 0% | Planned; no domain yet |
| Google account/key/billing, database apply, activation, and deployment | 0% | Not configured or performed |

**Phase completion: 100% of server-side integration controls; 0% live routing.** Approximate active implementation and offline verification time: 15 minutes; CI wait excluded.

Changed paths: Worker auth/router/provider/meter/API, `cloudflare/migrations/0010_routing_provider_controls.sql`, four routing tests, and this handoff plus `docs/DAILY_WORKFLOW.md`.

Page/post impact: live pages/posts **none**; planned **future public Terms/Privacy pages and the in-app notice/manual fallback**; documentation-only **provider policy and handoff**; testing-only **mocked provider/D1 paths and synthetic coordinates**. No real coordinates or provider calls were used. No account, secret, billing setup, database migration, production setting, or deployment was created.

Remaining acceptance: review D1 `RETURNING` support and apply the migration only in an approved non-production test database later; add the mobile notice/attribution/manual workflow and validate actual truck/depot operations after the domain and provider signup are ready.


## Mobile readiness controls (Phase #69)

The Today screen can read the routing settings endpoint and display server-confirmed policy/provider/business readiness. It shows the Terms and Privacy URLs only when the Worker attests those HTTPS pages are public. An operator must explicitly acknowledge the current notice; the acknowledgment is scoped to that signed-in subject, business, and notice version. Only an owner/admin can enable or disable the business setting, enforced again by the Worker.

The readiness screen makes no matrix request and sends no coordinates. It leaves the operator-entered manual travel estimates and their device-local storage unchanged. The effective enabled state reports when both provider configuration and the business toggle pass; the stored business toggle is reported separately so an admin can disable it if provider configuration becomes unavailable. The notice acknowledgment is specific to the current operator. If settings cannot be read, the app keeps manual travel available and displays a fallback error.

The mobile app still has no route-matrix action, no route result display, and no route-result persistence. Before adding those, define stop assignment across the six-person / three-truck pilot and clarify the stated 10 stops/day as a total or per-truck count. Confirm the per-request cost model against that stop allocation before enabling paid requests.


## Phase 70 — temporary preview UX

The mobile app stages a transient three-truck assignment and per-truck drive-time preview on Today. Every due stop must have an explicit truck assignment and valid saved coordinates. The UI displays the matrix element count before its confirmation step. Each request refetches settings; the Worker applies its independent monthly element and spend limits. Point IDs are ephemeral indexes, and the request contains only point IDs and saved coordinates. No customer or employee details are included.

The result covers adjacent stops in the visible manually chosen order only. There is no depot leg, optimization, arrival-time projection, persistence, or connection to manual travel estimates or queue approval. Empty/single-stop trucks do not call the provider. This is staged in PR #70 and not deployed. Provider calls were not made in development or tests. Keep the integration disabled until the business signs up and the previously defined policy, provider, pricing, consent, and budget gates are deliberately configured.
