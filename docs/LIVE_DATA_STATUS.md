# Live data integration status — 2026-10-12

## Last recorded live/deployment report

The prior review recorded:

- A separate GreenCollar D1 database with business, membership, customer, location, job, agreement, and visit tables.
- A health-only deployed Worker; authenticated customer/day/visit endpoints were not reported as deployed.
- A minimal hosted recurring-service schema that differs from committed migration definitions.
- No real businesses or customers onboarded.
- No GreenCollar iPhone build or Clerk session tested on-device.
- No road provider activated; the Daily Work Queue is source data, not an optimized driving route.

These are the last recorded observations, not a fresh production inspection performed during the current changes.

## Repository and CI status

The source includes the Expo app, Clerk integration, Cloudflare Worker endpoint source, local recurrence/day modules, timer persistence, and invoice draft review. GitHub Actions has passed app and Worker checks on the latest reviewed commits.

Open PRs add timer recovery safeguards and stronger customer/visit API validation. Green CI proves only the checked source and tests; it does not prove deployment, live schema compatibility, or device behavior.

## Gates before live customer use

1. Inspect deployed Worker version, environment bindings, and route behavior.
2. Inspect D1 schema and migration history; create and test a reviewed staging reconciliation.
3. Verify Clerk configuration and signed endpoint flows, including tenant isolation and roles.
4. Run mobile/device acceptance for sign-in, timer restore, and offline/poor-network recovery.
5. Connect real road routing only after constraints, costs, provider credentials, and fallbacks are reviewed.
6. Complete durable invoice/payment, messaging, backup, and recovery workflows.

Do not infer production readiness from source files or CI.
