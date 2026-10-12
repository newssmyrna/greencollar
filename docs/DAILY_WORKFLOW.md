# Recurring services → daily workday planner

The pure TypeScript adapter `src/domain/daily-workflow.ts` connects recurring service agreements with the existing baseline scheduler.

Inputs: operator-local ISO date, service agreements, optional extra jobs, completed/skipped visit IDs, working hours, job cap, start/end depot and a precomputed drive-time matrix.

Outputs: selected ordered visits with predicted start/finish times, projected revenue and driving minutes, due count, handled count, and an explicit list of recurring visits that could not fit.

**Important limits:** The existing route planner is greedy and not globally optimal; travel matrices are synthetic in development. The feature does not yet read from live Cloudflare D1 records or send updates to customers. Completed/skipped visits are supplied by the caller pending authenticated persistence and full lifecycle work.

Do not schedule a visit twice. Do not silently drop visits that cannot fit. The operator must approve proposed day changes.

The review branch includes authenticated tenant-scoped writes for completed and explicitly skipped visits. Today asks for confirmation before marking a due visit skipped, then refreshes the saved day. The API protects completed and active visits from being overwritten; skip persistence remains unmerged and not deployed.

Next: plan approval and visit lifecycle integration across the mobile planner, followed by real-device testing. Real road travel, owner-controlled replanning and customer updates remain future integrations.
