# Invoice draft review screen

The Invoices tab generates client-side drafts from completed visits in the currently loaded, authorized workday response. Users can review the service, customer, and proposed price, and edit that price. No invoices are persisted, sent, collected, or treated as actual receivables. Draft state lasts only for the in-memory mobile session.

The preview defaults to zero tax; operators must verify local tax applicability before invoicing. Generating twice reuses the same visit-derived draft ID in memory. Real duplicate-billing protection must be enforced with a tenant-scoped unique visit reference in D1 before production.

Follow-up: persistent business-scoped invoice API, multi-line editor, dates, authenticated draft review/issue confirmation and separately reconciled payment status.
