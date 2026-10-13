# Completed visit → invoice draft

The pure `src/domain/completed-invoice.ts` adapter takes business-scoped day data and builds a **review-only** invoice draft for a completed service, retaining the agreed service price and customer identifier.

Review-only invoice draft storage is prepared in PR #55 and the visit-integrity follow-up is in PR #56. Neither is deployed and neither migration has been applied. Migration 0009 rebuilds the draft table with a composite business/visit foreign key, preserves valid drafts, and fails closed if a draft has no matching visit. SQLite migration tests verify preservation, cross-business rejection, and protection from deleting a linked visit. No invoice is issued, sent, charged, or marked paid, and no payment is verified. Drafts use a unique business/service-visit key to prevent duplicates.

Only completed visits are included. Skipped/due/unknown visits are excluded. Duplicate completed visits in the input are deduplicated. Tax defaults to 0 and must be explicitly configured by the business before issuing.

## Local draft review controls

The review screen can adjust the service price, choose a due date on the service date or 7, 14, or 30 days later, and enter an operator-confirmed tax rate from 0.00% to 100.00%. Calculations use integer cents and basis points. GreenCollar does not determine taxability or supply a jurisdiction rate.

Draft review edits currently remain in app memory until the API and migration are deployed. The prepared owner/admin API persists review-only drafts; no production invoice actions are connected.
