import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  BackHandler, Keyboard, KeyboardAvoidingView, Modal, Platform, Pressable,
  SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions,
} from 'react-native';
import type { SavedCustomer } from '../data/customer-api';
import type { SavedServiceAgreement } from '../data/service-agreement-api';
import type { SavedServiceLocation } from '../domain/service-location';
import { completeWork, getElapsedMinutes, pauseWork, resumeWork, startWork, type WorkSession } from '../domain/work-session';
import { dollarsToCents, localCalendarDate, validCalendarDate } from '../domain/service-agreement';
import {
  clearLocalDemoWorkspace, createDemoRecordId, createInitialDemoWorkspace,
  createDemoVisitId, demoDayForDate, loadLocalDemoWorkspace, saveLocalDemoWorkspace,
  type LocalDemoWorkday, type LocalDemoWorkspace,
} from '../demo/local-demo-store';
import { buildLocalDemoPlan } from '../demo/local-demo-workday';

type Tab = 'Today' | 'Customers' | 'Planner' | 'Schedule' | 'Invoices';
type Role = 'Owner' | 'Worker';
type CustomerDraft = { name: string; address: string; phone: string; email: string; notes: string };
type JobDraft = { customerId: string; service: string; price: string; minutes: string; date: string; cadence: 'once' | 'weekly' };

const blankCustomer = (): CustomerDraft => ({ name: '', address: '', phone: '', email: '', notes: '' });
const blankJob = (date = localCalendarDate(), customerId = ''): JobDraft => ({ customerId, service: '', price: '', minutes: '60', date, cadence: 'once' });
const tabs: Tab[] = ['Today', 'Customers', 'Planner', 'Schedule', 'Invoices'];
const palette = {
  canvas: '#F4F5EF', paper: '#FFFFFF', ink: '#172B24', forest: '#174B39', pine: '#24644A',
  lime: '#D4EE9C', mint: '#EAF3E7', line: '#DCE4DA', quiet: '#617168', soft: '#F0F3ED',
  amber: '#8A5A12', amberBg: '#FFF4D9', red: '#9D3A33', redBg: '#FCEBE8',
};

function money(cents: number) { return `$${(cents / 100).toFixed(2)}`; }
function dateLabel(value: string) {
  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.valueOf()) ? value : date.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
}
function formatClock(totalMinutes: number) {
  const hour = Math.floor(totalMinutes / 60) % 24;
  const minute = totalMinutes % 60;
  const suffix = hour < 12 ? 'AM' : 'PM';
  const displayHour = hour % 12 || 12;
  return `${displayHour}:${String(minute).padStart(2, '0')} ${suffix}`;
}
function safeElapsedMinutes(session: WorkSession, now: number) {
  const lowerBound = session.status === 'running'
    ? session.lastResumedAt ?? session.startedAt
    : session.completedAt ?? session.startedAt;
  try { return getElapsedMinutes(session, Math.max(now, lowerBound)); }
  catch { return Math.ceil(session.elapsedMs / 60_000); }
}
function initials(name: string) { return name.trim().split(/\s+/).slice(0, 2).map(part => part[0]?.toUpperCase() ?? '').join('') || 'GC'; }

function ActionButton({ label, onPress, secondary = false, disabled = false, accessibilityLabel }: {
  label: string; onPress: () => void; secondary?: boolean; disabled?: boolean; accessibilityLabel?: string;
}) {
  return <Pressable
    accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? label}
    accessibilityState={{ disabled }} disabled={disabled} onPress={onPress}
    style={({ pressed }) => [s.action, secondary && s.secondaryAction, disabled && s.disabledAction, pressed && !disabled && s.pressed]}
  ><Text style={[s.actionText, secondary && s.secondaryActionText]}>{label}</Text></Pressable>;
}

function Field({ label, value, onChangeText, placeholder, keyboardType, multiline = false, maxLength, autoCapitalize = 'sentences', accessibilityHint, returnKeyType = 'done', onSubmitEditing }: {
  label: string; value: string; onChangeText: (value: string) => void; placeholder?: string;
  keyboardType?: 'default' | 'email-address' | 'phone-pad' | 'number-pad' | 'decimal-pad';
  multiline?: boolean; maxLength?: number; autoCapitalize?: 'none' | 'sentences' | 'words'; accessibilityHint?: string;
  returnKeyType?: 'done' | 'next'; onSubmitEditing?: () => void;
}) {
  return <View style={s.fieldWrap}>
    <Text style={s.fieldLabel}>{label}</Text>
    <TextInput accessibilityLabel={label} accessibilityHint={accessibilityHint}
      value={value} onChangeText={onChangeText} placeholder={placeholder}
      placeholderTextColor="#849087" keyboardType={keyboardType} multiline={multiline}
      maxLength={maxLength} autoCapitalize={autoCapitalize} returnKeyType={returnKeyType}
      onSubmitEditing={onSubmitEditing} blurOnSubmit={!multiline}
      style={[s.input, multiline && s.multilineInput]} />
  </View>;
}

function Tag({ children, tone = 'green' }: { children: string; tone?: 'green' | 'amber' | 'neutral' }) {
  return <View style={[s.tag, tone === 'amber' && s.tagAmber, tone === 'neutral' && s.tagNeutral]}>
    <Text style={[s.tagText, tone === 'amber' && s.tagAmberText, tone === 'neutral' && s.tagNeutralText]}>{children}</Text>
  </View>;
}

export function WorkingDemo({ onExit }: { onExit?: () => void }) {
  const { width } = useWindowDimensions();
  const wide = width >= 920;
  const compact = width < 430;
  const initial = useMemo(() => loadLocalDemoWorkspace(), []);
  const [loaded, setLoaded] = useState(initial);
  const workspace = loaded.workspace;
  const [role, setRole] = useState<Role>('Owner');
  const [tab, setTab] = useState<Tab>('Today');
  const [date, setDate] = useState(localCalendarDate());
  const [hours, setHours] = useState('8');
  const [maxJobs, setMaxJobs] = useState('6');
  const [planError, setPlanError] = useState('');
  const [notice, setNotice] = useState('');
  const [form, setForm] = useState<'customer' | 'job' | null>(null);
  const [customerStep, setCustomerStep] = useState<1 | 2>(1);
  const [customerDraft, setCustomerDraft] = useState<CustomerDraft>(blankCustomer());
  const [jobDraft, setJobDraft] = useState<JobDraft>(blankJob());
  const [formError, setFormError] = useState('');
  const [discardOpen, setDiscardOpen] = useState(false);
  const [completeOpen, setCompleteOpen] = useState(false);
  const [noteDraft, setNoteDraft] = useState('');
  const [tick, setTick] = useState(Date.now());
  const [saving, setSaving] = useState(false);
  const actionLock = useRef(false);
  const contentScroll = useRef<ScrollView>(null);

  useEffect(() => {
    if (workspace.workdays.find(day => day.date === date)?.workSession?.status !== 'running') return;
    const timer = setInterval(() => setTick(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [date, workspace.workdays]);
  useEffect(() => {
    const clearLock = () => { actionLock.current = false; setSaving(false); };
    const timer = setTimeout(clearLock, 180);
    return () => clearTimeout(timer);
  }, [loaded]);

  const day = workspace.workdays.find(item => item.date === date);
  const customers = workspace.customers;
  const planIds = day?.plannedVisitIds ?? [];
  const completedIds = new Set((day?.visits ?? []).filter(visit => visit.status === 'completed').map(visit => `${visit.agreement_id}:${date}`));
  const plannedAgreements = planIds.map(id => workspace.agreements.find(agreement => `${agreement.id}:${date}` === id)).filter((item): item is SavedServiceAgreement => !!item);
  const dueDay = useMemo(() => demoDayForDate(workspace, date), [workspace, date]);
  const awaitingPlan = dueDay.visits.filter(visit => visit.status === 'pending' && !planIds.includes(`${visit.agreement_id}:${date}`))
    .map(visit => workspace.agreements.find(agreement => agreement.id === visit.agreement_id)).filter((item): item is SavedServiceAgreement => !!item);
  const session = day?.workSession ?? null;
  const activeAgreement = session ? workspace.agreements.find(item => `${item.id}:${date}` === session.jobId) : undefined;
  const nextAgreement = session && session.status !== 'completed'
    ? activeAgreement
    : plannedAgreements.find(item => !completedIds.has(`${item.id}:${date}`));
  const approved = !!day?.approvedQueueKey && planIds.length > 0;
  const completedCount = completedIds.size;
  const totalVisitCount = dueDay.visits.filter(visit => visit.status !== 'skipped').length;
  const persistenceLabel = loaded.persistence === 'browser' ? 'Saved in this browser' : 'This session only';
  useEffect(() => { setNoteDraft(session?.note ?? ''); }, [session?.jobId]);

  function commit(next: LocalDemoWorkspace, message?: string) {
    const persisted = saveLocalDemoWorkspace(next);
    setLoaded({
      workspace: next,
      persistence: persisted ? 'browser' : 'session',
      notice: persisted ? undefined : 'Browser storage is unavailable. Changes stay in this open session and clear when it reloads.',
    });
    if (message) setNotice(message);
  }
  function replaceDay(nextDay: LocalDemoWorkday) {
    const remaining = workspace.workdays.filter(item => item.date !== date);
    commit({ ...workspace, workdays: [...remaining, nextDay] });
  }
  function runOnce(action: () => void) {
    if (actionLock.current) return;
    actionLock.current = true;
    setSaving(true);
    try { action(); } catch (error) {
      setPlanError(error instanceof Error ? error.message : 'That action could not be completed.');
      setSaving(false); actionLock.current = false;
    }
  }
  function startCustomerForm() {
    setCustomerDraft(blankCustomer()); setJobDraft(blankJob(date)); setCustomerStep(1); setFormError(''); setForm('customer');
  }
  function startJobForm(customerId = '') {
    setJobDraft(blankJob(date, customerId || customers[0]?.id || ''));
    setFormError(''); setForm('job');
  }
  function updateCustomerDraft(field: keyof CustomerDraft, value: string) {
    setCustomerDraft(current => ({ ...current, [field]: value }));
    setFormError('');
  }
  function updateJobDraft<K extends keyof JobDraft>(field: K, value: JobDraft[K]) {
    setJobDraft(current => ({ ...current, [field]: value }));
    setFormError('');
  }
  function requestCloseForm() {
    Keyboard.dismiss();
    const dirty = form === 'customer'
      ? Object.values(customerDraft).some(value => value.trim())
      : !!form && (!!jobDraft.service.trim() || !!jobDraft.price.trim() || jobDraft.minutes !== '60'
        || jobDraft.date !== date || jobDraft.cadence !== 'once');
    if (dirty) setDiscardOpen(true); else setForm(null);
  }
  function backForm() {
    if (form === 'customer' && customerStep === 2) { setCustomerStep(1); setFormError(''); return; }
    requestCloseForm();
  }
  useEffect(() => {
    if (!form) return;
    const back = BackHandler.addEventListener('hardwareBackPress', () => { backForm(); return true; });
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      const handleKey = (event: KeyboardEvent) => {
        if (event.key !== 'Escape') return;
        event.preventDefault(); event.stopPropagation();
        if (discardOpen) { setDiscardOpen(false); return; }
        if (completeOpen) { setCompleteOpen(false); return; }
        backForm();
      };
      document.addEventListener('keydown', handleKey, true);
      return () => { back.remove(); document.removeEventListener('keydown', handleKey, true); };
    }
    return () => back.remove();
  }, [form, customerStep, customerDraft, jobDraft, discardOpen, completeOpen]);

  function validateCustomer(): string {
    if (!customerDraft.name.trim()) return 'Enter the customer’s name to continue.';
    if (customerDraft.name.trim().length > 160) return 'Keep the name under 160 characters.';
    if (!customerDraft.address.trim()) return 'Enter the service address to continue.';
    if (customerDraft.address.trim().length > 500) return 'Keep the address under 500 characters.';
    if (customerDraft.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerDraft.email.trim())) return 'Enter a valid email address or leave it blank.';
    if (customerDraft.phone.trim() && customerDraft.phone.trim().length > 50) return 'Keep the phone number under 50 characters.';
    if (customerDraft.notes.trim().length > 2000) return 'Keep notes under 2,000 characters.';
    return '';
  }
  function validateJob(draft: JobDraft, allowNewCustomer = false): string {
    if (!allowNewCustomer && !customers.some(customer => customer.id === draft.customerId)) return 'Choose a customer first.';
    if (!draft.service.trim()) return 'Add a short service name.';
    if (draft.service.trim().length > 160) return 'Keep the service name under 160 characters.';
    if (!validCalendarDate(draft.date)) return 'Enter a valid date in YYYY-MM-DD format.';
    try { dollarsToCents(draft.price); } catch { return 'Enter a price such as 65 or 65.00.'; }
    if (!/^\d{1,4}$/.test(draft.minutes.trim()) || Number(draft.minutes) < 1 || Number(draft.minutes) > 1440) return 'Estimated time must be a whole number from 1 to 1,440 minutes.';
    return '';
  }
  function createJob(customerId: string, locationId: string, draft: JobDraft, customer?: SavedCustomer, location?: SavedServiceLocation) {
    const agreementId = createDemoRecordId('agreement');
    const agreement: SavedServiceAgreement = {
      id: agreementId, customer_id: customerId, location_id: locationId,
      service_name: draft.service.trim(), rate_cents: dollarsToCents(draft.price),
      estimated_minutes: Number(draft.minutes), starts_on: draft.date,
      ends_on: draft.cadence === 'once' ? draft.date : null,
      frequency: 'weekly', interval_days: null, days_of_week: null,
      preferred_start_minute: null, preferred_finish_minute: null, fixed_start_minute: null,
      active: 1, address: location?.address ?? workspace.locations.find(item => item.id === locationId)?.address ?? '',
      preferences: location?.preferences ?? null, lat: null, lon: null,
    };
    const next = { ...workspace, customers: customer ? [...workspace.customers, customer] : workspace.customers,
      locations: location ? [...workspace.locations, location] : workspace.locations,
      agreements: [...workspace.agreements, agreement],
      workdays: workspace.workdays.map(item => item.date === draft.date ? { ...item, approvedQueueKey: null } : item),
    };
    commit(next, draft.cadence === 'once' ? 'Sample visit added. Build and approve the workday to place it.' : 'Weekly sample service added. Build and approve the workday to place it.');
    setDate(draft.date); setForm(null); setFormError(''); setTab('Planner'); scrollToTop();
  }
  function saveCustomerWithService() {
    const customerError = validateCustomer();
    const jobError = validateJob({ ...jobDraft, date }, true);
    if (customerError) { setCustomerStep(1); setFormError(customerError); return; }
    if (jobError) { setCustomerStep(2); setFormError(jobError); return; }
    runOnce(() => {
      const customerId = createDemoRecordId('customer');
      const locationId = createDemoRecordId('location');
      const customer: SavedCustomer = {
        id: customerId, name: customerDraft.name.trim(),
        phone: customerDraft.phone.trim() || null, email: customerDraft.email.trim() || null,
        notes: customerDraft.notes.trim() || null, created_at: new Date().toISOString(),
      };
      const location: SavedServiceLocation = {
        id: locationId, customer_id: customerId, address: customerDraft.address.trim(),
        preferences: customerDraft.notes.trim() || null, lat: null, lon: null,
      };
      createJob(customerId, locationId, jobDraft, customer, location);
    });
  }
  function saveJob() {
    const error = validateJob(jobDraft);
    if (error) { setFormError(error); return; }
    const location = workspace.locations.find(item => item.customer_id === jobDraft.customerId);
    if (!location) { setFormError('This customer needs a service address before a job can be scheduled. Add the customer with an address first.'); return; }
    runOnce(() => createJob(jobDraft.customerId, location.id, jobDraft));
  }
  function buildPlan() {
    setPlanError('');
    try {
      const result = buildLocalDemoPlan(workspace, date, hours, maxJobs);
      replaceDay(result.workday);
      setNotice('Draft workday built. Review the stops and approve it before switching to Worker view.');
    } catch (error) { setPlanError(error instanceof Error ? error.message : 'Could not build the sample workday.'); }
  }
  function approvePlan() {
    if (!day?.plannedVisitIds.length) return;
    runOnce(() => {
      replaceDay({ ...day, approvedQueueKey: `local-preview-${date}-${Date.now()}` });
      setNotice('Sample workday approved on this device. No team member was notified.');
    });
  }
  function updateSession(nextSession: WorkSession | null, visitUpdate?: LocalDemoWorkday['visits'][number]) {
    if (!day) return;
    const visits = visitUpdate
      ? [...day.visits.filter(visit => !(visit.agreement_id === visitUpdate.agreement_id && visit.scheduled_date === date)), visitUpdate]
      : day.visits;
    replaceDay({ ...day, workSession: nextSession, visits, approvedQueueKey: day.approvedQueueKey });
  }
  function workerAction(action: 'arrive' | 'start' | 'pause' | 'resume' | 'complete' | 'undo') {
    if (!day || (!approved && action !== 'undo')) return;
    runOnce(() => {
      const selected = action === 'undo' ? activeAgreement : nextAgreement;
      if (!selected) return;
      const visitKey = `${selected.id}:${date}`;
      if (action === 'arrive') { replaceDay({ ...day, arrivedVisitId: visitKey }); setNotice('Arrival confirmed in the local preview. Device location was not read.'); return; }
      if (action === 'start') {
        if (day.arrivedVisitId !== visitKey) { setPlanError('Confirm the sample arrival first.'); return; }
        replaceDay({ ...day, workSession: startWork(visitKey, Date.now()), approvedQueueKey: day.approvedQueueKey });
        setNotice('Sample visit started. The timer is running on this device.'); return;
      }
      if (action === 'pause' && session?.status === 'running') {
        updateSession({ ...pauseWork(session, Date.now()), note: noteDraft.trim() || undefined });
        setNotice('Sample visit paused. The timer stopped on this device.'); return;
      }
      if (action === 'resume' && session?.status === 'paused') {
        updateSession({ ...resumeWork(session, Date.now()), note: noteDraft.trim() || undefined });
        setNotice('Sample visit resumed. The timer is running on this device.'); return;
      }
      if (action === 'complete' && session && (session.status === 'running' || session.status === 'paused')) {
        const finished = { ...completeWork(session, Date.now()), note: noteDraft.trim() || undefined };
        const customer = workspace.customers.find(item => item.id === selected.customer_id);
        updateSession(finished, {
          id: createDemoVisitId(selected.id, date), agreement_id: selected.id, scheduled_date: date,
          status: 'completed', actual_minutes: getElapsedMinutes(finished, finished.completedAt ?? Date.now()),
          work_note: noteDraft.trim() || undefined,
          completed_customer_id: customer?.id ?? null, completed_customer_name: customer?.name ?? null,
          completed_service_name: selected.service_name, completed_rate_cents: selected.rate_cents,
        });
        setNoteDraft(''); setCompleteOpen(false); setNotice('Visit marked complete in this sample workday. Undo remains available below.'); return;
      }
      if (action === 'undo' && session?.status === 'completed') {
        const visits = day.visits.filter(visit => !(visit.agreement_id === selected.id && visit.scheduled_date === date));
        replaceDay({ ...day, workSession: null, visits, approvedQueueKey: null, arrivedVisitId: null });
        setNoteDraft(session.note ?? ''); setNotice('Sample completion removed. Review and approve the day again before continuing.');
      }
    });
  }
  function resetDemo() {
    clearLocalDemoWorkspace();
    const fresh = createInitialDemoWorkspace();
    const persisted = saveLocalDemoWorkspace(fresh);
    setLoaded({ workspace: fresh, persistence: persisted ? 'browser' : 'session', notice: persisted ? undefined : 'Browser storage is unavailable. Changes stay in this open session and clear when it reloads.' });
    setDate(localCalendarDate()); setTab('Today'); setRole('Owner'); setPlanError('');
    setNotice('Sample workspace reset. Your local edits were cleared.');
    scrollToTop();
  }

  function scrollToTop() {
    contentScroll.current?.scrollTo({ y: 0, animated: false });
    if (Platform.OS === 'web' && typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'auto' });
  }

  const nextIndex = nextAgreement ? plannedAgreements.findIndex(item => item.id === nextAgreement.id) : -1;
  const totalMinutes = plannedAgreements.reduce((sum, item) => sum + item.estimated_minutes, 0);
  const plannedValue = plannedAgreements.reduce((sum, item) => sum + item.rate_cents, 0);
  const elapsed = session ? safeElapsedMinutes(session, tick) : 0;
  const timeText = `${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, '0')}`;
  const nextStartMinute = 8 * 60 + plannedAgreements.slice(0, Math.max(0, nextIndex)).reduce((sum, item) => sum + item.estimated_minutes, 0);
  const selectedTabs = role === 'Owner' ? tabs : ['Today', 'Schedule'] as Tab[];

  function chooseTab(next: Tab) { Keyboard.dismiss(); setTab(next); setNotice(''); setPlanError(''); scrollToTop(); }
  function tabButton(item: Tab) {
    const selected = tab === item;
    return <Pressable key={item} accessibilityRole="tab" accessibilityState={{ selected }}
      accessibilityLabel={`${item}${selected ? ', selected tab' : ' tab'}`} onPress={() => chooseTab(item)}
      style={({ pressed }) => [s.navItem, wide && s.sideNavItem, selected && s.navItemSelected, pressed && s.navPressed]}>
      <Text style={[s.navMark, selected && s.navMarkSelected]}>{item === 'Today' ? '01' : item === 'Customers' ? '02' : item === 'Planner' ? '03' : item === 'Schedule' ? '04' : '05'}</Text>
      <Text style={[s.navLabel, selected && s.navLabelSelected]}>{item}</Text>
    </Pressable>;
  }

  return <SafeAreaView style={s.safe}>
    <View style={s.app}>
      <View style={[s.header, wide && s.headerWide, compact && s.headerCompact]}>
        <View style={s.brandRow}>
          <View style={s.brandMark}><Text style={s.brandMarkText}>G</Text></View>
          <View><Text style={s.brand}>greencollar</Text><Text style={s.brandSub}>FIELD OPERATIONS</Text></View>
        </View>
        <View style={[s.headerRight, compact && s.headerRightCompact]}>
          <View style={s.previewLabel}><View style={s.previewDot}/><Text style={s.previewLabelText}>PRIVATE PREVIEW · FICTIONAL DATA</Text></View>
          <View style={s.roleSwitch} accessibilityLabel="Choose demo role">
            {(['Owner', 'Worker'] as Role[]).map(item => <Pressable key={item} accessibilityRole="button" accessibilityState={{ selected: role === item }} onPress={() => { setRole(item); if (item === 'Worker' && !['Today', 'Schedule'].includes(tab)) setTab('Today'); scrollToTop(); }} style={[s.roleChoice, role === item && s.roleChoiceSelected]}><Text style={[s.roleChoiceText, role === item && s.roleChoiceTextSelected]}>{item}</Text></Pressable>)}
          </View>
          {onExit && <Pressable accessibilityRole="button" accessibilityLabel="Exit preview" onPress={onExit} style={s.exit}><Text style={s.exitText}>Exit</Text></Pressable>}
        </View>
      </View>
      <View style={[s.notice, wide && s.noticeWide]} accessibilityRole="summary">
        <Text style={s.noticeTitle}>Demo workspace</Text>
        <Text style={s.noticeCopy}>Edits are local to this preview. {persistenceLabel}. Nothing is sent, billed, or written to a business account.</Text>
      </View>
      {!!(loaded.notice || notice) && <View style={[s.message, s.messageInfo]} accessibilityLiveRegion="polite"><Text style={s.messageText}>{notice || loaded.notice}</Text></View>}
      <View style={[s.body, wide && s.bodyWide]}>
        {wide && <View style={s.sidebar}>
          <Text style={s.sideCaption}>{role === 'Owner' ? 'WORKSPACE' : 'MY DAY'}</Text>
          {selectedTabs.map(tabButton)}
          <View style={s.sideBottom}><Text style={s.sideCaption}>LOCAL PREVIEW</Text><Text style={s.sideCopy}>{persistenceLabel}. Reset any time.</Text><ActionButton label="Reset sample data" secondary onPress={resetDemo}/></View>
        </View>}
        <ScrollView ref={contentScroll} style={s.scroller} contentContainerStyle={[s.content, wide && s.contentWide]} keyboardShouldPersistTaps="handled">
          {tab === 'Today' && <>
            <View style={s.eyebrowRow}><Text style={s.eyebrow}>{role === 'Worker' ? 'YOUR WORKDAY' : 'OVERVIEW'}</Text><Tag tone={approved ? 'green' : 'amber'}>{approved ? 'APPROVED · LOCAL' : 'PLAN NEEDED'}</Tag></View>
            <Text style={s.h1}>{role === 'Worker' ? 'Your day, made clear.' : 'A good day starts here.'}</Text>
            <Text style={s.lede}>{dateLabel(date)} · {approved ? `${completedCount} of ${totalVisitCount} visits complete` : 'Review and approve a sample plan before work begins.'}</Text>
            <View style={s.statsRow}>
              <View style={s.stat}><Text style={s.statValue}>{approved ? `${completedCount}/${totalVisitCount}` : '—'}</Text><Text style={s.statLabel}>VISITS DONE</Text></View>
              <View style={s.stat}><Text style={s.statValue}>{approved ? `${totalMinutes}m` : '—'}</Text><Text style={s.statLabel}>EST. SERVICE</Text></View>
              <View style={s.stat}><Text style={s.statValue}>{approved ? role === 'Owner' ? money(plannedValue) : `${planIds.length} stops` : '—'}</Text><Text style={s.statLabel}>{role === 'Owner' ? 'SAMPLE TOTAL' : 'WORKDAY'}</Text></View>
            </View>
            {session && session.status !== 'completed' && activeAgreement ? <View style={s.activeCard}>
              <View style={s.activeTop}><Tag>{session.status === 'running' ? 'IN PROGRESS' : 'PAUSED'}</Tag><Text style={s.timer}>{timeText}</Text></View>
              <Text style={s.cardEyebrow}>CURRENT VISIT</Text><Text style={s.cardTitle}>{activeAgreement.service_name}</Text>
              <Text style={s.cardBody}>{workspace.customers.find(item => item.id === activeAgreement.customer_id)?.name ?? 'Sample customer'}</Text>
              <Text style={s.cardBody}>{activeAgreement.address}</Text>
              <Field label="Optional work note" value={noteDraft} onChangeText={setNoteDraft} placeholder="Add a note for this sample visit" maxLength={1000} multiline accessibilityHint="This note stays in the local preview."/>
              {session.status === 'running' ? <View style={s.actionRow}><ActionButton label="Pause work" disabled={saving} onPress={() => workerAction('pause')}/><ActionButton label="Finish visit" secondary disabled={saving} onPress={() => setCompleteOpen(true)}/></View>
                : <View style={s.actionRow}><ActionButton label="Resume work" disabled={saving} onPress={() => workerAction('resume')}/><ActionButton label="Finish visit" secondary disabled={saving} onPress={() => setCompleteOpen(true)}/></View>}
            </View> : nextAgreement && approved ? <View style={s.nextCard}>
              <View style={s.nextHeader}><View><Text style={s.cardEyebrow}>NEXT STOP · {String(nextIndex + 1).padStart(2, '0')}</Text><Text style={s.cardTitle}>{nextAgreement.service_name}</Text></View><Tag>{`${nextAgreement.estimated_minutes} MIN`}</Tag></View>
              <Text style={s.cardBody}>{workspace.customers.find(item => item.id === nextAgreement.customer_id)?.name ?? 'Sample customer'}</Text>
              <Text style={s.cardBody}>{nextAgreement.address}</Text>
              <Text style={s.scheduleMeta}>{formatClock(nextStartMinute)} sample start · {nextAgreement.estimated_minutes} min</Text>
              {day?.arrivedVisitId === `${nextAgreement.id}:${date}` && <Text style={s.arrivalText}>Arrival confirmed in this preview</Text>}
              {day?.arrivedVisitId === `${nextAgreement.id}:${date}`
                ? <ActionButton label="Start this visit" disabled={saving} onPress={() => workerAction('start')}/>
                : <ActionButton label="Confirm arrival" disabled={saving} onPress={() => workerAction('arrive')} accessibilityLabel="Simulate arrival at the next stop"/>}
              <Text style={s.microCopy}>Arrival is a sample action. This preview does not access GPS or contact anyone.</Text>
            </View> : approved ? <View style={s.emptyCard}><Text style={s.emptyMark}>✓</Text><Text style={s.cardTitle}>That’s the day complete.</Text><Text style={s.cardBody}>All planned sample visits are finished.</Text></View>
              : <View style={s.emptyCard}><Text style={s.cardEyebrow}>READY WHEN YOU ARE</Text><Text style={s.cardTitle}>No approved workday yet.</Text><Text style={s.cardBody}>Build a sample plan, check what fits, then approve it on this device.</Text><ActionButton label={role === 'Worker' ? 'Ask owner to approve a plan' : 'Build a sample day'} onPress={() => role === 'Worker' ? setNotice('Switch to Owner view to build and approve a sample workday.') : chooseTab('Planner')}/></View>}
            {session?.status === 'completed' && <View style={s.undoCard}><Text style={s.undoTitle}>Visit marked complete</Text><Text style={s.cardBody}>Completed in the local sample day. Undo is available if that was a mistake.</Text><ActionButton label="Undo completion" secondary disabled={saving} onPress={() => workerAction('undo')}/></View>}
            <View style={s.sectionHeader}><Text style={s.sectionTitle}>Coming up</Text>{approved && <Pressable accessibilityRole="button" onPress={() => chooseTab('Schedule')}><Text style={s.link}>View schedule</Text></Pressable>}</View>
            {approved ? plannedAgreements.slice(0, 3).map((agreement, index) => <View key={agreement.id} style={s.compactStop}>
              <View style={[s.stopNumber, completedIds.has(`${agreement.id}:${date}`) && s.stopNumberDone]}><Text style={[s.stopNumberText, completedIds.has(`${agreement.id}:${date}`) && s.stopNumberTextDone]}>{completedIds.has(`${agreement.id}:${date}`) ? '✓' : String(index + 1).padStart(2, '0')}</Text></View>
              <View style={s.stopText}><Text style={s.stopTitle}>{agreement.service_name}</Text><Text style={s.stopMeta}>{workspace.customers.find(item => item.id === agreement.customer_id)?.name ?? 'Sample customer'} · {agreement.estimated_minutes} min</Text></View>
              <Tag tone={completedIds.has(`${agreement.id}:${date}`) ? 'green' : 'neutral'}>{completedIds.has(`${agreement.id}:${date}`) ? 'DONE' : 'UP NEXT'}</Tag>
            </View>) : <Text style={s.emptyCopy}>Build a plan to see the stops for this day.</Text>}
          </>}

          {tab === 'Customers' && <>
            <View style={s.eyebrowRow}><Text style={s.eyebrow}>CUSTOMER BOOK</Text><Tag tone="neutral">{`${customers.length} SAMPLE PROFILES`}</Tag></View>
            <Text style={s.h1}>People & places.</Text><Text style={s.lede}>Keep service details together, then schedule a visit when you’re ready.</Text>
            <ActionButton label="Add customer and first service" onPress={startCustomerForm}/>
            {customers.length ? customers.map(customer => {
              const location = workspace.locations.find(item => item.customer_id === customer.id);
              const services = workspace.agreements.filter(item => item.customer_id === customer.id);
              return <View key={customer.id} style={s.customerCard}>
                <View style={s.customerTop}><View style={s.avatar}><Text style={s.avatarText}>{initials(customer.name)}</Text></View><View style={s.customerInfo}><Text style={s.customerName}>{customer.name}</Text><Text style={s.customerAddress}>{location?.address ?? 'No service address yet'}</Text></View><Tag tone="neutral">{`${services.length} ${services.length === 1 ? 'SERVICE' : 'SERVICES'}`}</Tag></View>
                {(customer.phone || customer.email) && <Text style={s.customerContact}>{[customer.phone, customer.email].filter(Boolean).join('  ·  ')}</Text>}
                {!!customer.notes && <Text style={s.customerContact}>{customer.notes}</Text>}
                <View style={s.customerServices}>{services.slice(0, 2).map(service => <View key={service.id} style={s.serviceLine}><Text style={s.serviceName}>{service.service_name}</Text><Text style={s.servicePrice}>{money(service.rate_cents)} · {service.estimated_minutes} min</Text></View>)}</View>
                <ActionButton label="Schedule a job" secondary onPress={() => startJobForm(customer.id)}/>
              </View>;
            }) : <View style={s.emptyCard}><Text style={s.cardTitle}>No sample customers yet.</Text><Text style={s.cardBody}>Add one to start a customer-to-visit flow.</Text></View>}
          </>}

          {tab === 'Planner' && <>
            <Text style={s.eyebrow}>DAY PLANNER</Text><Text style={s.h1}>Make room for the work.</Text><Text style={s.lede}>Set a simple time and job limit. The sample planner shows what fits before you approve anything.</Text>
            <View style={s.panel}>
              <Text style={s.panelTitle}>Plan settings</Text>
              <Field label="Workday date" value={date} onChangeText={setDate} placeholder="YYYY-MM-DD" autoCapitalize="none" accessibilityHint="Use year-month-day format."/>
              <View style={s.fieldRow}><View style={s.fieldFlex}><Field label="Available service hours" value={hours} onChangeText={setHours} keyboardType="decimal-pad" placeholder="8"/></View><View style={s.fieldFlex}><Field label="Maximum visits" value={maxJobs} onChangeText={setMaxJobs} keyboardType="number-pad" placeholder="6"/></View></View>
              <Text style={s.microCopy}>Planning starts at 8:00 AM. Sample travel is zero minutes; travel, breaks and customer time windows are not included.</Text>
              <ActionButton label="Build sample workday" disabled={saving} onPress={buildPlan}/>
              {!!planError && <Text style={s.errorText} accessibilityLiveRegion="polite">{planError}</Text>}
            </View>
            {day && <View style={s.panel}>
              <View style={s.planHeader}><View><Text style={s.panelTitle}>Review this day</Text><Text style={s.cardBody}>{dateLabel(date)}</Text></View><Tag tone={approved ? 'green' : 'amber'}>{approved ? 'APPROVED' : 'DRAFT'}</Tag></View>
              <View style={s.metrics}><Text style={s.metricText}>{planIds.length} planned · {totalMinutes} service min</Text><Text style={s.metricText}>{money(plannedValue)} estimated value</Text></View>
              {completedCount > 0 && <Text style={s.approvedCopy}>{completedCount} completed visit{completedCount === 1 ? '' : 's'} kept out of this replan.</Text>}
              {plannedAgreements.map((agreement, index) => <View key={agreement.id} style={s.planStop}><Text style={s.planIndex}>{String(index + 1).padStart(2, '0')}</Text><View style={s.stopText}><Text style={s.stopTitle}>{agreement.service_name}</Text><Text style={s.stopMeta}>{workspace.customers.find(item => item.id === agreement.customer_id)?.name ?? 'Sample customer'} · {agreement.estimated_minutes} min</Text></View><Text style={s.servicePrice}>{money(agreement.rate_cents)}</Text></View>)}
              {day.unscheduledVisitIds.length > 0 && <View style={s.warning}><Text style={s.warningTitle}>{day.unscheduledVisitIds.length} sample visit{day.unscheduledVisitIds.length === 1 ? '' : 's'} don’t fit</Text><Text style={s.warningCopy}>The job limit or service hours held these visits out of the draft. Increase capacity and rebuild to review them.</Text></View>}
              {planIds.length > 0 && !approved && <ActionButton label="Approve sample day" disabled={saving} onPress={approvePlan}/>}
              {approved && <Text style={s.approvedCopy}>Approved on this device. Switch to Worker view to run the sample day.</Text>}
            </View>}
            {awaitingPlan.length > 0 && <View style={s.panelSoft}><Text style={s.panelTitle}>Jobs waiting for a plan</Text><Text style={s.cardBody}>These sample visits are due on this date and will be checked when you build the workday.</Text>{awaitingPlan.map(agreement => <View key={agreement.id} style={s.serviceLine}><Text style={s.serviceName}>{agreement.service_name}</Text><Text style={s.servicePrice}>{money(agreement.rate_cents)} · {agreement.estimated_minutes} min</Text></View>)}</View>}
            <View style={s.panelSoft}><Text style={s.panelTitle}>Need a new visit?</Text><Text style={s.cardBody}>Add it to a customer, then rebuild the day so the plan can be reviewed again.</Text><ActionButton label="Schedule a job" secondary onPress={() => startJobForm()}/></View>
          </>}

          {tab === 'Schedule' && <>
            <View style={s.eyebrowRow}><Text style={s.eyebrow}>WORKDAY</Text><Tag tone={approved ? 'green' : 'amber'}>{approved ? 'READY FOR WORKER' : 'DRAFT ONLY'}</Tag></View>
            <Text style={s.h1}>The day in order.</Text><Text style={s.lede}>{dateLabel(date)} · sample workday</Text>
            {role === 'Owner' && <View style={s.dateControls}><Field label="View another day" value={date} onChangeText={setDate} placeholder="YYYY-MM-DD" autoCapitalize="none"/><ActionButton label="Plan this day" secondary onPress={() => chooseTab('Planner')}/></View>}
            {!approved ? <View style={s.emptyCard}><Text style={s.cardTitle}>This day needs a review.</Text><Text style={s.cardBody}>A draft becomes ready for the worker after the owner approves it.</Text>{role === 'Owner' && <ActionButton label="Review sample plan" onPress={() => chooseTab('Planner')}/>}</View>
              : plannedAgreements.map((agreement, index) => {
                const complete = completedIds.has(`${agreement.id}:${date}`);
                const active = session?.jobId === `${agreement.id}:${date}` && session.status !== 'completed';
                return <View key={agreement.id} style={s.scheduleCard}>
                  <View style={s.scheduleRail}><View style={[s.scheduleDot, complete && s.scheduleDotDone, active && s.scheduleDotActive]}/>{index < plannedAgreements.length - 1 && <View style={s.scheduleLine}/>}</View>
                  <View style={s.scheduleBody}><View style={s.scheduleTop}><Text style={s.scheduleIndex}>STOP {String(index + 1).padStart(2, '0')}</Text><Tag tone={complete ? 'green' : active ? 'amber' : 'neutral'}>{complete ? 'COMPLETE' : active ? 'IN PROGRESS' : 'PLANNED'}</Tag></View><Text style={s.cardTitle}>{agreement.service_name}</Text><Text style={s.cardBody}>{workspace.customers.find(item => item.id === agreement.customer_id)?.name ?? 'Sample customer'}</Text><Text style={s.cardBody}>{agreement.address}</Text><Text style={s.scheduleMeta}>{formatClock(8 * 60 + plannedAgreements.slice(0, index).reduce((sum, item) => sum + item.estimated_minutes, 0))} sample start · {agreement.estimated_minutes} min service{role === 'Owner' ? ` · ${money(agreement.rate_cents)} sample value` : ''}</Text></View>
                </View>;
              })}
            {approved && <View style={s.panelSoft}><Text style={s.panelTitle}>Planning note</Text><Text style={s.cardBody}>Stops are ordered by the app’s local sample planner. No road routing, drive time or live location is used.</Text></View>}
          </>}

          {tab === 'Invoices' && <>
            <Text style={s.eyebrow}>BILLING PREVIEW</Text><Text style={s.h1}>Clear, before it’s sent.</Text><Text style={s.lede}>Completed sample work can be reviewed here. The demo does not create or send real invoices.</Text>
            <View style={s.panel}><View style={s.planHeader}><View><Text style={s.panelTitle}>Invoice drafts</Text><Text style={s.cardBody}>Local preview only · not payable</Text></View><Tag tone="amber">NOT SENT</Tag></View>
              {workspace.workdays.flatMap(workday => workday.visits.filter(visit => visit.status === 'completed').map(visit => ({ workday, visit }))).length
                ? workspace.workdays.flatMap(workday => workday.visits.filter(visit => visit.status === 'completed').map(visit => ({ workday, visit }))).map(({ workday, visit }) => <View key={`${workday.date}:${visit.agreement_id}`} style={s.invoiceRow}><View style={s.stopText}><Text style={s.stopTitle}>{visit.completed_service_name ?? 'Completed sample visit'}</Text><Text style={s.stopMeta}>{visit.completed_customer_name ?? 'Sample customer'} · {workday.date}</Text><Text style={s.stopMeta}>{visit.actual_minutes ?? 0} actual min · review only</Text></View><Text style={s.servicePrice}>{money(visit.completed_rate_cents ?? 0)}</Text></View>)
                : <View style={s.emptyInline}><Text style={s.cardTitle}>Nothing to review yet.</Text><Text style={s.cardBody}>Complete a sample visit to see its price snapshot here.</Text></View>}
            </View>
            <View style={s.panelSoft}><Text style={s.panelTitle}>No external billing</Text><Text style={s.cardBody}>No tax, payment, invoice delivery, or accounting system is connected. These examples never leave this device.</Text></View>
          </>}
          <View style={s.footer}><Text style={s.footerText}>GREEN COLLAR · LOCAL SAMPLE WORKSPACE</Text><Text style={s.footerText}>{persistenceLabel} · reset from the menu</Text></View>
        </ScrollView>
      </View>
      {!wide && <View style={[s.bottomNav, compact && s.bottomNavCompact]}>{selectedTabs.map(tabButton)}<Pressable accessibilityRole="button" accessibilityLabel="Reset sample data" onPress={resetDemo} style={[s.resetNav, compact && s.resetNavCompact]}><Text style={s.resetNavMark}>↺</Text><Text style={s.resetNavLabel}>Reset</Text></Pressable></View>}

      <Modal visible={!!form} transparent animationType="slide" onRequestClose={backForm}>
        <KeyboardAvoidingView style={s.modalBackdrop} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={[s.modal, wide && s.modalWide]}>
            <View style={s.modalHeader}><Pressable accessibilityRole="button" accessibilityLabel={form === 'customer' && customerStep === 2 ? 'Back to customer details' : 'Cancel form'} onPress={backForm} style={s.backButton}><Text style={s.backText}>‹</Text></Pressable><View style={s.modalHeading}><Text style={s.modalEyebrow}>{form === 'customer' ? `NEW CUSTOMER · STEP ${customerStep} OF 2` : 'SCHEDULE A SAMPLE JOB'}</Text><Text style={s.modalTitle}>{form === 'customer' ? customerStep === 1 ? 'Who are we helping?' : 'What’s the first service?' : 'Add a visit.'}</Text></View><Pressable accessibilityRole="button" accessibilityLabel="Close form" onPress={requestCloseForm} style={s.closeButton}><Text style={s.closeText}>×</Text></Pressable></View>
            <ScrollView style={s.formScroll} contentContainerStyle={s.formContent} keyboardShouldPersistTaps="handled">
              {form === 'customer' && customerStep === 1 && <>
                <Text style={s.formIntro}>A name and service address are enough to get started. Contact details and notes are optional.</Text>
                <Field label="Customer name" value={customerDraft.name} onChangeText={name => updateCustomerDraft('name', name)} placeholder="For example, Jordan Smith" maxLength={160} returnKeyType="next" onSubmitEditing={() => Keyboard.dismiss()}/>
                <Field label="Service address" value={customerDraft.address} onChangeText={address => updateCustomerDraft('address', address)} placeholder="Street, city, state" maxLength={500}/>
                <View style={s.fieldRow}><View style={s.fieldFlex}><Field label="Phone (optional)" value={customerDraft.phone} onChangeText={phone => updateCustomerDraft('phone', phone)} placeholder="(555) 010-1234" keyboardType="phone-pad" maxLength={50}/></View><View style={s.fieldFlex}><Field label="Email (optional)" value={customerDraft.email} onChangeText={email => updateCustomerDraft('email', email)} placeholder="name@example.com" keyboardType="email-address" autoCapitalize="none" maxLength={254}/></View></View>
                <Field label="Access notes (optional)" value={customerDraft.notes} onChangeText={notes => updateCustomerDraft('notes', notes)} placeholder="Gate, parking or arrival preference" multiline maxLength={2000}/>
              </>}
              {form === 'customer' && customerStep === 2 && <>
                <Text style={s.formIntro}>You can change these sample details later. This creates a fictional customer and a local service record.</Text>
                <Field label="Service" value={jobDraft.service} onChangeText={service => updateJobDraft('service', service)} placeholder="Exterior maintenance" maxLength={160}/>
                <View style={s.fieldRow}><View style={s.fieldFlex}><Field label="Price per visit" value={jobDraft.price} onChangeText={price => updateJobDraft('price', price)} placeholder="65.00" keyboardType="decimal-pad"/></View><View style={s.fieldFlex}><Field label="Estimated minutes" value={jobDraft.minutes} onChangeText={minutes => updateJobDraft('minutes', minutes)} placeholder="60" keyboardType="number-pad"/></View></View>
                <Field label="First visit date" value={jobDraft.date} onChangeText={value => updateJobDraft('date', value)} placeholder="YYYY-MM-DD" autoCapitalize="none"/>
                <View style={s.cadenceWrap}><Text style={s.fieldLabel}>Repeat this sample service?</Text><View style={s.cadenceRow}>{(['once', 'weekly'] as const).map(item => <Pressable key={item} accessibilityRole="radio" accessibilityState={{ selected: jobDraft.cadence === item }} onPress={() => updateJobDraft('cadence', item)} style={[s.cadence, jobDraft.cadence === item && s.cadenceSelected]}><Text style={[s.cadenceText, jobDraft.cadence === item && s.cadenceTextSelected]}>{item === 'once' ? 'One time' : 'Weekly'}</Text></Pressable>)}</View></View>
              </>}
              {form === 'job' && <>
                <Text style={s.formIntro}>Choose an existing customer and set up a one-time or weekly sample visit.</Text>
                <Text style={s.fieldLabel}>Customer</Text>
                <View style={s.customerChoices}>{customers.map(customer => <Pressable key={customer.id} accessibilityRole="radio" accessibilityState={{ selected: jobDraft.customerId === customer.id }} onPress={() => updateJobDraft('customerId', customer.id)} style={[s.customerChoice, jobDraft.customerId === customer.id && s.customerChoiceSelected]}><Text style={[s.customerChoiceText, jobDraft.customerId === customer.id && s.customerChoiceTextSelected]}>{customer.name}</Text></Pressable>)}</View>
                <Field label="Service" value={jobDraft.service} onChangeText={service => updateJobDraft('service', service)} placeholder="Exterior maintenance" maxLength={160}/>
                <View style={s.fieldRow}><View style={s.fieldFlex}><Field label="Price per visit" value={jobDraft.price} onChangeText={price => updateJobDraft('price', price)} placeholder="65.00" keyboardType="decimal-pad"/></View><View style={s.fieldFlex}><Field label="Estimated minutes" value={jobDraft.minutes} onChangeText={minutes => updateJobDraft('minutes', minutes)} placeholder="60" keyboardType="number-pad"/></View></View>
                <Field label="First visit date" value={jobDraft.date} onChangeText={value => updateJobDraft('date', value)} placeholder="YYYY-MM-DD" autoCapitalize="none"/>
                <View style={s.cadenceWrap}><Text style={s.fieldLabel}>Repeat this sample service?</Text><View style={s.cadenceRow}>{(['once', 'weekly'] as const).map(item => <Pressable key={item} accessibilityRole="radio" accessibilityState={{ selected: jobDraft.cadence === item }} onPress={() => updateJobDraft('cadence', item)} style={[s.cadence, jobDraft.cadence === item && s.cadenceSelected]}><Text style={[s.cadenceText, jobDraft.cadence === item && s.cadenceTextSelected]}>{item === 'once' ? 'One time' : 'Weekly'}</Text></Pressable>)}</View></View>
              </>}
              {!!formError && <View style={s.errorBox} accessibilityLiveRegion="polite"><Text style={s.errorText}>{formError}</Text></View>}
              <Text style={s.microCopy}>Local preview only. Nothing is added to a real customer account or sent to a worker.</Text>
            </ScrollView>
            <View style={s.modalActions}>
              {form === 'customer' && customerStep === 1
                ? <ActionButton label="Continue to first service" onPress={() => { const error = validateCustomer(); if (error) { setFormError(error); return; } setFormError(''); setCustomerStep(2); }}/>
                : <View style={s.actionRow}><ActionButton label={form === 'customer' ? 'Save customer and service' : 'Add sample visit'} disabled={saving} onPress={form === 'customer' ? saveCustomerWithService : saveJob}/><ActionButton label="Cancel" secondary onPress={requestCloseForm}/></View>}
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
      <Modal visible={discardOpen} transparent animationType="fade" onRequestClose={() => setDiscardOpen(false)}>
        <View style={s.confirmBackdrop}><View style={s.confirmCard}><Text style={s.modalEyebrow}>UNSAVED CHANGES</Text><Text style={s.modalTitle}>Discard this form?</Text><Text style={s.cardBody}>Your entries will be cleared from the form.</Text><View style={s.actionRow}><ActionButton label="Keep editing" secondary onPress={() => setDiscardOpen(false)}/><ActionButton label="Discard form" onPress={() => { setDiscardOpen(false); setForm(null); setFormError(''); }}/></View></View></View>
      </Modal>
      <Modal visible={completeOpen} transparent animationType="fade" onRequestClose={() => setCompleteOpen(false)}>
        <View style={s.confirmBackdrop}><View style={s.confirmCard}><Text style={s.modalEyebrow}>COMPLETE SAMPLE VISIT</Text><Text style={s.modalTitle}>Finish this visit?</Text><Text style={s.cardBody}>This marks the local sample visit complete. You can undo it from Today. No invoice or customer message is created.</Text><View style={s.actionRow}><ActionButton label="Go back" secondary onPress={() => setCompleteOpen(false)}/><ActionButton label="Finish visit" disabled={saving} onPress={() => workerAction('complete')}/></View></View></View>
      </Modal>
    </View>
  </SafeAreaView>;
}

export function DemoEntryOnly() {
  const [open, setOpen] = useState(false);
  if (open) return <WorkingDemo onExit={() => setOpen(false)}/>;
  return <SafeAreaView style={s.entrySafe}><View style={s.entry}>
    <View style={s.brandRow}><View style={s.brandMark}><Text style={s.brandMarkText}>G</Text></View><View><Text style={s.brand}>greencollar</Text><Text style={s.brandSub}>FIELD OPERATIONS</Text></View></View>
    <Tag tone="amber">PRIVATE PREVIEW</Tag>
    <Text style={s.entryTitle}>Make the workday feel lighter.</Text>
    <Text style={s.entryCopy}>Explore a working sample of GreenCollar’s customer, schedule and field-work flow.</Text>
    <View style={s.entryCard}><Text style={s.entryCardTitle}>Fictional sample workspace</Text><Text style={s.entryCardCopy}>Create a sample customer, plan a day and try the worker flow. Edits stay in this preview and can be reset at any time. If local storage is unavailable, edits clear when the page reloads.</Text></View>
    <ActionButton label="Open sample workspace" onPress={() => setOpen(true)}/>
    <Text style={s.entryFoot}>This preview is separate from production. No Clerk account, backend, GPS, messages or payments are connected.</Text>
  </View></SafeAreaView>;
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: palette.canvas }, app: { flex: 1, width: '100%', maxWidth: 1440, alignSelf: 'center', backgroundColor: palette.canvas },
  header: { minHeight: 76, paddingHorizontal: 24, paddingVertical: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: palette.line, backgroundColor: palette.paper, flexWrap: 'wrap', gap: 10 },
  headerWide: { paddingHorizontal: 44, minHeight: 88 }, headerCompact: { paddingHorizontal: 16, paddingVertical: 12 },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 10 }, brandMark: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.forest }, brandMarkText: { color: palette.lime, fontSize: 22, fontWeight: '900' },
  brand: { color: palette.ink, fontSize: 18, fontWeight: '900', letterSpacing: -0.6 }, brandSub: { color: palette.quiet, fontSize: 9, fontWeight: '800', letterSpacing: 1.5, marginTop: 2 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 12, flexWrap: 'wrap' }, headerRightCompact: { width: '100%', justifyContent: 'space-between' },
  previewLabel: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 9, paddingVertical: 7, borderRadius: 20, backgroundColor: palette.amberBg }, previewDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: palette.amber }, previewLabelText: { color: palette.amber, fontSize: 8, fontWeight: '900', letterSpacing: 0.7 },
  roleSwitch: { flexDirection: 'row', padding: 3, borderRadius: 12, backgroundColor: palette.soft }, roleChoice: { minHeight: 34, justifyContent: 'center', paddingHorizontal: 12, borderRadius: 9 }, roleChoiceSelected: { backgroundColor: palette.forest }, roleChoiceText: { color: palette.quiet, fontSize: 12, fontWeight: '700' }, roleChoiceTextSelected: { color: palette.paper },
  exit: { minHeight: 38, justifyContent: 'center', paddingHorizontal: 12, borderWidth: 1, borderColor: palette.line, borderRadius: 10 }, exitText: { color: palette.quiet, fontSize: 12, fontWeight: '700' },
  notice: { marginHorizontal: 20, marginTop: 16, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 9, borderRadius: 12, backgroundColor: palette.mint }, noticeWide: { marginHorizontal: 44, paddingHorizontal: 16 }, noticeTitle: { color: palette.forest, fontSize: 11, fontWeight: '900' }, noticeCopy: { flex: 1, color: palette.quiet, fontSize: 11, lineHeight: 16 },
  message: { marginHorizontal: 20, marginTop: 10, padding: 11, borderRadius: 10 }, messageInfo: { backgroundColor: '#E6F1E8' }, messageText: { color: palette.forest, fontSize: 12, lineHeight: 18, fontWeight: '600' },
  body: { flex: 1, flexDirection: 'row', minHeight: 0 }, bodyWide: { paddingHorizontal: 28, paddingTop: 24, gap: 22 }, sidebar: { width: 214, paddingTop: 8, paddingBottom: 18, paddingHorizontal: 8, borderRightWidth: 1, borderRightColor: palette.line }, sideCaption: { color: palette.quiet, fontSize: 9, fontWeight: '900', letterSpacing: 1.3, marginHorizontal: 10, marginTop: 10, marginBottom: 12 }, sideBottom: { marginTop: 'auto', paddingHorizontal: 8, gap: 8 }, sideCopy: { color: palette.quiet, fontSize: 11, lineHeight: 16, marginHorizontal: 10 },
  scroller: { flex: 1 }, content: { width: '100%', maxWidth: 760, alignSelf: 'center', paddingHorizontal: 20, paddingTop: 24, paddingBottom: 32, gap: 14 }, contentWide: { paddingHorizontal: 12, paddingTop: 2, paddingBottom: 44 },
  eyebrowRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }, eyebrow: { color: palette.pine, fontSize: 10, fontWeight: '900', letterSpacing: 1.5 }, h1: { color: palette.ink, fontSize: 30, lineHeight: 36, fontWeight: '800', letterSpacing: -1.1 }, lede: { color: palette.quiet, fontSize: 14, lineHeight: 21, marginTop: -7 },
  tag: { alignSelf: 'flex-start', paddingHorizontal: 9, paddingVertical: 5, borderRadius: 20, backgroundColor: palette.mint }, tagText: { color: palette.forest, fontSize: 9, fontWeight: '900', letterSpacing: 0.6 }, tagAmber: { backgroundColor: palette.amberBg }, tagAmberText: { color: palette.amber }, tagNeutral: { backgroundColor: palette.soft }, tagNeutralText: { color: palette.quiet },
  statsRow: { flexDirection: 'row', gap: 9, marginVertical: 2 }, stat: { flex: 1, minHeight: 78, padding: 12, justifyContent: 'center', gap: 5, borderRadius: 14, backgroundColor: palette.paper, borderWidth: 1, borderColor: palette.line }, statValue: { color: palette.ink, fontSize: 20, fontWeight: '800', letterSpacing: -0.4 }, statLabel: { color: palette.quiet, fontSize: 8, fontWeight: '900', letterSpacing: 0.9 },
  activeCard: { padding: 18, gap: 9, borderRadius: 18, backgroundColor: '#E8F1E5', borderWidth: 1, borderColor: '#CFE0CE' }, activeTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, timer: { color: palette.forest, fontSize: 22, fontWeight: '800', fontVariant: ['tabular-nums'] }, cardEyebrow: { color: palette.pine, fontSize: 9, fontWeight: '900', letterSpacing: 1.2 }, cardTitle: { color: palette.ink, fontSize: 18, fontWeight: '800', lineHeight: 24 }, cardBody: { color: palette.quiet, fontSize: 13, lineHeight: 19 },
  nextCard: { padding: 18, gap: 9, borderRadius: 18, backgroundColor: palette.paper, borderWidth: 1, borderColor: palette.line, borderTopWidth: 4, borderTopColor: palette.pine }, nextHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }, arrivalText: { color: palette.forest, fontWeight: '800', fontSize: 12 }, microCopy: { color: palette.quiet, fontSize: 11, lineHeight: 16 },
  action: { minHeight: 50, paddingHorizontal: 18, paddingVertical: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.forest, borderRadius: 12, flex: 1 }, actionText: { color: palette.paper, fontSize: 14, fontWeight: '800', textAlign: 'center' }, secondaryAction: { backgroundColor: palette.paper, borderWidth: 1, borderColor: palette.line }, secondaryActionText: { color: palette.forest }, disabledAction: { opacity: 0.45 }, pressed: { opacity: 0.8, transform: [{ scale: 0.99 }] }, actionRow: { flexDirection: 'row', gap: 9 },
  emptyCard: { padding: 20, gap: 9, borderRadius: 18, backgroundColor: palette.paper, borderWidth: 1, borderColor: palette.line }, emptyMark: { color: palette.pine, fontSize: 26, fontWeight: '900' }, emptyCopy: { color: palette.quiet, fontSize: 13, paddingVertical: 8 }, undoCard: { padding: 16, gap: 8, borderRadius: 14, backgroundColor: '#F4F0E8', borderWidth: 1, borderColor: '#E4D8BE' }, undoTitle: { color: palette.ink, fontSize: 14, fontWeight: '800' },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 7 }, sectionTitle: { color: palette.ink, fontSize: 18, fontWeight: '800' }, link: { color: palette.forest, fontSize: 12, fontWeight: '800' }, compactStop: { minHeight: 68, flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: palette.line }, stopNumber: { width: 34, height: 34, borderRadius: 11, backgroundColor: palette.soft, alignItems: 'center', justifyContent: 'center' }, stopNumberDone: { backgroundColor: palette.mint }, stopNumberText: { color: palette.quiet, fontSize: 10, fontWeight: '900' }, stopNumberTextDone: { color: palette.forest }, stopText: { flex: 1, gap: 3 }, stopTitle: { color: palette.ink, fontSize: 13, fontWeight: '800' }, stopMeta: { color: palette.quiet, fontSize: 11, lineHeight: 16 },
  panel: { padding: 17, gap: 13, borderRadius: 17, backgroundColor: palette.paper, borderWidth: 1, borderColor: palette.line }, panelSoft: { padding: 16, gap: 9, borderRadius: 16, backgroundColor: palette.mint }, panelTitle: { color: palette.ink, fontSize: 16, fontWeight: '800' }, planHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }, metrics: { flexDirection: 'row', justifyContent: 'space-between', gap: 8, paddingVertical: 10, borderTopWidth: 1, borderBottomWidth: 1, borderColor: palette.line }, metricText: { color: palette.quiet, fontSize: 11, fontWeight: '700' }, planStop: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: palette.line }, planIndex: { color: palette.pine, fontSize: 10, fontWeight: '900', width: 26 }, servicePrice: { color: palette.ink, fontSize: 12, fontWeight: '800' }, warning: { padding: 12, gap: 3, borderRadius: 12, backgroundColor: palette.amberBg }, warningTitle: { color: palette.amber, fontSize: 12, fontWeight: '900' }, warningCopy: { color: palette.quiet, fontSize: 11, lineHeight: 16 }, approvedCopy: { color: palette.forest, fontSize: 12, fontWeight: '700' }, errorText: { color: palette.red, fontSize: 12, lineHeight: 18, fontWeight: '700' }, errorBox: { padding: 10, borderRadius: 10, backgroundColor: palette.redBg },
  fieldWrap: { flex: 1, gap: 6 }, fieldLabel: { color: palette.ink, fontSize: 12, fontWeight: '700' }, input: { minHeight: 48, paddingHorizontal: 12, paddingVertical: 11, borderWidth: 1, borderColor: palette.line, borderRadius: 10, backgroundColor: '#FCFDFB', color: palette.ink, fontSize: 14 }, multilineInput: { minHeight: 78, textAlignVertical: 'top' }, fieldRow: { flexDirection: 'row', gap: 10 }, fieldFlex: { flex: 1 }, dateControls: { gap: 8 },
  customerCard: { padding: 16, gap: 10, borderRadius: 16, backgroundColor: palette.paper, borderWidth: 1, borderColor: palette.line }, customerTop: { flexDirection: 'row', alignItems: 'center', gap: 10 }, avatar: { width: 42, height: 42, borderRadius: 14, backgroundColor: palette.mint, alignItems: 'center', justifyContent: 'center' }, avatarText: { color: palette.forest, fontSize: 12, fontWeight: '900' }, customerInfo: { flex: 1, gap: 3 }, customerName: { color: palette.ink, fontSize: 15, fontWeight: '800' }, customerAddress: { color: palette.quiet, fontSize: 11, lineHeight: 16 }, customerContact: { color: palette.quiet, fontSize: 11, lineHeight: 16 }, customerServices: { borderTopWidth: 1, borderTopColor: palette.line, paddingTop: 8, gap: 6 }, serviceLine: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 }, serviceName: { color: palette.ink, fontSize: 11, fontWeight: '700', flex: 1 },
  scheduleCard: { flexDirection: 'row', gap: 12, minHeight: 110 }, scheduleRail: { width: 18, alignItems: 'center' }, scheduleDot: { width: 12, height: 12, borderRadius: 6, marginTop: 8, backgroundColor: '#B8C9B8', borderWidth: 2, borderColor: palette.canvas }, scheduleDotDone: { backgroundColor: palette.pine }, scheduleDotActive: { backgroundColor: '#E5AA43' }, scheduleLine: { width: 2, flex: 1, backgroundColor: palette.line, marginVertical: 4 }, scheduleBody: { flex: 1, padding: 14, gap: 6, borderRadius: 15, backgroundColor: palette.paper, borderWidth: 1, borderColor: palette.line }, scheduleTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, scheduleIndex: { color: palette.quiet, fontSize: 9, fontWeight: '900', letterSpacing: 1 }, scheduleMeta: { color: palette.forest, fontSize: 11, fontWeight: '700' },
  invoiceRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: palette.line }, emptyInline: { paddingVertical: 20, gap: 6 }, footer: { paddingTop: 16, gap: 4, alignItems: 'center' }, footerText: { color: '#7D8980', fontSize: 8, letterSpacing: 1.1, fontWeight: '800' },
  bottomNav: { minHeight: 65, flexDirection: 'row', alignItems: 'stretch', paddingHorizontal: 7, paddingTop: 6, paddingBottom: Platform.OS === 'ios' ? 12 : 6, backgroundColor: palette.paper, borderTopWidth: 1, borderTopColor: palette.line }, bottomNavCompact: { paddingHorizontal: 4 }, navItem: { minHeight: 48, minWidth: 52, flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4, borderRadius: 11, gap: 2 }, sideNavItem: { width: '100%', flex: 0, minWidth: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-start', paddingHorizontal: 12, gap: 12 }, navItemSelected: { backgroundColor: palette.mint }, navPressed: { opacity: 0.7 }, navMark: { color: '#839087', fontSize: 8, fontWeight: '900', letterSpacing: 0.7 }, navMarkSelected: { color: palette.forest }, navLabel: { color: palette.quiet, fontSize: 10, fontWeight: '700' }, navLabelSelected: { color: palette.forest, fontWeight: '900' }, resetNav: { minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 11, gap: 1 }, resetNavCompact: { minWidth: 40 }, resetNavMark: { color: palette.quiet, fontSize: 17, lineHeight: 20 }, resetNavLabel: { color: palette.quiet, fontSize: 9, fontWeight: '700' },
  modalBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(16, 34, 26, 0.42)' }, modal: { width: '100%', maxHeight: '94%', paddingTop: 14, paddingBottom: 12, borderTopLeftRadius: 22, borderTopRightRadius: 22, backgroundColor: palette.paper, overflow: 'hidden' }, modalWide: { maxWidth: 640, maxHeight: '90%', alignSelf: 'center', marginVertical: 'auto', borderRadius: 22 }, modalHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 18, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: palette.line }, backButton: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.soft }, backText: { color: palette.forest, fontSize: 28, lineHeight: 30 }, modalHeading: { flex: 1, gap: 3 }, modalEyebrow: { color: palette.pine, fontSize: 9, fontWeight: '900', letterSpacing: 1.2 }, modalTitle: { color: palette.ink, fontSize: 20, lineHeight: 26, fontWeight: '800' }, closeButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }, closeText: { color: palette.quiet, fontSize: 28 }, formScroll: { flexShrink: 1 }, formContent: { paddingHorizontal: 18, paddingTop: 14, paddingBottom: 18, gap: 13 }, formIntro: { color: palette.quiet, fontSize: 13, lineHeight: 19 }, modalActions: { paddingHorizontal: 18, paddingTop: 12, borderTopWidth: 1, borderTopColor: palette.line }, cadenceWrap: { gap: 8 }, cadenceRow: { flexDirection: 'row', gap: 8 }, cadence: { minHeight: 44, flex: 1, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: palette.line, borderRadius: 10 }, cadenceSelected: { backgroundColor: palette.mint, borderColor: palette.pine }, cadenceText: { color: palette.quiet, fontSize: 13, fontWeight: '700' }, cadenceTextSelected: { color: palette.forest, fontWeight: '900' }, customerChoices: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 }, customerChoice: { minHeight: 40, paddingHorizontal: 11, justifyContent: 'center', borderWidth: 1, borderColor: palette.line, borderRadius: 10, backgroundColor: palette.paper }, customerChoiceSelected: { backgroundColor: palette.mint, borderColor: palette.pine }, customerChoiceText: { color: palette.quiet, fontSize: 11, fontWeight: '700' }, customerChoiceTextSelected: { color: palette.forest, fontWeight: '900' }, confirmBackdrop: { flex: 1, justifyContent: 'center', padding: 22, backgroundColor: 'rgba(16, 34, 26, 0.48)' }, confirmCard: { width: '100%', maxWidth: 460, alignSelf: 'center', padding: 20, gap: 12, borderRadius: 18, backgroundColor: palette.paper },
  entrySafe: { flex: 1, backgroundColor: palette.canvas, justifyContent: 'center', padding: 22 }, entry: { width: '100%', maxWidth: 560, alignSelf: 'center', gap: 18 }, entryTitle: { color: palette.ink, fontSize: 38, lineHeight: 44, letterSpacing: -1.5, fontWeight: '800', marginTop: 8 }, entryCopy: { color: palette.quiet, fontSize: 16, lineHeight: 24, marginTop: -10 }, entryCard: { padding: 17, borderRadius: 16, backgroundColor: palette.paper, borderWidth: 1, borderColor: palette.line, gap: 7 }, entryCardTitle: { color: palette.ink, fontSize: 14, fontWeight: '800' }, entryCardCopy: { color: palette.quiet, fontSize: 13, lineHeight: 20 }, entryFoot: { color: palette.quiet, fontSize: 11, lineHeight: 17, textAlign: 'center' },
});
