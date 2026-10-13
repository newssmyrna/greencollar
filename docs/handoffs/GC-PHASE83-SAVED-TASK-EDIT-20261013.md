# GreenCollar Phase 83 handoff — 2026-10-13

**Task ID:** Phase 83 — edit stop tasks in saved route drafts  
**Role:** RIVET  
**Work:** READY FOR REVIEW  
**Delivery:** PREPARED  
**PR:** [#83 — edit tasks in saved workday drafts](https://github.com/newssmyrna/greencollar/pull/83)  
**Branch:** `codex/phase-edit-saved-schedule-tasks`  
**Base:** `codex/phase-single-route-draft-edit` at `d05eb11686933bab7c5d03caa16369cadf346089`  
**Implementation commit:** `0f492425ec8247338432de8ccbf47bed0a96ae7d`

## Scope and acceptance criteria

The saved single-route draft editor allows managers to change a task name, estimated minutes, and one or more route-worker assignments while preserving its task ID. Managers can remove draft tasks, repair assignments after changing the route crew, and continue adding tasks to stops.

Before an update, every selected stop must have 1 to 20 tasks. Task names must be nonempty and at most 80 characters, estimates must be whole minutes from 1 to 1440, and assignments must be nonempty, unique, and limited to the selected route crew. Malformed saved task IDs, labels, estimates, or assignments keep the saved draft read-only.

The editor matches the current schedule API constraints. Saving remains version-checked and draft-only.

## Changed paths

- `App.tsx`
- `src/domain/workday-schedule-editor.ts`
- `tests/workday-schedule-editor.test.ts`
- `docs/ROADMAP.md`
- `docs/handoffs/GC-PHASE83-SAVED-TASK-EDIT-20261013.md`

## Checks and limits

- Added focused domain tests for valid tasks, required tasks, field/count limits, crew assignment, duplicate assignments, malformed saved records, and duplicate task IDs within a stop.
- Run [#272](https://github.com/newssmyrna/greencollar/actions/runs/38426061048) passed app typecheck and scheduling tests, and Worker typecheck, staging bundle dry-run, and auth-gate tests, on the implementation commit.
- No independent QA, phone-device acceptance, staging deployment, hosted data write, route publication, or customer communication was performed.

## Next owner and action

**Next owner:** PROOF / independent reviewer.  
**Exact next action:** review PR #83 for task-field editing, task-ID preservation, crew-change recovery, and save validation. Then SWITCH can coordinate merge approval. Keep multi-route drafts read-only until the editor supports their complete shape.
