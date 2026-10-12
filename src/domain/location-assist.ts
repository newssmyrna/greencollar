/** Coarse, consent-gated location assistance. This module never starts/stops a timer. */
export type Coordinates = { latitude: number; longitude: number };
export type ProximityStatus = 'within_radius' | 'outside_radius' | 'uncertain' | 'unavailable';
export type ProximityAssessment = {
  status: ProximityStatus;
  /** Straight-line distance is used only for local geofence assistance, never road ETA. */
  distanceMeters?: number;
  accuracyMeters?: number;
};
export type ProximitySettings = { radiusMeters: number; maxAccuracyMeters: number };

const validCoordinates = (point: Coordinates) =>
  Number.isFinite(point.latitude) && Math.abs(point.latitude) <= 90
  && Number.isFinite(point.longitude) && Math.abs(point.longitude) <= 180;

function haversineMeters(a: Coordinates, b: Coordinates): number {
  const radians = (degrees: number) => degrees * Math.PI / 180;
  const lat1 = radians(a.latitude), lat2 = radians(b.latitude);
  const dLat = lat2 - lat1, dLon = radians(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 6371008.8 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

/**
 * Classify a single foreground location fix with its reported accuracy.
 * A confident result requires the full uncertainty radius to fit on one side
 * of the configured boundary. Borderline and poor-accuracy fixes are uncertain.
 */
export function assessProximity(
  target: Coordinates,
  fix: Coordinates & { accuracyMeters: number },
  settings: ProximitySettings
): ProximityAssessment {
  if (!validCoordinates(target) || !validCoordinates(fix)) throw new Error('Invalid coordinates');
  if (!Number.isFinite(fix.accuracyMeters) || fix.accuracyMeters < 0) throw new Error('Invalid location accuracy');
  if (!Number.isFinite(settings.radiusMeters) || settings.radiusMeters <= 0
    || !Number.isFinite(settings.maxAccuracyMeters) || settings.maxAccuracyMeters <= 0) {
    throw new Error('Invalid proximity settings');
  }
  if (fix.accuracyMeters > settings.maxAccuracyMeters) return { status: 'unavailable' };

  const distanceMeters = haversineMeters(target, fix);
  const uncertainty = fix.accuracyMeters;
  if (distanceMeters + uncertainty <= settings.radiusMeters) {
    return { status: 'within_radius', distanceMeters, accuracyMeters: uncertainty };
  }
  if (distanceMeters - uncertainty > settings.radiusMeters) {
    return { status: 'outside_radius', distanceMeters, accuracyMeters: uncertainty };
  }
  return { status: 'uncertain', distanceMeters, accuracyMeters: uncertainty };
}

export type LocationConfirmation = {
  jobId: string;
  operatorId: string;
  kind: 'arrival' | 'departure';
  confirmedAt: number;
  source: 'gps_suggestion' | 'manual';
  /** Coarse assessment only; exact coordinates are intentionally excluded. */
  proximity: ProximityStatus | 'manual';
  manualReason?: string;
};

/**
 * Create an audit event only after the operator confirms the action.
 * GPS can suggest arrival/departure but cannot itself alter timer or billing state.
 */
export function createLocationConfirmation(input: {
  jobId: string;
  operatorId: string;
  kind: 'arrival' | 'departure';
  confirmedAt: number;
  source: 'gps_suggestion' | 'manual';
  assessment?: ProximityAssessment;
  manualReason?: string;
}): LocationConfirmation {
  if (!input.jobId.trim() || !input.operatorId.trim()) throw new Error('Job and operator are required');
  if (!Number.isSafeInteger(input.confirmedAt) || input.confirmedAt < 0) throw new Error('Invalid confirmation time');

  let proximity: LocationConfirmation['proximity'];
  let manualReason: string | undefined;
  if (input.source === 'gps_suggestion') {
    if (!input.assessment) throw new Error('GPS assessment is required');
    const expected = input.kind === 'arrival' ? 'within_radius' : 'outside_radius';
    if (input.assessment.status !== expected) throw new Error('GPS signal does not support this confirmation');
    proximity = input.assessment.status;
  } else {
    if (!input.manualReason?.trim()) throw new Error('Manual confirmation reason is required');
    if (input.manualReason.trim().length > 280) throw new Error('Manual confirmation reason must be at most 280 characters');
    manualReason = input.manualReason.trim();
    proximity = input.assessment?.status ?? 'manual';
  }

  return {
    jobId: input.jobId,
    operatorId: input.operatorId,
    kind: input.kind,
    confirmedAt: input.confirmedAt,
    source: input.source,
    proximity,
    ...(manualReason ? { manualReason } : {})
  };
}
