# GreenCollar Phase 83 handoff — 2026-10-13

**Task ID:** Phase 83 — edit stop tasks in saved route drafts  
**Role:** RIVET  
**Work:** IN_PROGRESS  
**Delivery:** PREPARED  
**PR:** [#83 — edit tasks in saved workday drafts](https://github.com/newssmyrna/greencollar/pull/83)  
**Branch:** `codex/phase-edit-saved-schedule-tasks`  
**Base:** `codex/phase-single-route-draft-edit` at `d05eb11686933bab7c5d03caa16369cadf346089`  
**Implementation commit:** `bd4a038dceeceaa369a9d976d3306db9d8b2d19c`  
**CI:** run [#269](https://github.com/newssmyrna/greencollar/actions/runs/38425457244) is queued for the implementation commit. Run #268 passed the initial task editor and validation changes before the API-alignment follow-up.

## Scope and acceptance criteria

The saved single-route draft editor now allows managers to change a task name, estimated minutes, and one or more route-worker assignments while preserving its task ID. Managers can remove draft tasks, repair assignments after changing the route crew, and continue adding tasks to stops.

Before an update, every selected stop must have at least one task. Task names must be nonempty and at most 80 characters, estimates must be whole minutes from 1 to 1440, and assignments must be nonempty, unique, and limited to the selected route crew. Malformed saved task IDs, labels, estimates, or assignments keep the saved draft read-only.

The current schedule API's task constraints are mirrored by the editor. Saving remains version-checked and draft-only.

## Changed paths

- `App.tsx`
- `src/domain/workday-schedule-editor.ts`
- `tests/workday-schedule-editor.test.ts`
- `docs/ROADMAP.md`
- `docs/handoffs/GC-PHASE83-SAVED-TASK-EDIT-20261013.md`

## Checks and limits

- Added focused domain tests for valid tasks, missing tasks, field limits, crew assignment, duplicate assignments, malformed saved records, and duplicate task IDs within a stop.
- The final code commit's GitHub Actions run is pending; no check is reported as passed for that commit yet.
- No independent QA, phone-device acceptance, staging deployment, hosted data write, route publication, or customer communication was performed.

## Next owner and action

**Next owner:** PROOF / independent reviewer.  
**Exact next action:** after run #269 passes, review PR #83 for task-field editing, task-ID preservation, crew-change recovery, and save validation. Then SWITCH can coordinate merge approval. Keep multi-route drafts read-only until the editor supports their complete shape.
