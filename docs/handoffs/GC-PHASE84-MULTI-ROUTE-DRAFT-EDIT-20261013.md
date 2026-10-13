# GreenCollar Phase 84 handoff — 2026-10-13

**Task ID:** Phase 84 — edit saved multi-route drafts one route at a time  
**Role:** RIVET  
**Work:** IN_PROGRESS  
**Delivery:** PREPARED  
**Base:** Phase 83 branch `codex/phase-edit-saved-schedule-tasks` at `454d202a049eea0c66f0b080dc70fc2e3ca22785`

## Scope and acceptance criteria

The schedule editor can load a complete saved multi-route draft after validating every route. Managers can select a route, edit it with the existing crew, shift, lunch, stop, and task controls, and update the versioned draft. Each save replaces only the selected route and preserves every other route. Switching routes warns that unsaved form changes will be discarded.

Before editing, route IDs, trucks, crews, workday stops, task data, lunch blocks, and cross-route truck/worker/visit conflicts must be representable and valid. Unsupported or malformed saved schedules remain read-only. Route changes remain drafts and do not publish to worker views or GPS devices.

## Changed paths

- `App.tsx`
- `src/domain/workday-schedule-editor.ts`
- `tests/workday-schedule-editor.test.ts`
- `docs/ROADMAP.md`
- `docs/handoffs/GC-PHASE84-MULTI-ROUTE-DRAFT-EDIT-20261013.md`

## Checks and limits

- Added domain coverage for valid multi-route hydration, malformed route sets, cross-route conflicts, whole-schedule validation, and replacing one route while preserving others.
- Automated GitHub checks and review status: pending.
- No independent review, phone-device acceptance, staging deployment, hosted data write, route publication, or customer communication has been performed.

## Next owner and action

**Next owner:** PROOF / independent reviewer.  
**Exact next action:** review the route-by-route editor, whole-schedule validation, and preservation behavior, then SWITCH can coordinate merge approval. Do not publish routes or deploy this draft editor.
