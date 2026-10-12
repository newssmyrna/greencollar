# GreenCollar current status

**Status date:** 12 October 2026  
**Scope:** repository source and recorded deployment evidence. This is not a live Cloudflare or device inspection.

| Area | Implemented in source | Automated checks | Deployed / integration status | Next blocker |
|---|---|---|---|---|
| Mobile app | Expo / React Native app; Clerk sign-in; saved business/customer/day adapters; local timer; recurrence and day summary; local invoice draft review | App typecheck and tests pass in GitHub Actions | Native sign-in and device behavior not verified | Finish real service forms and device acceptance |
| Authentication and API | Clerk JWT verification; Cloudflare Worker business, customer, day, and visit source; tenant membership checks | Worker typecheck and tests pass in GitHub Actions | Last recorded report says production Worker is health-only; no fresh deployment inspection here | Verify production issuer/audience/JWKS and authenticated routes |
| D1 data | Committed Cloudflare migrations and tenant-aware query source | Source checks pass | Hosted recurring tables were last reported with a minimal schema that differs from migrations | Run the staging reconciliation in [the D1 runbook](../cloudflare/docs/STAGING-D1-RECONCILIATION.md); no live schema inspection has been recorded |
| Planning and routing | Recurrence, saved-day summaries, planning domain, and road-matrix adapter | Unit tests pass | App Planner remains a synthetic workload preview; no routing provider is activated | Connect approved real road data and constraints |
| Timer reliability | Local timer source in `main`; open PR adds saved visit identity, retry safety, and overwrite protection | Latest PR #10 checks pass | No device/offline acceptance | Review and merge PR #10, then test on device |
| Visit/customer validation | Existing Worker source; open PR adds malformed-payload handling, active/due recurrence checks, and state-transition tests | Latest PR #11 checks pass | No live endpoint or D1 test | Review PR #11 after PR #10; validate against staging |
| Customer profiles | Tenant-scoped customer API supports create/list/update; PR #14 adds saved contact-profile create/edit UI | App and Worker checks pass on PR #14 | No live endpoint or D1 test | Extend saved records with site locations and service agreements |
| Locations and agreements | PR #15 adds tenant-scoped location/agreement APIs; PR #16 adds mobile setup forms; PR #17 adds pause/resume; PR #18 applies migrations locally and checks API query columns in CI | PR #17 and PR #18 CI pass | No live D1 schema, authenticated endpoint, or device test | Reconcile actual D1 in staging and run device acceptance |
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
7. Review PR #18 for the local D1 schema gate after PR #17.
8. Reconcile the actual D1 schema and migration history in staging before using these routes, then run mobile device acceptance.
9. Use the staging runbook in PR #19 to record the target UUID, schema/history comparison, recovery point, and smoke-test evidence. Applying any migration remains gated on the verified staging target and reviewed diff.
