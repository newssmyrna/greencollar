# Recurring services → daily workday planner

The pure TypeScript adapter `src/domain/daily-workflow.ts` connects recurring service agreements with the existing baseline scheduler.

Inputs: operator-local ISO date, service agreements, optional extra jobs, completed/skipped visit IDs, working hours, job cap, start/end depot and a precomputed drive-time matrix.

Outputs: selected ordered visits with predicted start/finish times, projected revenue and driving minutes, due count, handled count, and an explicit list of recurring visits that could not fit.

**Important limits:** The planning adapter remains a greedy baseline and requires a travel matrix; synthetic matrices are development-only. It does not provide real-road routing, optimize a route or send customer updates. The authenticated day endpoint supplies saved business records, and Today derives the visible queue from those records.

Do not schedule a visit twice. Do not silently drop visits that cannot fit. The operator reviews and approves the saved work order before starting a scheduled visit. Approval is saved in secure device storage for the signed-in operator and bound to the business, local date, visit order and estimate snapshot. The latest approved queue replaces that operator’s previous local approval; a queue change requires a fresh approval. Approval is device-local and does not sync across devices.

The review branch includes authenticated tenant-scoped completion and skip writes. Today asks for confirmation before skipping a visit, refreshes saved data after the write, and protects completed or active visits from skip transitions. These changes remain unmerged and undeployed.

## Operator-controlled queue order

Today provides numbered visits, Move earlier / Move later controls, and Restore saved order. This changes the visible work queue and approval snapshot; it does not calculate a road route, arrival times, or change saved appointment times.

The latest chosen order is saved in secure device storage for each signed-in operator and matches only its business and local date. Restarting restores that order against the latest authorized due visits. A different business/date uses the saved default order unless it matches the operator’s latest stored choice; a later saved choice replaces the previous record. It does not sync across devices. Refreshes retain the relative order of remaining due visits, remove completed/skipped visits, and append newly due visits in source order. No visit is invented or silently removed.

Order editing is disabled during active/paused work, loading, skipping, approval checking/saving, and order restoration/saving. Approval and saved-work start remain disabled until order restoration succeeds. Read failures offer a retry; failed writes leave the previous visible order unchanged. Restore saved order writes the current source order securely before applying it. A changed order cannot use an approval for a different snapshot. The approval dialog includes the actual numbered visit order; stale approval callbacks cannot mark a changed queue as approved. An exact previously approved snapshot may be restored by the existing secure-approval mechanism.

### Acceptance evidence and remaining verification

Task: GC-DURABLE-QUEUE-ORDER-20261012. Prepared branch: `codex/phase-durable-work-queue-order`; source base: `7f79f40360fe5a162a92522343e080cfaad7c4a9` (PR #43). Changes remain review-only until merged and deployed.

The six prior ordering tests remain. Eight additional synthetic storage tests passed locally on 2026-10-12 for reload restoration, hashed-record privacy, scope separation, current-visit reconciliation, invalid records, restoring default order, storage failures, input/size limits, and matching approval restoration. Stored records contain SHA-256 hashes and date only, with a 2,000-character bound (ASCII in the native adapter); oversized writes reject before storage without truncating the queue. Full app/Worker CI evidence is tracked on the branch PR. This is self-review, not independent QA.

Phone acceptance remains pending: reorder and approve, verify the dialog order, attempt edits while a timer is active/paused, complete/skip and refresh, test new due visits and context switches, verify chosen order and matching approval after restart, exercise failed reads/writes and retry, and test screen-reader labels/touch targets. No routing provider, messages, billing, or production data is affected.

## Protected timer handoff

Starting a new saved or demo job cannot replace running/paused work or an unsaved completed saved visit. The start handler uses the current timer reference to protect repeated taps before a render. A completed demo or a saved completion can proceed to the next job.

After restart, a saved completion is recognized only when the authorized day data matches agreement ID, scheduled date, completed status, and actual minutes. The operator can load a restored completed visit's original workday, including an earlier date, to save or confirm it. The work-queue heading shows the loaded date explicitly. A duration mismatch remains unresolved and must not silently discard the local record.

Timer restore errors keep controls gated and expose a retry. Operator changes clear the saved-completion flag; an outdated completion response cannot mark a different current session as saved. This does not establish reliable offline server writes or correct all timer persistence races.

Task: GC-TIMER-HANDOFF-20261012. Branch: `codex/phase-protected-timer-handoff`; source base: `77280ed93b9af12eaacdaf4d6157392cc5799532` (PR #44). Prepared/self-reviewed; unmerged and undeployed. Six new synthetic tests passed locally for active/paused replacement guards, unsaved completion protection, saved/demo transitions, exact server evidence, and calendar-safe prior-date recovery. Full CI evidence belongs to this branch PR.

Phone acceptance remains pending: rapid start taps, completed-but-unsaved protection, restart with prior-day completion, failed timer reads/retry, sign-out during completion save, and matching/mismatched server duration. Next owner: reviewer checks preservation and device tester runs these scenarios; release coordinator handles the stacked chain.

## Ordered timer storage and restore validation

Timer writes and deletions run in invocation order for each operator. A later save cannot be overwritten by an older pending write. Loads wait for all currently queued writes; one write failure is reported to its caller and does not prevent a later queued save. Serialization snapshots the input before waiting. Different operators have independent queues.

Valid existing timer records keep their standard `greencollar_timer_<operator>` keys. Operator IDs must match the existing safe alphabet and 1–80 character length; unsupported IDs reject rather than normalize/truncate into another operator's key. No data migration or silent deletion occurs.

Only a missing record restores as no timer. Invalid JSON, blank IDs, negative or unsafe numbers, future dates relative to the device clock, contradictory state fields, and elapsed values exceeding the possible wall-clock interval reject restoration. The original record remains untouched and the previous phase's restore gate keeps work disabled. Restore errors expose the reason and retry path. If a device clock has moved backward, correct it before retrying.

Task: GC-TIMER-STORAGE-20261012. Branch: `codex/phase-ordered-timer-storage`; source base: `5f51d2936620abb5f81a980281a22fcf96b76f40` (PR #45). Prepared and self-reviewed; unmerged and undeployed. Nine synthetic tests cover record compatibility, invalid records, FIFO save/load/delete, a write arriving during a pending read, failure recovery, operator separation, snapshot preservation, and no overwrites on invalid input. CI evidence is recorded on the branch PR.

Device acceptance remains pending for rapid timer transitions, background/restart during writes, storage failures, and clock changes. This serializes one process's device writes; it does not create offline completion sync, cross-device locking, or a full timer correction workflow. Next owner/action: reviewer checks storage compatibility and preservation; device tester exercises these cases; release coordinator handles the stacked chain.

Next: real-device acceptance for the review, start, completion and skip flow, including secure approval restore after app restart. Server-synced approvals, real road travel, owner-controlled replanning and customer updates remain future integrations.

## Confirm timer transitions before displaying them

Task: GC-DURABLE-TIMER-TRANSITION-20261012. Prepared branch: `codex/phase-durable-timer-transitions`; base: PR #46 at `65994b2454dc4e3226b490422333279e1b631eac`. Delivery: PREPARED; self-review; no merge or deployment.

Start, pause, resume and complete now await the secure device write before applying the new displayed timer. The previous effect-driven save is removed, including redundant saves on restoration. A synchronous guard blocks repeated timer actions while the write is pending; timer controls, completion submission, skip and queue editing are disabled during the save.

Save failures leave the previous displayed record in place and invalidate timer readiness. The operator must use Retry restoring job timer to reconcile with device storage before continuing. This also handles a native write that may have committed before reporting failure: the UI does not assume either outcome. A changed operator or session suppresses late successful results. Device persistence does not mean server completion or billing succeeded.

Five focused synthetic tests cover save-before-display, repeated taps, failures and subsequent recovery, late results after context changes, and immutable transition snapshots. Full CI evidence is recorded on the PR. iOS/Android acceptance remains pending: slow and failed native saves for each action, repeated taps, sign-out during save, failure after a native write commits, restart during save, and completion submission gating. No schema, hosted data, provider calls or production pages changed.

## Foreground elapsed-time display

Task: GC-TIMER-DISPLAY-20261012. Branch: `codex/phase-foreground-timer-display`; source base: `bf86e34ac0037a1ac83c37fd8b391cc344812131` (existing PR #47). Prepared/self-reviewed; unmerged and undeployed.

A running timer refreshes once per second only while Today is visible and the app is foregrounded. Returning to Today or foreground immediately recomputes elapsed time from the recorded timestamps, including time spent away. Paused and completed durations remain fixed. The manual refresh control is retained.

Background/inactive transitions, leaving Today, pausing/completing, and unmounting clean up the interval. Display ticks update only screen time: they do not write storage, change work-session state, submit completion, or affect billing. Invalid/backward running clocks produce a visible error and no fabricated elapsed value rather than throwing during render.

Eight synthetic tests cover timestamp-based running display, paused/completed stability, pause exclusion, invalid clocks without mutation, empty state, foreground/background behavior, interval cleanup, and return after a long gap. Full app/Worker CI evidence is recorded on the PR. Native device acceptance remains pending for app state transitions, outdoor readability, clock changes, and rapid tab changes.

Next owner/action: reviewer verifies UI-only refresh and cleanup; device tester runs those scenarios; release coordinator handles the stacked chain. The existing PR #47 was preserved; this branch adds display behavior only.


## Review completed service duration

A completed saved visit shows its scheduled estimate when the saved workday contains the matching agreement, beside the actual whole minutes recorded by the timer. The operator must explicitly confirm that exact session and workday before the completion write is enabled. Changing operator, timer session, completion timestamp, actual duration or workday invalidates the confirmation. Demo timers need no server confirmation.

This phase does not edit or overwrite timer duration, alter the completion payload, change agreement pricing, or infer billable amounts. A correction workflow requires a separately persisted audit trail and remains future work. The review acknowledgment is in-memory and must be repeated after reopening the app. Device acceptance remains pending.
