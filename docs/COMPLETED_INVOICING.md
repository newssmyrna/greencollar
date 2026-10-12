# Completed visit → invoice draft

The pure `src/domain/completed-invoice.ts` adapter takes business-scoped day data and builds a **review-only** invoice draft for a completed service, retaining the agreed service price and customer identifier.

No invoice is sent, saved, numbered on a production sequence, or charged. No payment is verified. To avoid double billing in production, implement tenant-scoped persisted invoices with a unique service-visit reference and operator review before issuing.

Only completed visits are included. Skipped/due/unknown visits are excluded. Duplicate completed visits in the input are deduplicated. Tax defaults to 0 and must be explicitly configured by the business before issuing.

## Local draft review controls

The review screen can adjust the service price, choose a due date on the service date or 7, 14, or 30 days later, and enter an operator-confirmed tax rate from 0.00% to 100.00%. Calculations use integer cents and basis points. GreenCollar does not determine taxability or supply a jurisdiction rate.

These drafts and edits remain in app memory only. They are lost when the app closes and are not invoices, accounting entries, payments, or customer communications. Persisted tenant-scoped invoices and unique service-visit references are still required before issuing.
