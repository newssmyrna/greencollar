# Routing provider integration (not live)
`cloudflare/src/road-provider.ts` includes a network adapter for a server-configured OSRM-compatible **HTTPS** table service. It validates point count, geographic coordinates, response dimensions, returned durations, and 8-second timeout. Unreachable roads remain `null`.

This is **not yet activated**. No provider hostname, subscription, key, or usage cost is configured. Do not call the adapter from an unauthenticated or unmetered endpoint. Before integration: select a provider with a suitable commercial use policy; assess location data disclosure/consent, provider rate limits, cost caps and caching policy; add authorization and per-account quotas; map response into the mobile planning workflow. Do not expose the provider's key in the mobile app.
