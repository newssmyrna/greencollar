# GreenCollar Phase 83 handoff — 2026-10-13

**Task ID:** Phase 83 — edit stop tasks in saved route drafts  
**Role:** RIVET  
**Work:** IN_PROGRESS  
**Delivery:** PREPARED  
**PR:** [#83 — edit tasks in saved workday drafts](https://github.com/newssmyrna/greencollar/pull/83)  
**Branch:** `codex/phase-edit-saved-schedule-tasks`  
**Base:** `codex/phase-single-route-draft-edit` at `d05eb11686933bab7c5d03caa16369cadf346089`  
**Implementation commit:** `bd4a038dceeceaa369a9d976d3306db9d8b2d19c`  
**Handoff update commit:** `eb8367357e4e671e94eabdd0c8d2e7a0db5ec7a2`

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
- Run #268 passed the initial task-editor implementation at commit `9c1aa21ea1349280da778fc04d52e2e400bfa5bd`, before the final API-alignment checks.
- Run [#269](https://github.com/newssmyrna/greencollar/actions/runs/38425457244) was cancelled when the branch advanced. Its typecheck and scheduling-test steps and Cloudflare job reported success before cancellation, but the run itself is not counted as a pass.
- Run #270 was in progress on the handoff update commit as this correction was prepared; the new handoff commit will trigger a fresh run for the latest branch.
- No independent QA, phone-device acceptance, staging deployment, hosted data write, route publication, or customer communication was performed.

## Next owner and action

**Next owner:** PROOF / independent reviewer.  
**Exact next action:** after the latest GitHub Actions run passes, review PR #83 for task-field editing, task-ID preservation, crew-change recovery, and save validation. Then SWITCH can coordinate merge approval. Keep multi-route drafts read-only until the editor supports their complete shape.
