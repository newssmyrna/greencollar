# GreenCollar current status

**Status date:** 12 October 2026  
**Scope:** repository source and recorded deployment evidence. This is not a live Cloudflare or device inspection.

| Area | Implemented in source | Automated checks | Deployed / integration status | Next blocker |
|---|---|---|---|---|
| Mobile app | Expo / React Native app; Clerk sign-in; saved business/customer/day adapters; local timer; recurrence and day summary; local invoice draft review | App typecheck and tests pass in GitHub Actions | Native sign-in and device behavior not verified | Finish real service forms and device acceptance |
| Authentication and API | Clerk JWT verification; Cloudflare Worker business, customer, day, and visit source; tenant membership checks | Worker typecheck and tests pass in GitHub Actions | Last recorded report says production Worker is health-only; no fresh deployment inspection here | Verify production issuer/audience/JWKS and authenticated routes |
| D1 data | Committed Cloudflare migrations and tenant-aware query source | Source checks pass | Hosted recurring tables were last reported with a minimal schema that differs from migrations | Inspect actual schema/history and test an additive reconciliation in staging |
| Planning and routing | Recurrence, saved-day summaries, planning domain, and road-matrix adapter | Unit tests pass | App Planner remains a synthetic workload preview; no routing provider is activated | Connect approved real road data and constraints |
| Timer reliability | Local timer source in `main`; open PR adds saved visit identity, retry safety, and overwrite protection | Latest PR #10 checks pass | No device/offline acceptance | Review and merge PR #10, then test on device |
| Visit/customer validation | Existing Worker source; open PR adds malformed-payload handling, active/due recurrence checks, and state-transition tests | Latest PR #11 checks pass | No live endpoint or D1 test | Review PR #11 after PR #10; validate against staging |
| Customer profiles | Tenant-scoped customer API supports create/list/update; PR #14 adds saved contact-profile create/edit UI | App and Worker checks pass on PR #14 | No live endpoint or D1 test | Extend saved records with site locations and service agreements |
| Locations and agreements | PR #15 adds tenant-scoped location and recurring-agreement APIs; PR #16 adds mobile setup forms; PR #17 adds owner/admin pause and resume controls without deleting visit history | CI pending on PR #17 | No live D1 schema, authenticated endpoint, or device test | Reconcile D1 migrations in staging and run device acceptance |
| Billing and messaging | Invoice draft preview and message-related design notes | Domain tests pass where implemented | No durable invoice API, payment reconciliation, SMS delivery, or customer portal | Design and implement durable, consent-safe workflows |

## Release rule

Source presence and green CI are not deployment evidence. Verify the deployed Worker, its environment, live D1 schema, authentication, backups, and mobile behavior before using real customer data.

## Immediate sequence

1. Review and merge PR #10, then PR #11 (stacked on #10).
2. Reconcile D1 schema and migration history in staging.
3. Review and merge PR #13 for reproducible dependency lockfiles and `npm ci`.
4. Review PR #14 for saved customer contact-profile editing.
5. Review PR #15 for location and agreement APIs after PR #14.
6. Review PR #17 for agreement lifecycle controls after PR #16.
7. Reconcile the actual D1 schema and migration history in staging before using these routes, then run mobile device acceptance.
