import type { TravelMatrix } from '../domain/types';

export const SAMPLE_DEPOT_ID = 'preview-depot';
export const SAMPLE_RETURN_ID = '@sample-return';
export const SAMPLE_LUNCH_MINIMUM_AFTER_SHIFT_MINUTES = 180;

export type IllustrativeRouteStop = {
  id: string;
  locationId: string;
  serviceMinutes: number;
  earliestStartMinute?: number | null;
  latestFinishMinute?: number | null;
  fixedStartMinute?: number | null;
};

export type SampleRouteConflict = {
  kind: 'missing_travel' | 'fixed_start' | 'latest_finish' | 'workday_finish' | 'lunch_slot';
  stopId?: string;
  message: string;
};

export type SampleRouteLeg = {
  fromId: string;
  toId: string;
  driveMinutes: number;
  departureMinute: number;
  arrivalMinute: number;
  isReturn: boolean;
};

export type SampleRouteStopSchedule = {
  id: string;
  locationId: string;
  arrivalMinute: number;
  startMinute: number;
  finishMinute: number;
  driveMinutes: number;
  waitMinutes: number;
  serviceMinutes: number;
};

export type SampleLunchSchedule = {
  afterVisitId: string;
  startMinute: number;
  finishMinute: number;
  durationMinutes: 30 | 60;
};

export type SampleDelaySchedule = {
  beforeId: string;
  startMinute: number;
  finishMinute: number;
  durationMinutes: number;
};

export type SampleRouteEstimate = {
  startMinute: number;
  finishMinute: number;
  totalDriveMinutes: number;
  returnDriveMinutes: number;
  totalServiceMinutes: number;
  lunch?: SampleLunchSchedule;
  delay?: SampleDelaySchedule;
  stops: SampleRouteStopSchedule[];
  legs: SampleRouteLeg[];
  conflicts: SampleRouteConflict[];
  feasible: boolean;
};

export type SampleLunchSlot = {
  afterVisitId: string;
  startMinute: number;
  finishMinute: number;
  durationMinutes: 30 | 60;
  feasible: boolean;
  reason?: string;
  schedule: SampleRouteEstimate;
};

// Deliberately synthetic, symmetric sample matrix for the three built-in locations.
// It is only a timing illustration; unknown added locations use a deterministic sample pattern.
const SAMPLE_MATRIX_BY_POSITION = [
  [0, 12, 18, 24],
  [12, 0, 14, 21],
  [18, 14, 0, 15],
  [24, 21, 15, 0],
] as const;

function sampleTravelAt(fromPosition: number, toPosition: number): number {
  if (fromPosition === toPosition) return 0;
  if (fromPosition < SAMPLE_MATRIX_BY_POSITION.length && toPosition < SAMPLE_MATRIX_BY_POSITION.length)
    return SAMPLE_MATRIX_BY_POSITION[fromPosition][toPosition];
  return 10 + Math.abs(fromPosition - toPosition) * 3 + ((fromPosition * 7 + toPosition * 5) % 4);
}

/** Build a local-only travel matrix from sample stop order, without coordinates or a routing provider. */
export function buildIllustrativeTravelMatrix(locationIds: readonly string[]): TravelMatrix {
  const uniqueLocationIds = [...new Set(locationIds.filter(id => typeof id === 'string' && id.trim()))];
  const nodeIds = [SAMPLE_DEPOT_ID, ...uniqueLocationIds];
  return Object.fromEntries(nodeIds.map((from, fromIndex) => [
    from,
    Object.fromEntries(nodeIds.map((to, toIndex) => [to, sampleTravelAt(fromIndex, toIndex)])),
  ]));
}

function validMinute(value: number | null | undefined): value is number {
  return value === undefined || value === null || (Number.isInteger(value) && value >= 0 && value <= 1440);
}

function readTravel(matrix: TravelMatrix, from: string, to: string): number | undefined {
  if (from === to) return 0;
  const value = matrix[from]?.[to];
  return Number.isInteger(value) && value >= 0 ? value : undefined;
}

export function estimateIllustrativeRoute(input: {
  stops: readonly IllustrativeRouteStop[];
  travelMinutes: TravelMatrix;
  startMinute: number;
  endMinute: number;
  /** Sample route origin after the worker has already made progress. */
  startNodeId?: string;
  /** Optional lunch anchor at the current position before the first remaining stop. */
  lunchAtStartAfterVisitId?: string | null;
  /** Preserve the original shift's lunch threshold when estimating remaining stops. */
  lunchNotBeforeMinute?: number;
  lunchDurationMinutes?: 30 | 60;
  lunchAfterVisitId?: string | null;
  delayMinutes?: number;
  delayBeforeId?: string | null;
}): SampleRouteEstimate {
  const conflicts: SampleRouteConflict[] = [];
  const stops: SampleRouteStopSchedule[] = [];
  const legs: SampleRouteLeg[] = [];
  const ids = new Set<string>();
  if (!Number.isInteger(input.startMinute) || input.startMinute < 0 || input.startMinute > 1439
    || !Number.isInteger(input.endMinute) || input.endMinute < 1 || input.endMinute > 1440)
    throw new Error('Enter a valid local workday start and finish.');
  if (input.endMinute <= input.startMinute)
    conflicts.push({ kind: 'workday_finish', message: `The chosen start is at or after the ${formatSampleClock(input.endMinute)} workday limit.` });
  if (input.stops.some(stop => !stop.id || !stop.locationId || !Number.isInteger(stop.serviceMinutes)
    || stop.serviceMinutes < 0 || stop.serviceMinutes > 1440
    || !validMinute(stop.earliestStartMinute) || !validMinute(stop.latestFinishMinute) || !validMinute(stop.fixedStartMinute)))
    throw new Error('The sample route has invalid stop or service-time data.');
  for (const stop of input.stops) {
    if (ids.has(stop.id)) throw new Error('The sample route contains duplicate stop IDs.');
    ids.add(stop.id);
  }
  const delayMinutes = input.delayMinutes ?? 0;
  if (!Number.isInteger(delayMinutes) || delayMinutes < 0 || delayMinutes > 120 || delayMinutes % 15 !== 0)
    throw new Error('Delay adjustment must be a 15-minute step from 0 to 120 minutes.');
  if (input.lunchDurationMinutes !== undefined && input.lunchDurationMinutes !== 30 && input.lunchDurationMinutes !== 60)
    throw new Error('Choose a 30- or 60-minute sample lunch.');
  if (input.lunchAfterVisitId && !input.stops.some(stop => stop.id === input.lunchAfterVisitId)
    && input.lunchAtStartAfterVisitId !== input.lunchAfterVisitId)
    conflicts.push({ kind: 'lunch_slot', message: 'The selected lunch slot is no longer on this route. Choose another slot.' });

  let clock = input.startMinute;
  let node = input.startNodeId ?? SAMPLE_DEPOT_ID;
  let totalDriveMinutes = 0;
  let totalServiceMinutes = 0;
  let returnDriveMinutes = 0;
  let lunch: SampleLunchSchedule | undefined;
  let delay: SampleDelaySchedule | undefined;

  if (input.lunchAtStartAfterVisitId && input.lunchAfterVisitId === input.lunchAtStartAfterVisitId
    && input.lunchDurationMinutes) {
    lunch = { afterVisitId: input.lunchAtStartAfterVisitId, startMinute: clock,
      finishMinute: clock + input.lunchDurationMinutes, durationMinutes: input.lunchDurationMinutes };
    const lunchThreshold = input.lunchNotBeforeMinute
      ?? Math.max(input.startMinute + SAMPLE_LUNCH_MINIMUM_AFTER_SHIFT_MINUTES, 11 * 60);
    if (lunch.startMinute < lunchThreshold)
      conflicts.push({ kind: 'lunch_slot', message: `Lunch can start after ${formatSampleClock(lunchThreshold)} in this sample schedule.` });
    clock = lunch.finishMinute;
  }

  for (const stop of input.stops) {
    if (delayMinutes > 0 && input.delayBeforeId === stop.id) {
      delay = { beforeId: stop.id, startMinute: clock, finishMinute: clock + delayMinutes, durationMinutes: delayMinutes };
      clock += delayMinutes;
    }
    const driveMinutes = readTravel(input.travelMinutes, node, stop.locationId);
    if (driveMinutes === undefined) {
      conflicts.push({ kind: 'missing_travel', stopId: stop.id, message: `No illustrative travel time is available before stop ${stops.length + 1}.` });
      break;
    }
    const departureMinute = clock;
    const arrivalMinute = departureMinute + driveMinutes;
    legs.push({ fromId: node, toId: stop.locationId, driveMinutes, departureMinute, arrivalMinute, isReturn: false });
    totalDriveMinutes += driveMinutes;

    let startMinute = arrivalMinute;
    if (stop.fixedStartMinute != null) {
      if (arrivalMinute > stop.fixedStartMinute) {
        conflicts.push({ kind: 'fixed_start', stopId: stop.id,
          message: `Stop ${stops.length + 1} would arrive ${arrivalMinute - stop.fixedStartMinute} min after its ${formatSampleClock(stop.fixedStartMinute)} fixed start.` });
      } else startMinute = stop.fixedStartMinute;
    } else if (stop.earliestStartMinute != null) startMinute = Math.max(arrivalMinute, stop.earliestStartMinute);

    const finishMinute = startMinute + stop.serviceMinutes;
    if (stop.latestFinishMinute != null && finishMinute > stop.latestFinishMinute)
      conflicts.push({ kind: 'latest_finish', stopId: stop.id,
        message: `Stop ${stops.length + 1} would finish ${finishMinute - stop.latestFinishMinute} min after its ${formatSampleClock(stop.latestFinishMinute)} latest finish.` });
    if (finishMinute > input.endMinute)
      conflicts.push({ kind: 'workday_finish', stopId: stop.id,
        message: `Stop ${stops.length + 1} would finish after the ${formatSampleClock(input.endMinute)} workday limit.` });
    const scheduledStop = {
      id: stop.id, locationId: stop.locationId, arrivalMinute, startMinute, finishMinute,
      driveMinutes, waitMinutes: startMinute - arrivalMinute, serviceMinutes: stop.serviceMinutes,
    };
    stops.push(scheduledStop);
    totalServiceMinutes += stop.serviceMinutes;
    clock = finishMinute;
    node = stop.locationId;

    if (input.lunchAfterVisitId === stop.id && input.lunchDurationMinutes) {
      lunch = { afterVisitId: stop.id, startMinute: clock,
        finishMinute: clock + input.lunchDurationMinutes, durationMinutes: input.lunchDurationMinutes };
      if (lunch.startMinute < (input.lunchNotBeforeMinute
        ?? Math.max(input.startMinute + SAMPLE_LUNCH_MINIMUM_AFTER_SHIFT_MINUTES, 11 * 60)))
        conflicts.push({ kind: 'lunch_slot', stopId: stop.id,
          message: `Lunch can start after ${formatSampleClock(Math.max(input.startMinute + SAMPLE_LUNCH_MINIMUM_AFTER_SHIFT_MINUTES, 11 * 60))} in this sample schedule.` });
      clock = lunch.finishMinute;
    }
  }

  if (stops.length === input.stops.length) {
    if ((input.stops.length > 0 || node !== SAMPLE_DEPOT_ID)
      && delayMinutes > 0 && input.delayBeforeId === SAMPLE_RETURN_ID) {
      delay = { beforeId: SAMPLE_RETURN_ID, startMinute: clock, finishMinute: clock + delayMinutes, durationMinutes: delayMinutes };
      clock += delayMinutes;
    }
    const driveMinutes = input.stops.length === 0 && node === SAMPLE_DEPOT_ID
      ? 0 : readTravel(input.travelMinutes, node, SAMPLE_DEPOT_ID);
    if (driveMinutes === undefined) conflicts.push({ kind: 'missing_travel',
      message: 'No illustrative return-to-depot travel time is available.' });
    else {
      const departureMinute = clock;
      const arrivalMinute = departureMinute + driveMinutes;
      if (input.stops.length > 0 || node !== SAMPLE_DEPOT_ID)
        legs.push({ fromId: node, toId: SAMPLE_DEPOT_ID, driveMinutes, departureMinute, arrivalMinute, isReturn: true });
      returnDriveMinutes = driveMinutes;
      totalDriveMinutes += driveMinutes;
      clock = arrivalMinute;
    }
  }
  if (input.lunchDurationMinutes && input.lunchAfterVisitId && !lunch
    && !conflicts.some(conflict => conflict.kind === 'lunch_slot'))
    conflicts.push({ kind: 'lunch_slot', message: 'The selected lunch slot could not be placed on this route.' });
  if (stops.length === input.stops.length && clock > input.endMinute)
    conflicts.push({ kind: 'workday_finish', message: `The return to the sample depot would finish ${clock - input.endMinute} min after the ${formatSampleClock(input.endMinute)} workday limit.` });

  return { startMinute: input.startMinute, finishMinute: clock, totalDriveMinutes, returnDriveMinutes,
    totalServiceMinutes, lunch, delay, stops, legs, conflicts, feasible: conflicts.length === 0 };
}

export function findIllustrativeLunchSlots(input: {
  stops: readonly IllustrativeRouteStop[];
  travelMinutes: TravelMatrix;
  startMinute: number;
  endMinute: number;
  startNodeId?: string;
  startAfterVisitId?: string | null;
  lunchNotBeforeMinute?: number;
  durationMinutes: 30 | 60;
  delayMinutes?: number;
  delayBeforeId?: string | null;
}): SampleLunchSlot[] {
  const candidates = [
    ...(input.startAfterVisitId ? [{ id: input.startAfterVisitId, atStart: true }] : []),
    ...input.stops.map(stop => ({ id: stop.id, atStart: false })),
  ].filter((candidate, index, all) => all.findIndex(item => item.id === candidate.id) === index);
  return candidates.map(candidate => {
    const schedule = estimateIllustrativeRoute({ ...input, lunchDurationMinutes: input.durationMinutes,
      lunchAfterVisitId: candidate.id,
      ...(candidate.atStart ? { lunchAtStartAfterVisitId: candidate.id } : {}),
    });
    const lunch = schedule.lunch;
    const earlyThreshold = input.lunchNotBeforeMinute
      ?? Math.max(input.startMinute + SAMPLE_LUNCH_MINIMUM_AFTER_SHIFT_MINUTES, 11 * 60);
    const tooEarly = lunch !== undefined && lunch.startMinute < earlyThreshold;
    const reason = tooEarly
      ? `Lunch needs to start at or after ${formatSampleClock(earlyThreshold)} in this sample policy.`
      : schedule.conflicts[0]?.message;
    return {
      afterVisitId: candidate.id,
      startMinute: lunch?.startMinute ?? schedule.stops.find(item => item.id === candidate.id)?.finishMinute ?? input.startMinute,
      finishMinute: lunch?.finishMinute ?? input.startMinute,
      durationMinutes: input.durationMinutes,
      feasible: schedule.feasible && !tooEarly,
      reason,
      schedule,
    };
  });
}

export function formatSampleClock(totalMinutes: number): string {
  const wrapped = ((totalMinutes % 1440) + 1440) % 1440;
  const hour = Math.floor(wrapped / 60);
  const suffix = hour < 12 ? 'AM' : 'PM';
  return `${hour % 12 || 12}:${String(wrapped % 60).padStart(2, '0')} ${suffix}`;
}

