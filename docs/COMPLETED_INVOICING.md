# Completed visit → invoice draft

The pure `src/domain/completed-invoice.ts` adapter takes business-scoped day data and builds a **review-only** invoice draft for a completed service, retaining the agreed service price and customer identifier.

No invoice is sent, saved, numbered on a production sequence, or charged. No payment is verified. To avoid double billing in production, implement tenant-scoped persisted invoices with a unique service-visit reference and operator review before issuing.

Only completed visits are included. Skipped/due/unknown visits are excluded. Duplicate completed visits in the input are deduplicated. Tax defaults to 0 and must be explicitly configured by the business before issuing.
