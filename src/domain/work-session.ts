/** Pure, serializable service-session state machine; timestamps are Unix milliseconds.
 * Clock input is provided by caller so this works offline and can be replayed/tested.
 * Persistence and server-side authorization are separate release requirements.
 */
export type WorkSession = {
  jobId: string;
  status: 'running' | 'paused' | 'completed';
  startedAt: number;
  lastResumedAt: number | null;
  lastTransitionAt: number;
  elapsedMs: number;
  completedAt: number | null;
  businessId: string | null;
  serviceDate: string | null;
  completionSaved: boolean;
};

type ScheduledVisit = { businessId: string; serviceDate: string };

function time(t: number) {
  if (!Number.isSafeInteger(t) || t < 0) throw new Error('Invalid timestamp');
  return t;
}

function validDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value)
    && !Number.isNaN(Date.parse(value))
    && new Date(value + 'T00:00:00Z').toISOString().slice(0, 10) === value;
}

export function startWork(jobId: string, at: number, visit?: ScheduledVisit): WorkSession {
  if (!jobId.trim()) throw new Error('Job ID required');
  if (visit && (!visit.businessId.trim() || !validDate(visit.serviceDate))) {
    throw new Error('Invalid scheduled visit');
  }
  return {
    jobId,
    status: 'running',
    startedAt: time(at),
    lastResumedAt: at,
    lastTransitionAt: at,
    elapsedMs: 0,
    completedAt: null,
    businessId: visit?.businessId ?? null,
    serviceDate: visit?.serviceDate ?? null,
    completionSaved: false
  };
}

function elapsed(s: WorkSession, at: number): number {
  time(at);
  if (at < s.startedAt) throw new Error('Time before job start');
  if (s.status !== 'running') return s.elapsedMs;
  if (s.lastResumedAt === null || at < s.lastResumedAt) throw new Error('Clock moved backwards');
  return s.elapsedMs + (at - s.lastResumedAt);
}

export function pauseWork(s: WorkSession, at: number): WorkSession {
  if (s.status !== 'running') throw new Error('Job is not running');
  const elapsedMs = elapsed(s, at);
  return { ...s, status: 'paused', elapsedMs, lastResumedAt: null, lastTransitionAt: at };
}

export function resumeWork(s: WorkSession, at: number): WorkSession {
  time(at);
  if (s.status !== 'paused') throw new Error('Job is not paused');
  if (at < s.startedAt) throw new Error('Time before job start');
  if (at < s.lastTransitionAt) throw new Error('Clock moved backwards');
  return { ...s, status: 'running', lastResumedAt: at, lastTransitionAt: at };
}

export function completeWork(s: WorkSession, at: number): WorkSession {
  if (s.status === 'completed') throw new Error('Job already completed');
  time(at);
  if (at < s.lastTransitionAt) throw new Error('Clock moved backwards');
  const elapsedMs = elapsed(s, at);
  return { ...s, status: 'completed', elapsedMs, lastResumedAt: null, lastTransitionAt: at, completedAt: at };
}

export function getElapsedMinutes(s: WorkSession, at: number): number {
  return Math.max(0, Math.ceil(elapsed(s, at) / 60000));
}

export function completionRecord(s: WorkSession) {
  if (s.status !== 'completed' || s.completedAt === null) throw new Error('Completion required');
  return {
    jobId: s.jobId,
    startedAt: s.startedAt,
    completedAt: s.completedAt,
    actualMinutes: getElapsedMinutes(s, s.completedAt)
  };
}
