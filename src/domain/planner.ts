import type { PlannerInput, PlanResult, PlannedStop, ServiceJob, TravelMatrix } from './types';

/**
 * Transparent deterministic *baseline* scheduler, NOT a global optimal vehicle routing solver.
 * Adds valid jobs greedily by shortest next drive, using service windows, fixed starts,
 * end-of-day return constraints, job caps and a configurable per-job buffer.
 * Travel matrix must come from a road routing provider in production.
 */
function travel(matrix: TravelMatrix, from: string, to: string): number {
  if (from === to) return 0;
  const n = matrix[from]?.[to];
  return typeof n === 'number' && Number.isFinite(n) && n >= 0 ? n : Infinity;
}
export function planDay(input: PlannerInput): PlanResult {
  const { jobs, locations, travelMinutes, startNodeId, endNodeId, startMinute, endMinute } = input;
  const byLocation = new Set(locations.map(l => l.id));
  const remaining = [...jobs];
  const stops: PlannedStop[] = [];
  const excluded: {jobId:string;reason:string}[] = [];
  const buffer = Math.max(0, input.minimumBufferMinutes ?? 5);
  const cap = Math.max(0, Math.floor(input.maxJobs));
  let clock = startMinute;
  let node = startNodeId;
  let driven = 0;
  let service = 0;
  let revenue = 0;

  while (remaining.length > 0 && stops.length < cap) {
    const choices = remaining.map(job => {
      const drive = travel(travelMinutes, node, job.locationId);
      const back = travel(travelMinutes, job.locationId, endNodeId);
      const arrival = clock + drive;
      const start = job.fixedStartMinute !== undefined
        ? Math.max(arrival, job.fixedStartMinute)
        : Math.max(arrival, job.earliestStartMinute ?? startMinute);
      const finish = start + Math.max(0, job.estimatedMinutes) + buffer;
      const meetsFixed = job.fixedStartMinute === undefined || arrival <= job.fixedStartMinute;
      const meetsWindow = finish <= (job.latestFinishMinute ?? endMinute);
      const feasible = byLocation.has(job.locationId) && Number.isFinite(drive) && Number.isFinite(back)
        && meetsFixed && meetsWindow && finish + back <= endMinute;
      return {job, drive, back, arrival, start, finish, feasible};
    }).filter(x => x.feasible);

    if (!choices.length) break;
    choices.sort((a,b) =>
      (a.job.fixedStartMinute !== undefined ? 0 : 1) - (b.job.fixedStartMinute !== undefined ? 0 : 1)
      || a.drive - b.drive || (b.job.priority ?? 0) - (a.job.priority ?? 0)
      || a.job.id.localeCompare(b.job.id));
    const chosen = choices[0];
    stops.push({
      jobId: chosen.job.id, locationId: chosen.job.locationId,
      arrivalMinute: chosen.arrival, startMinute: chosen.start,
      finishMinute: chosen.finish, driveMinutes: chosen.drive,
      waitMinutes: chosen.start - chosen.arrival
    });
    clock = chosen.finish;
    node = chosen.job.locationId;
    driven += chosen.drive;
    service += Math.max(0, chosen.job.estimatedMinutes);
    revenue += chosen.job.rateCents;
    remaining.splice(remaining.findIndex(j => j.id === chosen.job.id), 1);
  }

  for (const j of remaining) excluded.push({jobId:j.id, reason:stops.length >= cap ? 'job cap reached' : 'cannot fit within route and time constraints'});
  const returnDrive = travel(travelMinutes, node, endNodeId);
  return {
    stops, excluded, totalDriveMinutes: driven + (Number.isFinite(returnDrive) ? returnDrive : 0),
    returnDriveMinutes: Number.isFinite(returnDrive) ? returnDrive : 0,
    totalServiceMinutes: service, revenueCents: revenue,
    plannedFinishMinute: clock + (Number.isFinite(returnDrive) ? returnDrive : 0),
    feasible: Number.isFinite(returnDrive) && clock + returnDrive <= endMinute
  };
}
export function predictDuration(historyMinutes: number[], initialEstimate: number): { minutes: number; samples: number; confidence: 'low'|'medium'|'high' } {
  const filtered = historyMinutes.filter(n => Number.isFinite(n) && n > 0 && n < 1440);
  if (filtered.length === 0) return { minutes:initialEstimate, samples:0, confidence:'low' };
  // Robust median reduces the effect of one unusual visit.
  const sorted = [...filtered].sort((a,b) => a-b);
  const middle = Math.floor(sorted.length/2);
  const median = sorted.length % 2 ? sorted[middle] : (sorted[middle-1]+sorted[middle])/2;
  const weight = Math.min(0.9, sorted.length / (sorted.length + 3));
  return {minutes:Math.round((1-weight)*initialEstimate+weight*median),samples:sorted.length,confidence:sorted.length>=8?'high':sorted.length>=3?'medium':'low'};
}
