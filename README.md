# GreenCollar 🌱

**Your business. On autopilot.**

Mobile-first operating software for on-site service businesses across industries.

## Mission and scaling direction

Complete, verify and scale the existing GreenCollar platform under **one GreenCollar brand**. Scale adoption, active businesses, retention, revenue and operating capacity while preserving the agreed product workflow.

This project is not a multi-brand or city-site rollout. Growth does not authorize additional platforms, parallel products, new feature families or industry-specific forks. Industry templates and configuration should use the shared core. Tenant separation protects each business's records; it does not create separate brands.

Prioritize a reliable integrated product, successful operator onboarding, measurable customer value and sustainable costs. Improve existing capabilities where evidence identifies a gap. Record broader ideas for owner review rather than quietly expanding scope.

**Working brand:** GreenCollar. The historical GrnCollar fallback and proposed NSB Technology Group umbrella are not instructions to rename or launch another brand.

## Product workflow

1. **Set up business and customers:** services, locations, contacts, preferences, rates, schedules, vehicles and equipment.
2. **Plan the workday:** working hours or job cap, fixed appointments and flexible constraints.
3. **Generate and approve the route:** eligible visits, duration estimates, real-road travel, fuel and projected finish.
4. **Navigate and notify:** directions, customer details and optional consent-based ETA messages.
5. **Perform and track:** GPS-assisted arrival, manual timer controls, notes and photos.
6. **Complete and bill:** confirmed completion, operator-approved updates, accurate invoices and secure payment links.
7. **Learn and replan:** compare estimates with actual work and request approval for material changes.

The operator enters information once, approves the plan and focuses on work. GreenCollar minimizes repetitive administration. It serves on-site service businesses broadly, not only lawn care. See [the full workflow](docs/WORKFLOW.md).

## Fifteen-role operating index

Adapted from the [News Smyrna fifteen-role index](https://github.com/newssmyrna/news-smyrna/blob/main/docs/project-tracking/roles/README.md). Keep the same role names and ownership discipline; responsibilities below are specific to GreenCollar.

| Role | GreenCollar responsibility | Expected output |
| --- | --- | --- |
| SWITCH | Coordinate priorities, bounded assignments, dependencies, review, merges and authorized releases. Protect the existing platform scope. | Ordered work, clear owners, release decisions and exact delivery evidence. |
| LEDGER | Maintain the documentation index, task records, decisions, artifact pointers, dependencies and capability status. | A trustworthy record of what exists, what is verified and the next action. |
| INK | Design mobile screens, interaction specifications, reusable visual assets and launch/support materials. | Reviewable assets and responsive, accessible specifications using the shared design system. |
| PROOF | Audit acceptance criteria, regression behavior, tenant isolation and the complete operator workflow. | Reproducible defects, actual test evidence and retest results. Independent QA requires a separate reviewer. |
| LANTERN | Research operator needs, service-business workflows, constraints and authoritative provider information. | Dated evidence that informs existing product requirements; assumptions and unanswered questions remain explicit. |
| FORK | Curate business/service templates, sample data and import mappings; reconcile duplicates, units, prices and source metadata. | Validated catalogs and synthetic fixtures with stable IDs and preserved records. No invented customer facts or prices. |
| SIGNAL | Own communication requirements, message templates, delivery-state definitions and notification acceptance criteria. | Clear ETA/completion/reminder behavior, consent and opt-out requirements, and delivery evidence. RIVET implements integrations. |
| THREAD | Maintain the single GreenCollar identity, voice, naming, interface consistency and brand approval record. | One coherent brand across app, onboarding, customer-facing views and materials. |
| SPARK | Propose bounded improvements and isolated experiments that reduce friction in the existing workflow. | A specific hypothesis, measurable success criteria and a keep/change/stop recommendation. |
| RIVET | Implement application code, schemas, authentication, integrations, migrations and meaningful automated tests. | Focused code changes with preservation, security and test evidence. |
| INNOVATOR | Improve distinctive, clear presentation of schedules, routes, time, costs and business performance. | Usable information designs grounded in examples, with estimates, actuals and uncertainty clearly separated. |
| LAWYER | Identify legal and policy issues in privacy, location tracking, messaging, billing, terms and provider obligations. | Sourced risk findings, practical mitigations and escalation where specialist advice is needed. Do not claim legal clearance. |
| USER | Apply the original 21-year-old phone-first usability lens alongside the actual service operator's needs. | Task-based findings on setup, outdoor readability, touch targets, one-handed use, interruptions and weak connectivity. |
| ACCOUNTANT | Evaluate subscription economics, provider costs, support burden and engineering/job efficiency without weakening quality. | Explicit assumptions, cost per active business/workflow, margins and scaling thresholds. |
| CONNECTOR | Preflight tools, accounts, credentials, environments, permissions and provider/data connections. | Verified connection readiness and exact blockers, with secrets kept outside GitHub. |

Roles define responsibility, not proof that fifteen people or background agents are running. One coordinating assistant can apply all fifteen perspectives. Its role changes remain self-review and must never be represented as independent QA. Report what each relevant role considered, changed, verified and left blocked; use “not involved” when appropriate.

## Read before work

Start with this README, then read the affected source and relevant documents:

| Area | Existing references |
| --- | --- |
| Product scope and launch gates | [Workflow](docs/WORKFLOW.md), [Roadmap](docs/ROADMAP.md), [Release criteria](docs/RELEASE_CRITERIA.md) |
| Backend and current limitations | [Cloudflare backend](docs/CLOUDFLARE_BACKEND.md), [Live data status](docs/LIVE_DATA_STATUS.md), [Engineering notes](docs/ENGINEERING_NOTES.md) |
| Authentication and onboarding | [Auth integration](docs/AUTH_INTEGRATION.md), [Auth smoke test](docs/AUTH_SMOKE_TEST.md), [Owner onboarding](docs/OWNER_ONBOARDING.md) |
| Daily work and routing | [Daily workflow](docs/DAILY_WORKFLOW.md), [Recurrence](docs/RECURRENCE.md), [Road provider](docs/ROAD_PROVIDER.md) |
| Invoicing | [Invoicing](docs/INVOICING.md), [Completed invoicing](docs/COMPLETED_INVOICING.md), [Invoice review UI](docs/INVOICE_REVIEW_UI.md) |
| Historical technical proposal | [Architecture](docs/ARCHITECTURE.md), [Database setup](docs/DATABASE_SETUP.md) |

Technical documents may describe different development stages. Check current source and relevant verification evidence before claiming readiness. A README update does not deploy software.

## Ownership and work records

SWITCH coordinates the work and release sequence. LEDGER keeps the canonical task/document index. Reuse existing task records; do not create competing queues. Assign each task a bounded scope, acceptance criteria, primary owner and exact next action.

Use focused branches and PRs for implementation. Specialists prepare reviewable changes; SWITCH coordinates merges and authorized production changes. Before editing, refresh the affected source and check for concurrent work. Preserve other contributors' changes.

Use one release reservation for each shared production target. Before an authorized release, inspect and preserve the current version, verify prerequisites, define rollback and record the deployed version and readback evidence.

GitHub is the continuity record. Keep source, decisions, findings and handoffs discoverable there. A handoff remains awaiting pickup until the next owner acknowledges it. Do not claim unattended work without evidence.

### Required handoff

Record task ID, role, scope, acceptance criteria, exact paths, branch/commit/PR, source version and date, dependencies, checks actually performed, unresolved limitations, next owner and exact next action. For data changes, include additions, changes, held records and preservation results.

### Honest status

**Work:** BACKLOG, READY, IN_PROGRESS, REVIEW, CHANGES_REQUESTED, READY_FOR_RELEASE, BLOCKED, DONE.

**Delivery:** RESEARCH_ONLY, PREPARED, MERGED, STAGING_DEPLOYED, STAGING_VERIFIED, LIVE_UNVERIFIED, LIVE_VERIFIED.

A research task can be DONE while its capability remains unbuilt. Tests, screenshots, deployment and real workflow verification are separate evidence. Status changes require an exact version, date and relevant result.

## Quality and preservation rules

- Preserve the agreed seven-step workflow and existing records, stable IDs and history.
- Verify access controls and business data isolation.
- Keep credentials, customer records and private exports outside this public repository.
- Back up affected data privately before migrations and verify tenant isolation, reference integrity and rollback.
- Use synthetic fixtures and isolated environments for write tests.
- Require operator control over material schedule, price, invoice and customer-message decisions.
- Treat location as assistance; provide manual controls and test denied, inaccurate and delayed GPS.
- Verify consent, opt-outs, retries and duplicate prevention before outbound messaging; verify invoice accuracy and payment-event handling before billing.
- Test the affected phone workflow, keyboard/web accessibility where supported, empty/error states, interruptions and offline recovery.
- New spending, external outreach, production messages, billing and releases follow the owner's actual authorization. Role assignment alone grants none of these permissions.

The first paid release must deliver the integrated Autopilot workflow described in [Release criteria](docs/RELEASE_CRITERIA.md). Internal milestones can be incremental.

## Scaling acceptance

Growth work stays within the existing platform and one brand. Before increasing usage, establish evidence for:

- Successful onboarding and completion of the operator's full workflow.
- Reliable performance and tenant isolation under representative workloads.
- Capacity, provider quotas, monitoring, recoverable failures and verified backups.
- Retention, time saved and support demand using defined measurements.
- Sustainable cost per business, messaging/routing usage and subscription economics.
- Consistent GreenCollar branding and reusable onboarding/support materials.

Set numeric targets from measured baselines and owner-approved business assumptions. Do not invent adoption, revenue, savings or readiness figures.

## Local development checks

From the repository root:

```bash
npm install
npm test
npm run typecheck
npm run start
```

These commands come from the current app package scripts. Worker checks use its own package/configuration. Run checks appropriate to the changed behavior and record actual results; documentation alone is not test evidence.
