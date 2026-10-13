# GreenCollar Phase 82 handoff — 2026-10-13

**Work:** READY FOR REVIEW  
**Delivery:** PREPARED  
**PR:** [#82 — safely edit saved single-route workday drafts](https://github.com/newssmyrna/greencollar/pull/82)  
**Branch:** `codex/phase-single-route-draft-edit`  
**Base:** `codex/phase-schedule-reported-lunch` at `fd9874d8d250c9699f9704d50e688d42a566682c`  
**Implementation commit:** `f0b54d7aff3af185c8b34050e8520ac53ade6184`  
**CI:** run #264 passed app typecheck/tests and Worker typecheck, staging bundle dry-run, and auth-gate tests on the implementation commit.

## Scope

The schedule editor now hydrates a saved single-route draft and can update it using its saved version. It preserves route ID, truck, worker assignments, lunch intervals, stop order, and task data. The editor keeps unsupported shapes read-only: multiple routes, inactive/missing stops, workers no longer on the verified roster, non-uniform worker shifts, and invalid saved data.

The update path checks the current server version before submitting, then uses the API's expected-version guard to reject changes made between the read and write. A removed draft is not recreated by an edit attempt. No route is published.

## Changed paths

- `App.tsx`
- `src/domain/workday-schedule-editor.ts`
- `tests/workday-schedule-editor.test.ts`
- `docs/ROADMAP.md`
- `docs/handoffs/GC-PHASE82-SAVED-SCHEDULE-EDIT-20261013.md`

## Limits and next action

No independent QA, iPhone/Android device acceptance, staging deployment, hosted data write, route publication, or customer communication was performed. The docs-only follow-up commit will trigger CI again.

**Next owner:** PROOF / independent reviewer.  
**Exact next action:** review PR #82 against the single-route preservation and version-conflict cases; after approval, SWITCH can merge it into its base branch. Keep multi-route drafts read-only until the editor supports their complete shape.
