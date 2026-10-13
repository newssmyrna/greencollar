import type { SavedCustomer } from '../data/customer-api';
import type { DayData } from '../data/greencollar-api';
import { validRecordId, type SavedServiceLocation } from '../domain/service-location';
import type { SavedServiceAgreement } from '../data/service-agreement-api';
import { generateDueVisits, type Agreement } from '../domain/recurrence';
import { localCalendarDate, validCalendarDate } from '../domain/service-agreement';

export const LOCAL_DEMO_STORAGE_KEY = 'greencollar.preview.workspace.v1';

export type DemoCustomerFixture = {
  name: string;
  address: string;
  service: string;
  rate: number;
  minutes: number;
  notes: string;
};

export const demoCustomerFixtures: readonly DemoCustomerFixture[] = [
  { name: 'Example Customer 1', address: 'Sample service location 1, Demo City, FL', service: 'Exterior maintenance', rate: 65, minutes: 45, notes: 'Sample access note.' },
  { name: 'Example Customer 2', address: 'Sample service location 2, Demo City, FL', service: 'Pool service', rate: 80, minutes: 35, notes: 'Sample arrival preference.' },
  { name: 'Example Customer 3', address: 'Sample service location 3, Demo City, FL', service: 'Property cleanup', rate: 110, minutes: 90, notes: 'Sample entry note.' },
];

export type LocalDemoWorkspace = {
  version: 1;
  customers: SavedCustomer[];
  locations: SavedServiceLocation[];
  agreements: SavedServiceAgreement[];
};

export type DemoStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

export type DemoWorkspaceLoad = {
  workspace: LocalDemoWorkspace;
  persistence: 'browser' | 'session';
  notice?: string;
};

function browserStorage(): DemoStorage | undefined {
  try {
    if (typeof window === 'undefined') return undefined;
    return window.localStorage;
  } catch {
    return undefined;
  }
}

export function createInitialDemoWorkspace(date = localCalendarDate()): LocalDemoWorkspace {
  const customers: SavedCustomer[] = demoCustomerFixtures.map((fixture, index) => ({
    id: `preview-customer-${index + 1}`,
    name: fixture.name,
    phone: null,
    email: null,
    notes: fixture.notes,
    created_at: `${date}T12:00:00.000Z`,
  }));
  const locations: SavedServiceLocation[] = demoCustomerFixtures.map((fixture, index) => ({
    id: `preview-location-${index + 1}`,
    customer_id: customers[index].id,
    address: fixture.address,
    preferences: fixture.notes,
    lat: null,
    lon: null,
  }));
  const agreements: SavedServiceAgreement[] = demoCustomerFixtures.map((fixture, index) => ({
    id: `preview-agreement-${index + 1}`,
    customer_id: customers[index].id,
    location_id: locations[index].id,
    service_name: fixture.service,
    rate_cents: fixture.rate * 100,
    estimated_minutes: fixture.minutes,
    starts_on: date,
    ends_on: null,
    frequency: 'weekly',
    interval_days: null,
    days_of_week: null,
    preferred_start_minute: null,
    preferred_finish_minute: null,
    fixed_start_minute: null,
    active: 1,
    address: fixture.address,
    preferences: fixture.notes,
    lat: null,
    lon: null,
  }));
  return { version: 1, customers, locations, agreements };
}

function isWorkspace(value: unknown): value is LocalDemoWorkspace {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<LocalDemoWorkspace>;
  if (candidate.version !== 1
    || !Array.isArray(candidate.customers)
    || !Array.isArray(candidate.locations)
    || !Array.isArray(candidate.agreements)) return false;
  const customers = candidate.customers as unknown[];
  const locations = candidate.locations as unknown[];
  const agreements = candidate.agreements as unknown[];
  const isText = (item: unknown, maximum: number, required = false) =>
    typeof item === 'string' && item.length <= maximum && (!required || !!item.trim());
  const isNullableText = (item: unknown, maximum: number) => item === null || isText(item, maximum);
  const ids = new Set<string>();
  for (const item of customers) {
    if (!item || typeof item !== 'object') return false;
    const row = item as Partial<SavedCustomer>;
    const id = typeof row.id === 'string' ? row.id : '';
    if (!validRecordId(id) || !isText(row.name, 160, true)
      || !isNullableText(row.phone, 50) || !isNullableText(row.email, 254)
      || !isNullableText(row.notes, 2000) || !isText(row.created_at, 40, true)
      || ids.has(id)) return false;
    ids.add(id);
  }
  const customerIds = ids;
  const locationIds = new Set<string>();
  for (const item of locations) {
    if (!item || typeof item !== 'object') return false;
    const row = item as Partial<SavedServiceLocation>;
    const id = typeof row.id === 'string' ? row.id : '';
    const customerId = typeof row.customer_id === 'string' ? row.customer_id : '';
    if (!validRecordId(id) || !validRecordId(customerId)
      || !customerIds.has(customerId) || !isText(row.address, 500, true)
      || !isNullableText(row.preferences, 2000)
      || !((row.lat === null && row.lon === null)
        || (typeof row.lat === 'number' && Number.isFinite(row.lat) && Math.abs(row.lat) <= 90
          && typeof row.lon === 'number' && Number.isFinite(row.lon) && Math.abs(row.lon) <= 180))
      || locationIds.has(id)) return false;
    locationIds.add(id);
  }
  const locationRows = new Map(locations.map(item => {
    const row = item as SavedServiceLocation;
    return [row.id, row];
  }));
  const agreementIds = new Set<string>();
  for (const item of agreements) {
    if (!item || typeof item !== 'object') return false;
    const row = item as Partial<SavedServiceAgreement>;
    const id = typeof row.id === 'string' ? row.id : '';
    const customerId = typeof row.customer_id === 'string' ? row.customer_id : '';
    const locationId = typeof row.location_id === 'string' ? row.location_id : '';
    const location = locationRows.get(locationId);
    let weekdays: unknown;
    if (row.days_of_week === null) weekdays = null;
    else if (typeof row.days_of_week === 'string') {
      try { weekdays = JSON.parse(row.days_of_week); }
      catch { return false; }
    } else return false;
    const validMinute = (minute: unknown, allowEndOfDay: boolean) => minute === null
      || (typeof minute === 'number' && Number.isInteger(minute) && minute >= 0 && minute <= (allowEndOfDay ? 1440 : 1439));
    if (!validRecordId(id) || !validRecordId(customerId)
      || !validRecordId(locationId) || !location || location.customer_id !== customerId
      || !isText(row.service_name, 160, true)
      || !Number.isSafeInteger(row.rate_cents) || (row.rate_cents ?? -1) < 0 || (row.rate_cents ?? Infinity) > 100000000
      || !Number.isInteger(row.estimated_minutes) || (row.estimated_minutes ?? 0) < 1 || (row.estimated_minutes ?? Infinity) > 1440
      || !validCalendarDate(row.starts_on ?? '')
      || (row.ends_on !== null && (!validCalendarDate(row.ends_on ?? '') || (row.ends_on ?? '') < (row.starts_on ?? '')))
      || !['daily', 'weekly', 'biweekly', 'monthly', 'custom'].includes(row.frequency ?? '')
      || (row.frequency === 'custom'
        ? !Number.isInteger(row.interval_days) || (row.interval_days ?? 0) < 1 || (row.interval_days ?? Infinity) > 366
        : row.interval_days !== null)
      || (weekdays !== null && (!Array.isArray(weekdays) || weekdays.some(day => !Number.isInteger(day) || day < 0 || day > 6)))
      || !validMinute(row.preferred_start_minute, false)
      || !validMinute(row.preferred_finish_minute, true)
      || !validMinute(row.fixed_start_minute, false)
      || (row.active !== 0 && row.active !== 1) || agreementIds.has(id)) return false;
    agreementIds.add(id);
  }
  return true;
}

export function loadLocalDemoWorkspace(
  storage: DemoStorage | undefined = browserStorage(),
  date = localCalendarDate(),
): DemoWorkspaceLoad {
  const initial = createInitialDemoWorkspace(date);
  if (!storage) {
    return {
      workspace: initial,
      persistence: 'session',
      notice: 'Browser storage is unavailable. Preview edits stay in this open page and are cleared when it reloads.',
    };
  }
  try {
    const saved = storage.getItem(LOCAL_DEMO_STORAGE_KEY);
    if (saved === null) return { workspace: initial, persistence: 'browser' };
    const parsed: unknown = JSON.parse(saved);
    if (isWorkspace(parsed)) return { workspace: parsed, persistence: 'browser' };
    return {
      workspace: initial,
      persistence: 'browser',
      notice: 'Saved preview data could not be read. Reset the demo workspace to replace it with sample fixtures.',
    };
  } catch {
    return {
      workspace: initial,
      persistence: 'session',
      notice: 'Browser storage could not be read. Preview edits stay in this open page and are cleared when it reloads.',
    };
  }
}

export function saveLocalDemoWorkspace(
  workspace: LocalDemoWorkspace,
  storage: DemoStorage | undefined = browserStorage(),
): boolean {
  if (!storage) return false;
  try {
    storage.setItem(LOCAL_DEMO_STORAGE_KEY, JSON.stringify(workspace));
    return true;
  } catch {
    return false;
  }
}

export function clearLocalDemoWorkspace(
  storage: DemoStorage | undefined = browserStorage(),
): boolean {
  if (!storage) return false;
  try {
    storage.removeItem(LOCAL_DEMO_STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}

export function createDemoRecordId(kind: 'customer' | 'location' | 'agreement'): string {
  const suffix = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
  return `preview-${kind}-${suffix}`;
}

export function demoDayForDate(workspace: LocalDemoWorkspace, date: string): DayData {
  const agreements: Agreement[] = workspace.agreements.map((agreement) => ({
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
  const due = generateDueVisits(agreements, date, date);
  return {
    date,
    planningStatus: 'source-data-only',
    roadOptimization: false,
    customers: workspace.customers.map((customer) => ({
      id: customer.id,
      name: customer.name,
      phone: customer.phone,
      notes: customer.notes,
    })),
    agreements: workspace.agreements,
    visits: due.map((visit) => ({
      agreement_id: visit.agreementId,
      scheduled_date: visit.date,
      status: 'pending',
      actual_minutes: null,
    })),
    durationHistory: [],
  };
}
