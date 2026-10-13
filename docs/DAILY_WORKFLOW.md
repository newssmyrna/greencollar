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

Today now checks the remaining saved visits in their displayed manual order using the current predicted service durations. The check uses one shared local clock. Without a saved work window it uses a best-case start at 00:00 and finish at 24:00; the optional planned work window described below replaces those bounds. Travel, breaks and automatic device-clock updates remain excluded. These assumptions are shown in Today and the approval dialog. It does not generate arrival times or establish an achievable route. Locations in different timezones need separate review; timezone lookup/conversion is not implemented.

The check advances an earliest-possible service clock through the queue. A saved earliest start or fixed start can delay that clock. It flags a fixed start that the preceding service cannot reach, a finish window exceeded by the current estimate/order, or work extending past the local calendar day. After a missed fixed start it never moves the clock backward. Empty and unconstrained queues have explicit descriptions; absence of a warning does not prove the work fits the operator's actual day.

Each warning is shown beside the affected visit, with a summary before approval. Changing order recomputes the check without moving appointment times, skipping visits or writing a schedule. Completed/skipped services are excluded by the existing saved-day summary. New duration history can produce a warning even when the originally configured estimate fitted the saved window.

A conflicting queue remains an operator decision: the confirmation action explicitly says **Approve with appointment warnings**, or **Approve with warnings** when workload overruns also exist. Approval records that review; it does not fix a conflict. Invalid minute fields stop the assessment and block approval restoration/writes. Existing storage is preserved when approval rejects. Workload-limit editing/saving remains independent of malformed appointment fields.

Approval snapshots now use the appointment-review policy version. Earlier approvals require fresh review even with otherwise identical values. After explicit approval, only the same operator, business, date, order, estimates, saved appointment fields and normalized workload limits can restore it. Existing current-snapshot checks reject a dialog approval if its queue changed while the dialog was open.

Acceptance: fixed-overlap and queue-order warnings; earliest-start waiting; finish-window and midnight boundaries; predicted-duration changes; malformed time handling; clear shared-clock/no-travel assumptions; explicit warning action; fresh review for prior policy and changed snapshots; durable matching approval without silent replacement. Local focused verification: 96 tests passed, including 17 added tests and an exhaustive scheduling oracle across 200 bounded synthetic cases. This is source/self-review evidence; it is not independent QA, a device run or live routing evidence.

Paths: `App.tsx`, `src/domain/service-time.ts`, `src/domain/saved-queue-appointments.ts`, `src/domain/saved-queue-review.ts`, `src/data/local-saved-queue-approval.ts`, `tests/saved-queue-appointments.test.ts`, and this document.

Impact: planned Today appointment summary, per-visit warnings and approval dialog; planned device approval eligibility/versioning; testing-only synthetic fixtures/regressions; documentation-only handoff. No new API, schema, migration, provider requests, arrival predictions, automatic reorder, customer messages or billing behavior. No live pages/posts or production records changed.

Next owner/action: reviewer checks conservative timing math, stale-dialog protection and old-approval invalidation. Device tester checks iOS/Android warning readability, long queues and confirmation labels, screen readers, manual reorder, target day refresh with learned durations, corrupt time data, and device restart/restored approval. SWITCH coordinates the stacked PR chain and existing release gates. Native acceptance, independent review, actual travel/current-time integration and deployment remain pending.

## Saved workday start and finish

Task: GC-SAVED-WORKDAY-WINDOW-20261013. Owner: Codex applying implementation, self-review and documentation responsibilities; independent reviewer/device tester pending assignment. Source base: PR #61 at `2f184f4ad68b1be2cb7859e9ac6629e93db869d2`. Branch: `codex/phase-saved-workday-window`. Source date: 2026-10-13 UTC. Work: REVIEW; delivery: PREPARED. Exact final head, PR, elapsed time and CI results are recorded on the phase PR.

Today now accepts a planned start and finish for the remaining work in its existing per-day settings. Both clocks are optional together; entering only one rejects. Values use one local 24-hour clock, must fit the same calendar day, and normalize to HH:MM. Start accepts 00:00–23:59; finish alone may be 24:00. Equal, reversed and overnight windows reject. Leaving both blank retains the explicit 00:00–24:00 baseline; no clock value is inferred from the operator's device or a legacy record.

The service-hour budget and visit cap remain separate settings, with at least one still required. The planned window does not silently replace that budget or deduct travel/break time. Appointment checks begin at the entered start and apply whichever finish is earlier: the customer's saved finish or the operator's planned finish. Waiting for earliest/fixed appointments consumes the window. Warnings remain tied to the current manual order and current predicted service durations; they do not change appointments, rearrange visits or calculate actual arrival times.

The device record now writes version 2 under the existing exact operator/business/date key. Version-1 records load their original hours/cap without new clock fields and are not rewritten on read. A subsequent explicit save writes version 2. Records remain bounded to 512 characters, preserve hashed scope identity, and do not synchronize to a server or another device. Unsupported/corrupt records, partial windows and unexpected time fields in a version-1 record fail closed without replacing their stored bytes. Older app versions that cannot read version 2 require restore/replacement handling; do not silently downgrade a saved record.

Timing results wait for both the saved order and work settings to restore. An editable preview using unsaved settings is labeled explicitly. Window-only edits mark settings unsaved and immediately invalidate approval readiness. Saving captures the edited values before asynchronous storage, blocks duplicate saves/edits while pending and ignores late results after context changes. A failed or uncertain write requires readback or an explicit replacement save. Clearing both clock inputs is an explicit saved change back to the full-day baseline.

Approval now binds the normalized start/finish and whether a window was set, alongside its prior identity, order, estimate, appointment and workload fields. An earlier policy approval requires fresh review. Invalid or incomplete windows cannot approve or restore approval, even if a stored digest otherwise matches. Changing either clock requires review again; equivalent formatting normalizes to the same minute values. Existing current-context guards still reject stale dialog callbacks.

Acceptance: optional/canonical clock inputs, midnight/end-of-day limits, same-day validation, start/finish conflict detection, tighter customer windows, waiting time, approval invalidation, settings scope isolation, version-1 read compatibility, corruption preservation, pending/uncertain writes and late-context suppression. Local focused verification: 115 tests passed, including 19 added tests and 200 new exhaustive synthetic work-window cases. Existing appointment tests include a separate 200-case baseline oracle. Full CI counts and exact source head are on the phase PR.

Paths: `App.tsx`, `src/domain/workday-window.ts`, `src/domain/saved-queue-workload.ts`, `src/domain/saved-queue-appointments.ts`, `src/domain/saved-queue-review.ts`, `src/data/local-saved-queue-workload.ts`, `src/data/saved-queue-workload-settings.ts`, `src/data/local-saved-queue-approval.ts`, `tests/workday-window.test.ts`, `tests/local-saved-queue-workload.test.ts`, and this document.

Impact: planned Today work settings, appointment warnings and approval dialog; planned device settings/approval compatibility; testing-only synthetic fixtures and regressions; documentation-only handoff. No live pages/posts, production records, API/schema changes, remote migration, provider calls, messages or billing changes.

Next owner/action: reviewer checks optional-versus-partial windows, the earlier finish bound, old-record readback and exact approval binding. Device tester verifies iOS/Android time entry, field labels, restart/readback, failed saves, changes with an open approval dialog, date/operator switches, and long queue readability. SWITCH coordinates the stacked PR chain and release gates. Native acceptance, independent review, actual road travel/break handling, timezone conversion and deployment remain pending. The operator must update the remaining-work start as the day progresses; this phase does not follow the device clock automatically.

## Saved planned workday break

Task: GC-SAVED-WORKDAY-BREAK-20261013. Owner: Codex implementation, self-review and documentation; independent reviewer/device tester pending assignment. Source base: PR #62 at `489a5e3a5c204c5155b1dfa0018d1d7bb1fd4abb`. Branch: `codex/phase-saved-workday-break`. Source date: 2026-10-13 UTC. Work: REVIEW; delivery: PREPARED. The phase PR records the exact final source head, PR number, elapsed time and full CI evidence.

Today work settings now support one optional planned break for the remaining workday. Enter its start and finish together on the same local 24-hour clock, with finish strictly after start. Only finish may be 24:00. When a work window is set, the entire break must fit inside it; otherwise the explicitly labeled 00:00–24:00 baseline applies. Moving the remaining-work start past a saved break requires updating or clearing that break. Leaving both fields blank means no planned break; no time is inferred from the device clock, appointments or older settings.

Timing checks treat each service as uninterrupted. A flexible service that cannot finish before the break is checked from the break's finish. A service may finish exactly at break start or start exactly at break finish. Waiting that already spans the break does not count it again. Fixed appointments whose complete service interval overlaps the break receive an explicit warning. Delays carry forward through the manual queue and can expose a later fixed-start, customer-finish or workday-finish conflict. Current predicted service durations are used. The model does not change appointments, reorder visits, split services or control the running timer.

The service-hour budget remains a separate budget of service minutes, and the visit cap is unchanged. Breaks affect the timing check rather than silently reducing that budget. Review copy names the configured interval, says services are uninterrupted and explains that travel and any other breaks remain excluded. There is no arrival forecast, actual-time integration, timezone conversion or support for multiple planned breaks in this phase.

Device settings now write version 3 under the existing exact operator/business/date hashed key. Version 1 loads the original hours/cap; version 2 also loads its work window. Neither invents break fields or writes on read. The next explicit save writes version 3. Unexpected break fields in a version-1/2 record, partial/invalid/out-of-window breaks and unsupported versions reject without modifying saved bytes. Records retain the 512-character bound and contain no raw scope identities. Older clients that do not support version 3 must not silently downgrade it.

Break-only edits mark settings unsaved and immediately invalidate approval readiness, including an already-open approval callback. Saving captures values before asynchronous storage; pending saves reject duplicate taps and edits. Uncertain writes require readback or explicit replacement. Late restore/save results cannot enter a different operator/business/date scope. Clearing both break fields is an explicit saved change. Restored order and settings are still required before timing results appear, and an unsaved preview remains labeled.

Approval uses a new timing-policy version and binds the normalized break status/start/finish in addition to the existing work window, queue order, estimates, appointment fields and workload limits. Earlier approvals require review again. Invalid break settings cannot save or approve. Valid timing conflicts remain an explicit operator decision with a warning-labeled confirmation; approval records review and does not resolve the conflict.

Acceptance: optional/canonical input; same-day and work-window validation; uninterrupted service checks; exact touching boundaries; flexible waiting without double counting; fixed-break and downstream timing warnings; learned-duration changes; normalized approval binding; version-1/2 read compatibility; version-3 scope isolation; corrupt-record preservation; edit/save/readback/context protections.

Verification: 137 focused local tests passed, including 22 new tests. Node 24 ran temporary copies with explicit TypeScript import extensions. The new scheduling oracle enumerated feasible service start times independently across 400 bounded synthetic break/window cases; two existing oracles cover another 400 cases without breaks. Full CI counts and exact head evidence are recorded on the phase PR. This is source, automated regression and self-review evidence; native device testing and independent QA remain pending.

| Feature/functionality | Implementation | Impact |
| --- | --- | --- |
| Optional planned break input and validation | Complete | Planned Today work settings |
| Break-aware appointment checks | Complete | Planned Today review and per-visit warnings |
| Durable break settings and legacy restoration | Complete | Planned device storage |
| Break-bound approval and edit protection | Complete | Planned Today approval |
| Native acceptance and deployment | Pending | No live change |

Paths: `App.tsx`, `src/domain/workday-break.ts`, `src/domain/saved-queue-appointments.ts`, `src/domain/saved-queue-review.ts`, `src/data/local-saved-queue-workload.ts`, `src/data/saved-queue-workload-settings.ts`, `src/data/local-saved-queue-approval.ts`, `tests/workday-break.test.ts`, `tests/workday-window.test.ts`, and this document.

Impact: planned Today settings, appointment warnings and approval dialog; planned device settings compatibility; testing-only synthetic fixtures/regressions; documentation-only behavior and handoff. No live pages/posts, production records, API/schema changes, remote migrations, provider calls, messages or billing changes.

Next owner/action: reviewer checks uninterrupted-service math, break-bound approval, version compatibility and stale-dialog guards. Device tester verifies iOS/Android input, labels and errors; break warnings in long queues; restore before review; restart/readback; clearing a passed break after moving the remaining-work start; failed saves; open-dialog changes; and date/operator switches. SWITCH coordinates the existing stacked PR chain and release gates. This phase does not merge or deploy that chain. Four completed implementation goals measure this phase only, not overall product readiness.

## Multiple planned workday breaks

Task: GC-SAVED-WORKDAY-BREAKS-20261013. Owner: Codex implementation, self-review and documentation; independent reviewer/device tester pending assignment. Source base: PR #63 at `690888d7aa86597d6979c172895c97d98d41a552`. Branch: `codex/phase-saved-workday-breaks`. Source date: 2026-10-13 UTC. Work: REVIEW; delivery: PREPARED. The phase PR records exact source head, PR, elapsed time and final CI evidence.

Today work settings now accept up to eight planned break intervals, entered one per line as `HH:MM-HH:MM`. The list is optional and blank lines are ignored. Times use the same local clock as the workday; finish is after start and only finish can be 24:00. Intervals sort chronologically when saved, may touch at their edges, cannot overlap, and must all fit the planned work window when one is set. Malformed, partial, oversized and out-of-window lists block saving and approval. The interface explicitly says other breaks and travel remain excluded.

Timing checks keep each service uninterrupted. If a flexible service overlaps one or more intervals, its earliest possible start moves past each affected interval. A service may finish exactly at a break start or begin exactly at a break finish. Fixed appointments that overlap configured intervals receive a warning naming the affected times. Waiting that already covers an interval is not counted twice. Later jobs retain the delay, and the earlier customer/workday finish can still warn. The service-hour budget stays separate. Checks still do not reorder visits, alter appointment times, forecast arrivals, or control timers.

Device settings now write version 4. Version 1 restores the original workload limits, version 2 restores its work window, and version 3 restores its single optional break as a one-line list. Reading older versions never adds a break or rewrites stored bytes. An explicit save writes version 4. Unexpected, malformed or partially present legacy break fields and unsupported versions fail closed without replacing original bytes. Scope identity remains hashed and records stay under the 512-character limit. Clients that do not recognize version 4 must not silently downgrade it.

Approval uses a new policy version and binds the normalized set of break intervals alongside the existing queue, work window, visit estimates, appointment times and workload limits. Reordering or changing any interval requires a fresh review. Existing load-before-check, dirty-edit, pending-save, uncertain-write, changed-context and current-dialog protections remain in force.

Acceptance: up to eight intervals; sorting, blank lines and canonical clocks; partial/malformed/overlap/window validation; touching boundaries; uninterrupted service movement across multiple breaks; explicit fixed-overlap warnings; waiting-time behavior; learned durations; workday/customer finish limits; approval binding; version-1/2/3 compatibility; corrupt-byte preservation; exact-scope restore and async save protections.

Verification: 142 focused local tests passed, including 27 tests for multiple intervals. A separate exhaustive scheduling oracle agreed across 400 bounded synthetic workdays with two breaks. The existing 200-case work-window oracle and 200-case baseline appointment oracle remain in the suite. Full CI evidence and total regression counts are on the phase PR. This is automated source verification and self-review, not independent QA or device acceptance.

| Feature/functionality | Implementation | Impact |
| --- | --- | --- |
| Multi-interval Today input and validation | Complete | Planned Today settings |
| Appointment checks across all intervals | Complete | Planned Today review and warnings |
| Version-4 persistence with legacy readback | Complete | Planned device settings |
| Approval binding and edit protections | Complete | Planned Today approval |
| Native acceptance and deployment | Pending | No live change |

Paths: `App.tsx`, `src/domain/workday-break.ts`, `src/domain/saved-queue-workload.ts`, `src/domain/saved-queue-appointments.ts`, `src/domain/saved-queue-review.ts`, `src/data/local-saved-queue-workload.ts`, `src/data/saved-queue-workload-settings.ts`, `src/data/local-saved-queue-approval.ts`, `tests/workday-break.test.ts`, `tests/workday-window.test.ts`, and this document.

Impact: planned Today settings, per-visit warnings and approval; planned device-settings migration; testing-only synthetic fixtures; documentation-only handoff. No live pages/posts, production records, API/schema changes, remote migrations, provider calls, messages or billing changes.

Next owner/action: reviewer checks multi-interval schedule math, version-3 migration and approval binding. Device tester checks multiline entry, keyboard behavior, labels/errors, restored interval display, long queues, restart/readback, break-list edits during approval and workday-scope changes. SWITCH coordinates the existing stacked PR chain and release gates. No merge or deployment is included in this phase. Four implementation goals measure phase delivery only, not overall product readiness.

## Manual travel estimates between saved stops

Task: GC-SAVED-QUEUE-TRAVEL-ESTIMATES-20261013. Source base: PR #64 at `95c529ba83e6cd80c6f212a2f0760b449958e553`. Work: REVIEW; delivery: PREPARED. The phase PR records exact head, focused/full CI results and elapsed time.

Today now accepts an optional manual whole-minute estimate from one adjacent saved stop to the next. Estimates are bound to that directed visit pair; reordering never silently applies an old estimate to a different leg. Values from 0 to 1,440 minutes are saved with the device-local queue order. The first stop has no inbound estimate because Today has no saved starting location. Legacy version-1 queue records continue to restore without estimates and are not rewritten on read. Raw visit IDs are not stored in the order record.

Appointment checks include each entered leg before the destination service, propagate the lower-bound delay to later visits, and move a travel segment intact past a configured break if the segment would overlap it. A late arrival to a fixed start or an overrun of the customer/workday finish remains an explicit warning. The workload service-minute budget does not include travel. Changing an estimate or order changes the approval snapshot; unsaved travel edits block approval until saved. Approval can still record an operator's review of a conflict, but it does not resolve it.

The interface labels these as manual estimates, not road-based route times or arrival predictions. Unentered travel, traffic, route geometry, and travel to the first stop are excluded. The OSRM-compatible provider is still inactive; provider selection, location privacy/consent, authorization, quota, caching and cost gates remain prerequisites to live routing.

Acceptance: minute bounds and malformed values; estimates that change fixed-appointment and finish warnings; trip/break overlap; invalid first-stop input; approval invalidation; hashed local persistence; version-1 read compatibility; dropping estimates no longer adjacent after reload; storage failure preservation. Local focused and full repository checks, native acceptance, and independent review are reported separately on the phase PR.

| Feature/functionality | Implementation | Impact |
| --- | --- | --- |
| Today per-leg manual estimate inputs | Complete | Planned Today queue |
| Travel-aware same-order appointment checks | Complete | Planned Today timing warnings and approval dialog |
| Hashed, device-local estimate persistence | Complete | Planned device work-order settings |
| Legacy readback, changed-leg and approval protection | Complete | Testing-only synthetic storage and review regressions |
| Native acceptance, independent QA and deployment | Pending | No live change |

Paths: `App.tsx`, `src/domain/saved-queue-appointments.ts`, `src/domain/saved-queue-review.ts`, `src/domain/saved-queue-order.ts`, `src/data/local-saved-queue-order.ts`, `src/data/local-saved-queue-order-native.ts`, `tests/saved-queue-appointments.test.ts`, `tests/local-saved-queue-order.test.ts`, and this document.

Impact: planned Today queue, warning summary and approval dialog; planned device-local work-order settings; testing-only synthetic records; documentation-only workflow handoff. No live pages/posts, customer records, API/schema changes, provider calls, messages, billing or production settings changed. Manual minutes are not a route optimizer or actual ETA.

## Manual travel estimate to the first stop

Task: GC-SAVED-QUEUE-FIRST-LEG-20261013. Source base: phase #65 PR head `ed9c2a2ca223921c9df9ca124ac243cfea9354e6`. Delivery: prepared for review; elapsed time and exact CI evidence are recorded in the phase PR.

Today accepts an optional whole-minute estimate from a starting point the operator chooses to the first saved stop, alongside estimates between adjacent stops. The operator supplies the starting point by choosing the point used for their estimate; the app does not ask for or save its address, use device location, look up a route or contact a routing provider. The estimate itself is saved with the device-local work order and is tied to the first visit ID, so it is dropped if that visit is no longer first. Travel estimates remain separate from service-minute workload totals.

Appointment checks include this first leg before the first service, carry its delay through later visits, and keep a travel segment uninterrupted across configured breaks. The approval snapshot uses a new policy version and includes the first-leg minutes. An unsaved estimate still blocks approval. The interface distinguishes the operator-chosen starting point from the actual workday start and labels the minutes as manual estimates, not road-based times or arrival predictions.

Persistence writes record version 3 only when a first-leg estimate exists. The record stores a hashed visit order and a zero index for the first leg; it does not store a starting-point identity or raw visit IDs. Versions 1 and 2 remain readable, version 2 continues to represent estimates between saved stops, and an origin estimate never transfers to a different first stop after reordering.

| Feature/functionality | Completion | Impact |
| --- | --- | --- |
| First-stop manual estimate input and operator-start copy | Complete | Planned Today queue |
| First-leg scheduling, break handling and timing warnings | Complete | Planned Today timing checks and approval review |
| Hashed version-3 persistence with version-1/2 readback | Complete | Planned device-local work-order settings |
| Approval binding and first-stop association after reordering | Complete | Planned Today approval; testing-only synthetic storage and regressions |
| Native device acceptance, independent QA and release | Pending | No live change |

Paths: `App.tsx`, `src/domain/saved-queue-appointments.ts`, `src/domain/saved-queue-review.ts`, `src/domain/saved-queue-order.ts`, `src/data/local-saved-queue-order.ts`, `tests/saved-queue-appointments.test.ts`, `tests/local-saved-queue-order.test.ts`, and this document.

Impact: planned Today input, warnings and approval; planned device-local work-order settings; testing-only synthetic records and regressions; documentation-only handoff. No live pages/posts, customer records, API/schema changes, production settings, provider calls, messages or billing changed. Phase completion measures this feature only, not overall product readiness.


## Edgewater routing provider decision — Phase #67

Date: 2026-10-13. Delivery: review branch, documentation-only. Time: approximately 20 minutes for this selection/policy update; approximately 32 minutes cumulative for the Phase #67 readiness screen and decision.

| Feature / functionality | Phase completion | Impact |
|---|---:|---|
| Edgewater workload and three-truck ceiling model | 100% | Documentation only |
| Google Routes Compute Route Matrix Essentials provider selected | 100% | Documentation only; inactive |
| $120/month provider spend boundary and 19,500-element hard-stop policy defined | 100% | Documentation only; enforcement planned |
| Coordinate notice, minimization, retention, and attribution policy drafted | 100% | Documentation only; public pages planned |
| Google adapter, authorization, consent gates, and durable meter | 0% | Planned implementation |
| Mobile live-road workflow and real provider estimates | 0% | Planned; manual/synthetic workflow remains |
| Provider account, key, billing, live pages/posts, and deployment | 0% | Not configured or published |

**Phase completion: 100% of the provider-selection and policy-definition scope.** This does not mean live routing is functional.

### Cost and workload decision

- Owner inputs: Edgewater, Florida; 5 operating days/week; 6 people; 3 trucks.
- Stated expected volume: 10 stops per operating day. To size the cap conservatively, the meter allows up to 10 stops **per truck** (30 total) per day, two endpoints per truck, and one full rerun. That's 144 matrix elements per truck/pass, 864 per workday including the rerun, and 19,008 per average 22-day work month.
- Recommended provider limit: **$120/month before tax**, enforced in the eventual server-side meter at the earlier of **19,500 matrix elements** or **$120 estimated no-free-credit list-price exposure**. At the current Google Essentials first paid tier ($5/1,000 elements), the 19,500-element stop is tighter and estimates to $97.50/month. Billing alerts are supplemental only; the application meter is the hard gate.
- Provider selected: Google Routes API Compute Route Matrix Essentials for standard, traffic-unaware driving-time estimates. Mapbox was not selected because its vehicle-use license includes a separate annual commercial license and may include seat pricing.

### Policy decision

Route requests require an explicit operator action, admin enablement, and notice that coordinates go to Google. Send coordinates only; do not send customer/person identifiers, service notes, employee identifiers, or device GPS. Keep the key in a restricted server secret. Do not log coordinate-bearing requests or persist raw/derived Google route data unless the applicable agreement permits it. Show required attribution. At the monthly stop or on any missing authorization, notice, public privacy/terms page, or meter failure, use manual travel-time entry and make no provider call.

Google requires publicly accessible Terms of Use and a Privacy Policy referencing its own terms/privacy pages. The GreenCollar domain is not owned yet, so those pages and the first provider request remain planned. Truck dimensions/restrictions and any traffic-aware SKU are outside this selection and require a separate review.

### Impact and verification

- Changed on PR #67: `docs/ROAD_PROVIDER.md` and this handoff, both **documentation-only**.
- Live pages/posts: **none**. Planned pages: public Terms of Use and Privacy Policy on the future GreenCollar domain. Testing-only impact: **none added in this update**; provider calls: **none**.
- PR #67 remains open and review-only. The previous head's Actions run #222 passed app typecheck and scheduling tests, Worker typecheck, staging Worker bundle dry-run, and authentication gates. Check Actions on the new documentation head before handoff.
- No app/Worker implementation, account, key, billing configuration, production setting, customer data, or deployment changed.

Next phase: implement the server-side Google adapter, atomic monthly element reservation, operator/admin authorization and notice gates, result-discard policy, mobile/manual fallback, and tests. Keep routing disabled until public policies exist and the spend gate is verified.


## Edgewater routing controls — Phase #68

Delivery: server-side implementation staged for review; live routing remains disabled. Elapsed active implementation time: approximately 15 minutes for adapter, spend/consent controls, and offline verification; CI wait and Phase #67 provider selection excluded.

| Feature / functionality | Completion | Impact |
|---|---:|---|
| Google matrix adapter, response bounds, indexing, and timeout | 100% | Testing only; code staged |
| Atomic Pacific-month $120 / 19,500-element usage reservation | 100% | Testing only; migration unapplied |
| Tenant authorization, admin activation, notice, policy and current-rate checks | 100% | Testing only; inactive configuration |
| Ephemeral route values, attribution field, and manual fallback responses | 100% | Testing only; mobile flow planned |
| Public Terms/Privacy pages and in-app routing UI | 0% | Planned; future domain required |
| Provider account, key, billing, live requests, database apply, production activation | 0% | Not configured or performed |

Paths: Worker auth/router/provider/meter/API, `cloudflare/migrations/0010_routing_provider_controls.sql`, provider/meter/API/schema tests, `docs/ROAD_PROVIDER.md`, and this handoff.

Impact: live pages/posts **none**; planned **future public legal pages and app routing notice/manual fallback**; documentation-only **provider implementation/policy handoff**; testing-only **mocked Google responses and synthetic coordinates**. No real provider calls or location data were used. Manual travel estimates remain the active workflow; provider durations are not persisted.


### Phase #69 handoff — mobile routing readiness and notice controls

| Feature / functionality | Phase completion | Impact |
|---|---:|---|
| Typed mobile read of routing readiness and policy URLs | 100% | Testing only; staged app code |
| Current operator acknowledgment and owner/admin business toggle | 100% | Testing only; settings actions only, no route request |
| Manual travel estimates and approval snapshot remain separate | 100% | Planned path retained; no estimated values copied or saved |
| Public policy pages and ready provider configuration | 0% | Planned; domain and provider signup still pending |
| Mobile road-matrix request and route-duration display | 0% | Planned for a later phase after pilot fleet/stop flow is defined |

**Phase completion: 100% of the readiness, notice, and business-control UI scope; 0% live routing.** Active implementation and review time: approximately 25 minutes; CI wait excluded.

Today now has an explicit readiness check, displays Terms/Privacy links and the current notice when supplied by the Worker, stores per-operator acknowledgment through the authorized endpoint, and exposes owner/admin enable/disable controls. This path never sends coordinates or calls a map provider. The existing manual travel inputs continue to save only operator-entered values on the device. No provider durations are added to the estimate or approval records.

Page/post impact: live pages/posts **none**; planned **future public Terms/Privacy pages and later route-matrix UI**; documentation-only **this handoff and provider notes**; testing-only **mocked settings/acknowledgment requests**. No signup, billing, migration, provider request, deployment, or spend occurred.


## Temporary three-truck drive-time preview (Phase 70)

Today can group the visible saved due queue across Truck 1, Truck 2, and Truck 3 for a temporary preview. The operator must assign every due stop. Assignments follow the current manually chosen queue order and remain in React memory only; they are not persisted or included in the saved work-order approval. Each truck request is separate and requires an explicit confirmation after showing stop count and matrix elements. The app refreshes server routing settings immediately before request, and the Worker rechecks provider readiness, business enablement, operator notice, and the monthly spend meter.

A preview sends only the selected truck's saved coordinates and ephemeral point IDs. It reports adjacent legs in the current chosen order. It does not add depot legs, optimize stops, calculate arrival times, alter manual travel estimates, or change work approvals. One-stop trucks require no provider request. Results and assignments disappear on restart. No routing provider calls were made in development or tests. The pilot's 10-stops-per-day interpretation and allocation assumptions remain open; this temporary three-truck split does not settle the fleet operating plan.


### Weather interruption and schedule recalibration

The rain-out carryover case and manager/worker decision rights are specified in [WEATHER_INTERRUPTION_REPLAN.md](WEATHER_INTERRUPTION_REPLAN.md). The feature is planned and documentation-only; it does not change live scheduling. The owner/operator should retain both management and field-worker capabilities. Workers can report interrupted work but cannot publish business-wide schedule changes.


### Rain-out carryover prototype

Phase 71 adds a pure, non-persistent calculator for next-day and spread-across-horizon options, plus capability rules mapped to the current `owner` / `admin` / `worker` memberships. It preserves completed visits and reports service-minute capacity, moved/unplaced stops, projected revenue, and delay metrics. It explicitly warns when drive time, appointment windows, breaks, and route feasibility are not modeled. This is calculator/test foundation only: no interruption capture, manager UI, schedule write, or customer notification is live.
