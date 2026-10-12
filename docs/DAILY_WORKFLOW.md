# Recurring services → daily workday planner

The pure TypeScript adapter `src/domain/daily-workflow.ts` connects recurring service agreements with the existing baseline scheduler.

Inputs: operator-local ISO date, service agreements, optional extra jobs, completed/skipped visit IDs, working hours, job cap, start/end depot and a precomputed drive-time matrix.

Outputs: selected ordered visits with predicted start/finish times, projected revenue and driving minutes, due count, handled count, and an explicit list of recurring visits that could not fit.

**Important limits:** The planning adapter remains a greedy baseline and requires a travel matrix; synthetic matrices are development-only. It does not provide real-road routing, optimize a route or send customer updates. The authenticated day endpoint supplies saved business records, and Today derives the visible queue from those records.

Do not schedule a visit twice. Do not silently drop visits that cannot fit. The operator reviews and approves the saved work order before starting a scheduled visit. Approval is saved in secure device storage for the signed-in operator and bound to the business, local date, visit order and estimate snapshot. The latest approved queue replaces that operator’s previous local approval; a queue change requires a fresh approval. Approval is device-local and does not sync across devices.

The review branch includes authenticated tenant-scoped completion and skip writes. Today asks for confirmation before skipping a visit, refreshes saved data after the write, and protects completed or active visits from skip transitions. These changes remain unmerged and undeployed.

## Operator-controlled queue order

Today provides numbered visits, Move earlier / Move later controls, and Restore saved order. This changes the visible work queue and approval snapshot; it does not calculate a road route, arrival times, or change saved appointment times.

The override is session-local and scoped to the signed-in operator, business, and local date. Switching context discards it; restarting the app restores the authorized saved order. Refreshes retain the relative order of remaining due visits, remove completed/skipped visits, and append newly due visits in source order. No visit is invented or silently removed.

Order editing is disabled during active/paused work, loading, skipping, and approval checking/saving. A changed order cannot use an approval for a different snapshot. The approval dialog includes the actual numbered visit order; stale approval callbacks cannot mark a changed queue as approved. An exact previously approved snapshot may be restored by the existing secure-approval mechanism.

### Acceptance evidence and remaining verification

Task: GC-QUEUE-ORDER-20261012. Prepared branch: `codex/phase-owner-work-queue-order`; source base: `eff7d7884a91e266152691855e33abc107ca55a5`. Changes remain review-only until merged and deployed.

Six synthetic domain tests passed locally on 2026-10-12 for immutable moves, boundary/missing IDs, refresh reconciliation, scope separation, stale/duplicate override IDs, and approval invalidation with unchanged totals. Full app/Worker CI evidence is tracked on the branch PR. This is self-review, not independent QA.

Phone acceptance remains pending: reorder and approve, verify the dialog order, attempt edits while a timer is active/paused, complete/skip and refresh, test new due visits and context switches, verify restored default order after restart, and test screen-reader labels/touch targets. No routing provider, messages, billing, or production data is affected.

Next: real-device acceptance for the review, start, completion and skip flow, including secure approval restore after app restart. Server-synced approvals, real road travel, owner-controlled replanning and customer updates remain future integrations.
