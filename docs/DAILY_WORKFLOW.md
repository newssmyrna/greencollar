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


## Verify completion acknowledgments

The mobile client treats a visit as saved only when the completion endpoint returns a valid acknowledgment matching the submitted agreement, scheduled date, completed status, and actual minutes. Non-success responses remain errors; malformed or mismatched success responses keep the local timer unsaved and direct the operator to reload the saved workday before retrying. Writes are never automatically repeated. Server readback can reconcile a committed write if its response was lost or malformed.

This response check does not change the tenant-scoped server write or billing snapshot. Device/network interruption and real server readback remain acceptance checks.


## Location history storage scope

Location confirmation index and event keys now accept only operator identifiers containing 1–80 ASCII letters, digits, underscores or hyphens. Standard IDs retain their existing SecureStore key names. Unsupported IDs reject instead of being normalized or truncated into a potentially colliding operator key. Event IDs use the same bounded safe alphabet. Device acceptance should confirm the active identity provider continues to issue IDs in this format.


## Per-visit work notes

Today supports an optional note up to 1,000 characters on a saved service visit. The note is saved with the durable timer record before it is submitted with the completion write. A changed draft must be saved before the timer can be completed. If a device save fails or may have committed despite an error, the timer restore gate requires storage reconciliation before work continues.

The tenant-scoped completion endpoint stores the note on the visit and returns it in the acknowledgment. Today displays saved notes on the loaded workday. Existing records migrate with an empty note; no note is invented or backfilled. Notes remain local until the completion write succeeds and then become part of the business's server-side visit record. Retention, deletion, access review and real-device interruption testing remain release gates.

After a completion response is lost or malformed, local timer recovery accepts server readback only when visit identity, scheduled date, completed state, actual minutes, and work note match the durable local record. Missing or different note evidence does not release the completed timer for the next job. This is reconciliation after an explicit write, not an automatic retry or offline queue.

## Saved queue service-workload review

Task: GC-SAVED-QUEUE-WORKLOAD-20261013. Primary scope: RIVET implementation, PROOF self-review and LEDGER handoff. Source base: PR #57 at `0dc0cd5f981366aa76933a088bdd662424e85db5`. Prepared branch: `codex/phase-saved-queue-workload`. Work: REVIEW; delivery: PREPARED; no deployment.

Today now assesses every remaining saved visit using the queue's current predicted service durations. Operators enter service hours available for the remaining queue, a remaining-visit limit, or both. Blank limits and invalid values prevent approval. Hours accept 0.25–24 with up to two decimal places and count only whole minutes within that budget; the visit limit accepts 1–200.

The assessment reports service minutes and visits above the limits without selecting a subset, removing visits, changing their order, or writing visit status. Completed/skipped visits disappear through the existing authorized day refresh. Workload totals do not assess travel, breaks, fixed appointments, customer time windows, fuel or clock-based finish times. The separate appointment checks below now flag service-only timing conflicts; meeting workload limits is still not a route-feasibility result.

The approval dialog repeats any overrun and keeps the entire numbered queue visible. An over-limit queue requires the explicit **Approve with workload warnings** choice. There is no automatic skip, deferral or schedule write. Approval binds the normalized workload limits alongside the existing business, date, visit order, prices and estimates. A changed limit or remaining queue requires a matching review; an invalid assessment cannot restore or save an approval. Saved-service starts check current approval eligibility in the handler as well as the button.

Workload limits now save explicitly in secure device storage for each operator/business/date and restore when that scope is reopened. They are separate from Planner's sample fields. Approval waits for a successful restoration or confirmed save, and unsaved edits block approval and starting saved work. The matching normalized limits can restore an exact device-saved approval; a legacy approval without workload review cannot approve a limits-bound queue. After completing work, the operator updates and saves the available budget for the remaining visits; the app does not infer wall-clock availability or subtract elapsed work automatically.

Acceptance: all remaining visits are counted; either limit can stand alone; thresholds and malformed inputs are explicit; limit changes invalidate approval; rejected approval writes preserve the prior record; authorized saved-day data and manual order feed the assessment without mutation. Automated evidence and exact commit/PR are recorded in the phase PR.

Paths: `App.tsx`, `src/domain/saved-queue-workload.ts`, `src/domain/saved-queue-review.ts`, `src/data/local-saved-queue-approval.ts`, `tests/saved-queue-workload.test.ts`, and this document. Existing sample Planner behavior is unchanged.

Next owner/action: reviewer verifies the overrun dialog and approval binding. Device tester checks keyboard input, screen-reader labels, changing limits with an open dialog, restart/context reset and completion-refresh behavior on iOS/Android. Release coordination must resolve the stacked PR chain and existing deployment gates. Device testing and independent review remain pending.

## Durable workload settings

Task: GC-DURABLE-WORKLOAD-SETTINGS-20261013. Primary scope: RIVET implementation, PROOF self-review and LEDGER handoff. Source base: PR #58 at `ab780f4e101ad5b6ddf182f30a52e9023615b7bd`. Branch: `codex/phase-durable-workload-settings`. Work: REVIEW; delivery: PREPARED. No merge or deployment.

Each exact signed-in operator, business and local work date has its own device record. Keys and records contain a SHA-256 digest of the scope plus normalized hours/visit limits, without raw operator IDs, business IDs, dates or customer records. Records are versioned and bounded to 512 characters. No cloud synchronization, automatic expiration or server settings endpoint is added.

Today restores limits before approval can be reused. Editing is in-memory until **Save workload limits** succeeds. During saving, controls and approval stay gated; repeated save taps cannot start another write. A scope change clears the displayed values immediately and ignores late restore/save results. Writes already started may finish for their original scope. Storage operations execute in invocation order per scope within this process, while different scopes remain independent.

A missing record starts with blank limits. Read failures and invalid records retain their original stored bytes and show Retry restoring workload limits or Enter replacement limits. Choosing replacement only opens a blank form; it does not overwrite anything until an explicit valid save. A failed write may have committed, so the interface reports an uncertain outcome and requires readback or a new explicit replacement save. There are no silent deletions, automatic retries or invented default limits.

Acceptance: independent scope restoration; optional hours-only/visit-only values; validation before writing; input snapshots and ordered operations; exact approval restoration; unsaved/pending/error states gated; late results ignored; corruption and ambiguous writes recover without silent replacement. Test counts, final commit and CI evidence are recorded on the phase PR.

Paths: `App.tsx`, `src/data/local-saved-queue-workload.ts`, `src/data/local-saved-queue-workload-native.ts`, `src/data/saved-queue-workload-settings.ts`, the two corresponding test files, and this document. Impact: planned Today workload controls, device storage, tests and documentation. No live pages/posts, remote data, billing or messages changed.

Next owner/action: reviewer checks scope isolation, save-before-approval and failure recovery. Device tester verifies iOS/Android SecureStore reads/writes, keyboard input, background/restart during save, operator/date changes, screen-reader announcements, and exact restored approval. Release coordination handles the stacked PR chain and existing release gates. Self-review and synthetic tests do not replace device acceptance.

## Saved queue appointment conflict review

Task: GC-SAVED-QUEUE-APPOINTMENT-REVIEW-20261013. Owner: Codex applying RIVET implementation, PROOF self-review and LEDGER handoff; independent reviewer/device tester pending assignment. Source base: PR #60 at `259f26d43327a98a0b3762a61fba1d30eae4aa49`. Branch: `codex/phase-saved-queue-appointment-review`. Source date: 2026-10-13 UTC. Work: REVIEW; delivery: PREPARED. Exact PR/head, full CI evidence and elapsed time are recorded on the phase PR.

Today now checks the remaining saved visits in their displayed manual order using the current predicted service durations. The check uses one shared local clock and a best-case start at 00:00, with no travel, breaks or actual workday-start input. These assumptions are shown in Today and the approval dialog. It does not generate arrival times or establish an achievable route. Locations in different timezones need separate review; timezone lookup/conversion is not implemented.

The check advances an earliest-possible service clock through the queue. A saved earliest start or fixed start can delay that clock. It flags a fixed start that the preceding service cannot reach, a finish window exceeded by the current estimate/order, or work extending past the local calendar day. After a missed fixed start it never moves the clock backward. Empty and unconstrained queues have explicit descriptions; absence of a warning does not prove the work fits the operator's actual day.

Each warning is shown beside the affected visit, with a summary before approval. Changing order recomputes the check without moving appointment times, skipping visits or writing a schedule. Completed/skipped services are excluded by the existing saved-day summary. New duration history can produce a warning even when the originally configured estimate fitted the saved window.

A conflicting queue remains an operator decision: the confirmation action explicitly says **Approve with appointment warnings**, or **Approve with warnings** when workload overruns also exist. Approval records that review; it does not fix a conflict. Invalid minute fields stop the assessment and block approval restoration/writes. Existing storage is preserved when approval rejects. Workload-limit editing/saving remains independent of malformed appointment fields.

Approval snapshots now use the appointment-review policy version. Earlier approvals require fresh review even with otherwise identical values. After explicit approval, only the same operator, business, date, order, estimates, saved appointment fields and normalized workload limits can restore it. Existing current-snapshot checks reject a dialog approval if its queue changed while the dialog was open.

Acceptance: fixed-overlap and queue-order warnings; earliest-start waiting; finish-window and midnight boundaries; predicted-duration changes; malformed time handling; clear shared-clock/no-travel assumptions; explicit warning action; fresh review for prior policy and changed snapshots; durable matching approval without silent replacement. Local focused verification: 96 tests passed, including 17 added tests and an exhaustive scheduling oracle across 200 bounded synthetic cases. This is source/self-review evidence; it is not independent QA, a device run or live routing evidence.

Paths: `App.tsx`, `src/domain/service-time.ts`, `src/domain/saved-queue-appointments.ts`, `src/domain/saved-queue-review.ts`, `src/data/local-saved-queue-approval.ts`, `tests/saved-queue-appointments.test.ts`, and this document.

Impact: planned Today appointment summary, per-visit warnings and approval dialog; planned device approval eligibility/versioning; testing-only synthetic fixtures/regressions; documentation-only handoff. No new API, schema, migration, provider requests, arrival predictions, automatic reorder, customer messages or billing behavior. No live pages/posts or production records changed.

Next owner/action: reviewer checks conservative timing math, stale-dialog protection and old-approval invalidation. Device tester checks iOS/Android warning readability, long queues and confirmation labels, screen readers, manual reorder, target day refresh with learned durations, corrupt time data, and device restart/restored approval. SWITCH coordinates the stacked PR chain and existing release gates. Native acceptance, independent review, actual travel/start-time integration and deployment remain pending.
