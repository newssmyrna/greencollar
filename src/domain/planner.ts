import type { PlannerInput, PlanResult, PlannedStop, ServiceJob, TravelMatrix, ScheduledBreak } from './types';

/**
 * Transparent deterministic baseline scheduler, not a globally optimal route solver.
 * It selects feasible jobs greedily, honors fixed starts, service windows, scheduled
 * breaks, return-to-depot time, job caps and a configurable per-job buffer.
 * Travel matrices must come from a road routing provider in production.
 */
function travel(matrix: TravelMatrix, from: string, to: string): number {
  if (from === to) return 0;
  const n = matrix[from]?.[to];
  return typeof n === 'number' && Number.isFinite(n) && n >= 0 ? n : Infinity;
}

function normalizedBreaks(input: ScheduledBreak[] | undefined): ScheduledBreak[] {
  return (input ?? [])
    .filter(b => Number.isFinite(b.startMinute) && Number.isFinite(b.durationMinutes) && b.durationMinutes > 0)
    .map(b => ({ startMinute: b.startMinute, durationMinutes: b.durationMinutes }))
    .sort((a, b) => a.startMinute - b.startMinute);
}

/** Shift a contiguous activity past every fixed break it would overlap. */
function shiftPastBreaks(start: number, duration: number, breaks: ScheduledBreak[]): number {
  let candidate = start;
  for (const pause of breaks) {
    const end = pause.startMinute + pause.durationMinutes;
    if (candidate < end && candidate + duration > pause.startMinute) candidate = end;
  }
  return candidate;
}

type Candidate = {
  job: ServiceJob; drive: number; back: number; arrival: number;
  start: number; finish: number; feasible: boolean; reason?: string;
};

export function planDay(input: PlannerInput): PlanResult {
  const { jobs, locations, travelMinutes, startNodeId, endNodeId, startMinute, endMinute } = input;
  const byLocation = new Set(locations.map(l => l.id));
  const remaining = [...jobs];
  const stops: PlannedStop[] = [];
  const excluded: {jobId:string;reason:string}[] = [];
  const buffer = Math.max(0, input.minimumBufferMinutes ?? 5);
  const cap = Math.max(0, Math.floor(input.maxJobs));
  const breaks = normalizedBreaks(input.breaks);
  let clock = startMinute;
  let node = startNodeId;
  let driven = 0;
  let service = 0;
  let revenue = 0;

  const evaluate = (job: ServiceJob, fromNode: string, availableMinute: number): Candidate => {
    const drive = travel(travelMinutes, fromNode, job.locationId);
    const back = travel(travelMinutes, job.locationId, endNodeId);
    const invalid = (reason: string): Candidate => ({
      job, drive, back, arrival: availableMinute + (Number.isFinite(drive) ? drive : 0),
      start: availableMinute, finish: availableMinute, feasible: false, reason
    });
    if (!byLocation.has(job.locationId)) return invalid('job location is missing from the plan');
    if (!Number.isFinite(drive)) return invalid('no travel route to this location');
    if (!Number.isFinite(back)) return invalid('no travel route from this location back to the depot');

    // If a break interrupts the drive, wait until it ends before departing.
    const depart = shiftPastBreaks(availableMinute, drive, breaks);
    const arrival = depart + drive;
    const fixed = job.fixedStartMinute !== undefined;
    const start = fixed
      ? job.fixedStartMinute!
      : shiftPastBreaks(Math.max(arrival, job.earliestStartMinute ?? startMinute),
          Math.max(0, job.estimatedMinutes) + buffer, breaks);
    const finish = start + Math.max(0, job.estimatedMinutes) + buffer;
    if (fixed && arrival > start) return { ...invalid('fixed appointment cannot be reached in time'), arrival, start, finish };
    if (fixed && start < finish && breaks.some(b => start < b.startMinute + b.durationMinutes && finish > b.startMinute)) {
      return { ...invalid('fixed appointment overlaps a scheduled break'), arrival, start, finish };
    }
    if (finish > (job.latestFinishMinute ?? endMinute)) {
      return { ...invalid('service window closes before the visit can finish'), arrival, start, finish };
    }
    if (finish + back > endMinute) {
      return { ...invalid('visit and return trip exceed the workday'), arrival, start, finish };
    }
    return { job, drive, back, arrival, start, finish, feasible: true };
  };

  while (remaining.length > 0 && stops.length < cap) {
    const choices = remaining.map(job => evaluate(job, node, clock)).filter(x => x.feasible);
    if (!choices.length) break;
    choices.sort((a,b) => {
      const aFixed = a.job.fixedStartMinute;
      const bFixed = b.job.fixedStartMinute;
      if (aFixed !== undefined && bFixed === undefined) return -1;
      if (bFixed !== undefined && aFixed === undefined) return 1;
      if (aFixed !== undefined && bFixed !== undefined && aFixed !== bFixed) return aFixed - bFixed;

      const aSlack = (a.job.latestFinishMinute ?? endMinute) - a.finish;
      const bSlack = (b.job.latestFinishMinute ?? endMinute) - b.finish;
      return aSlack - bSlack
        || Number(Boolean(b.job.due)) - Number(Boolean(a.job.due))
        || (b.job.priority ?? 0) - (a.job.priority ?? 0)
        || a.drive - b.drive
        || a.job.id.localeCompare(b.job.id);
    });
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

  for (const job of remaining) {
    const reason = stops.length >= cap
      ? 'job cap reached'
      : evaluate(job, node, clock).reason ?? 'cannot fit within route and time constraints';
    excluded.push({jobId:job.id, reason});
  }
  const returnDrive = travel(travelMinutes, node, endNodeId);
  const returnAt = clock + (Number.isFinite(returnDrive) ? returnDrive : 0);
  const returnBreakAdjusted = shiftPastBreaks(clock, Number.isFinite(returnDrive) ? returnDrive : 0, breaks);
  const finalReturnAt = returnBreakAdjusted + (Number.isFinite(returnDrive) ? returnDrive : 0);
  // Include breaks encountered on the return drive in the planned finish time.
  const returnWait = returnBreakAdjusted - clock;
  return {
    stops, excluded, totalDriveMinutes: driven + (Number.isFinite(returnDrive) ? returnDrive : 0),
    returnDriveMinutes: Number.isFinite(returnDrive) ? returnDrive : 0,
    totalServiceMinutes: service, revenueCents: revenue,
    plannedFinishMinute: finalReturnAt,
    feasible: Number.isFinite(returnDrive) && finalReturnAt <= endMinute && returnAt + returnWait <= endMinute
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
