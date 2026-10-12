# Invoicing milestone
GreenCollar includes a **pure, zero-cost invoice calculation engine** in `src/domain/invoice.ts`.

- Invoice lines use integer cents and integer quantities; tax is optional and defaults to 0.
- A valid draft can be issued and paid; paid invoices cannot be voided.
- Do not infer taxability, sales-tax rates or collection obligations from a service description.
- The paid transition is a local domain action and is **not proof that money arrived**.
- Review-only tenant-scoped draft storage and its additive D1 migration are prepared in PR #55; neither is deployed/applied. Invoice issuing, email delivery, payment links, accounting export, Stripe and billing providers remain unconnected.
- Real invoices require an authenticated, tenant-scoped persistence flow and explicit owner confirmation before sending or recording payment.
