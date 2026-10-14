import type { PersistedInvoiceDraft } from '../data/invoice-draft-api';
import type { DayData } from '../data/greencollar-api';
import { billableCompletedServices, invoiceFromCompletedService } from '../domain/completed-invoice';
import { buildDailyWorkflow } from '../domain/daily-workflow';
import { setInvoiceDueDays } from '../domain/invoice';
import type { Agreement } from '../domain/recurrence';
import type { LocalDemoWorkspace, LocalDemoWorkday } from './local-demo-store';

function agreementsFor(workspace: LocalDemoWorkspace): Agreement[] {
  return workspace.agreements.map(agreement => ({
    id: agreement.id,
    customerId: agreement.customer_id,
    locationId: agreement.location_id,
    serviceName: agreement.service_name,
    rateCents: agreement.rate_cents,
    estimatedMinutes: agreement.estimated_minutes,
    startsOn: agreement.starts_on,
    endsOn: agreement.ends_on ?? undefined,
    frequency: agreement.frequency as Agreement['frequency'],
    intervalDays: agreement.interval_days ?? undefined,
    daysOfWeek: agreement.days_of_week ? JSON.parse(agreement.days_of_week) as number[] : undefined,
    active: agreement.active === 1,
    preferredStartMinute: agreement.preferred_start_minute ?? undefined,
    preferredFinishMinute: agreement.preferred_finish_minute ?? undefined,
    fixedStartMinute: agreement.fixed_start_minute ?? undefined,
  }));
}

export function buildLocalDemoPlan(
  workspace: LocalDemoWorkspace,
  date: string,
  hours: string,
  maxJobs: string,
) {
  if (!/^\d+(\.\d{1,2})?$/.test(hours) || Number(hours) < 0.25 || Number(hours) > 16)
    throw new Error('Enter available hours from 0.25 to 16, using up to two decimal places. The sample workday starts at 08:00.');
  if (!/^\d+$/.test(maxJobs) || Number(maxJobs) < 1 || Number(maxJobs) > 200)
    throw new Error('Enter a whole job limit from 1 to 200.');

  const existing = workspace.workdays.find(day => day.date === date);
  if (existing?.workSession && existing.workSession.status !== 'completed')
    throw new Error('Pause or complete the active sample visit before rebuilding this workday.');
  const startMinute = 8 * 60;
  const endMinute = Math.min(1440, startMinute + Math.round(Number(hours) * 60));
  const nodes = ['preview-depot', ...workspace.locations.map(location => location.id)];
  const travelMinutes = Object.fromEntries(nodes.map(from => [from, Object.fromEntries(nodes.map(to => [to, 0]))]));
  const durationHistoryByAgreement: Record<string, number[]> = {};
  for (const day of workspace.workdays.filter(item => item.date < date)) {
    for (const visit of day.visits) {
      if (visit.status !== 'completed' || visit.actual_minutes === null) continue;
      (durationHistoryByAgreement[visit.agreement_id] ??= []).push(visit.actual_minutes);
    }
  }
  const due = buildDailyWorkflow({
    date,
    agreements: agreementsFor(workspace),
    locations: workspace.locations.map(location => ({
      id: location.id,
      customerId: location.customer_id,
      label: 'Sample location',
      address: location.address,
      lat: location.lat ?? 0,
      lon: location.lon ?? 0,
      notes: location.preferences ?? undefined,
    })),
    travelMinutes,
    startNodeId: 'preview-depot',
    endNodeId: 'preview-depot',
    startMinute,
    endMinute,
    maxJobs: Number(maxJobs),
    durationHistoryByAgreement,
    completedVisitIds: (existing?.visits ?? []).filter(visit => visit.status === 'completed').map(visit => `${visit.agreement_id}:${date}`),
    skippedVisitIds: (existing?.visits ?? []).filter(visit => visit.status === 'skipped').map(visit => `${visit.agreement_id}:${date}`),
  });
  const workday: LocalDemoWorkday = {
    date,
    hours,
    maxJobs,
    startMinute,
    endMinute,
    dayStartedAt: existing?.dayStartedAt ?? (existing?.workSession ? existing.workSession.startedAt : null),
    plannedVisitIds: due.stops.map(stop => stop.jobId),
    lunchDurationMinutes: existing?.lunchDurationMinutes ?? 30,
    lunchAfterVisitId: existing
      ? existing.lunchAfterVisitId && due.stops.some(stop => stop.jobId === existing.lunchAfterVisitId)
        ? existing.lunchAfterVisitId : null
      : due.stops[due.stops.length - 1]?.jobId ?? null,
    delayMinutes: existing?.delayMinutes ?? 0,
    unscheduledVisitIds: due.unscheduledVisitIds,
    approvedQueueKey: null,
    arrivedVisitId: existing?.arrivedVisitId && due.stops.some(stop => stop.jobId === existing.arrivedVisitId)
      ? existing.arrivedVisitId : null,
    travelingVisitId: existing?.travelingVisitId && due.stops.some(stop => stop.jobId === existing.travelingVisitId)
      ? existing.travelingVisitId : null,
    photosByVisitId: existing?.photosByVisitId ?? {},
    workSession: existing?.workSession?.status === 'completed' ? existing.workSession : null,
    visits: existing?.visits ?? [],
    invoiceDrafts: existing?.invoiceDrafts ?? [],
  };
  return { workday, plan: due };
}

/** Mark a local sample day started once, without starting or replacing its job timer. */
export function beginLocalDemoWorkday(workday: LocalDemoWorkday, startedAt: number): LocalDemoWorkday {
  if (!Number.isSafeInteger(startedAt) || startedAt < 0) throw new Error('Workday start time must be a valid timestamp.');
  if (workday.dayStartedAt !== undefined && workday.dayStartedAt !== null) return workday;
  return { ...workday, dayStartedAt: workday.workSession?.startedAt ?? startedAt };
}

/** Mark a planned visit as the current synthetic travel leg in the local preview. */
export function beginLocalDemoTravel(workday: LocalDemoWorkday, visitId: string): LocalDemoWorkday {
  if (workday.dayStartedAt == null) throw new Error('Start the sample day before beginning travel.');
  if (!workday.plannedVisitIds.includes(visitId)) throw new Error('Choose an assigned sample stop.');
  if (workday.workSession && workday.workSession.status !== 'completed')
    throw new Error('Pause or finish the active sample visit before traveling.');
  if (workday.arrivedVisitId === visitId) return workday;
  if (workday.travelingVisitId && workday.travelingVisitId !== visitId)
    throw new Error('Confirm arrival at the current sample stop before traveling to another.');
  if (workday.travelingVisitId === visitId) return workday;
  return { ...workday, travelingVisitId: visitId, arrivedVisitId: null };
}

/** Confirm arrival only after the matching local sample travel leg has begun. */
export function confirmLocalDemoArrival(workday: LocalDemoWorkday, visitId: string): LocalDemoWorkday {
  if (workday.dayStartedAt == null) throw new Error('Start the sample day before confirming arrival.');
  if (!workday.plannedVisitIds.includes(visitId)) throw new Error('Choose an assigned sample stop.');
  if (workday.workSession && workday.workSession.status !== 'completed')
    throw new Error('Finish the active sample visit before confirming another arrival.');
  if (workday.travelingVisitId !== visitId)
    throw new Error('Begin sample travel to this stop before confirming arrival.');
  return { ...workday, travelingVisitId: null, arrivedVisitId: visitId };
}

export function prepareLocalDemoInvoiceDrafts(
  day: DayData,
  businessId: string,
  existing: readonly PersistedInvoiceDraft[],
): PersistedInvoiceDraft[] {
  const byVisit = new Map(existing.map(draft => [draft.serviceVisitId, draft]));
  for (const service of billableCompletedServices(day, businessId)) {
    if (byVisit.has(service.visitId)) continue;
    const invoice = setInvoiceDueDays(
      invoiceFromCompletedService(service, `preview-invoice-${service.visitId.replace(/[^a-zA-Z0-9_-]/g, '-')}`, service.visitDate),
      14,
    );
    byVisit.set(service.visitId, { ...invoice, serviceVisitId: service.visitId });
  }
  return [...byVisit.values()];
}
