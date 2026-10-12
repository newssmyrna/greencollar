import React, { useState, useEffect, useRef } from 'react';
import { ClerkProvider, useAuth, useClerk } from '@clerk/expo';
import { useHostedAuth } from '@clerk/expo/hosted-auth';
import { tokenCache } from '@clerk/expo/token-cache';
import { fetchDayData, type DayData } from './src/data/greencollar-api';
import { summarizeSavedDay } from './src/data/saved-day';
import { getBusinesses, createBusiness } from './src/data/business-api';
import { listSavedCustomers, createSavedCustomer, updateSavedCustomer, type SavedCustomer } from './src/data/customer-api';
import { listServiceLocations, createServiceLocation, listServiceAgreements, createServiceAgreement, type SavedServiceLocation, type SavedServiceAgreement, type ServiceFrequency } from './src/data/service-api';
import { startWork, pauseWork, resumeWork, completeWork, getElapsedMinutes, completionRecord, type WorkSession } from './src/domain/work-session';
import {saveVisitCompletion} from './src/data/visit-completion';
import {billableCompletedServices,invoiceFromCompletedService} from './src/domain/completed-invoice';
import {invoiceTotals,type InvoiceDraft} from './src/domain/invoice';
import {loadWorkSession,saveWorkSession} from './src/data/local-work-session';
import {
  Alert, SafeAreaView, ScrollView, View, Text, TextInput,
  Pressable, StyleSheet, StatusBar
} from 'react-native';

type Customer = {
  id: number;
  name: string;
  address: string;
  service: string;
  rate: number;
  minutes: number;
  notes: string;
};

const seed: Customer[] = [
  { id: 1, name: 'Jordan Smith', address: 'Edgewater, FL', service: 'Exterior maintenance', rate: 65, minutes: 45, notes: 'Close side gate.' },
  { id: 2, name: 'Morgan Davis', address: 'New Smyrna Beach, FL', service: 'Pool service', rate: 80, minutes: 35, notes: 'Call before arrival.' },
  { id: 3, name: 'Casey Johnson', address: 'Port Orange, FL', service: 'Cleaning', rate: 110, minutes: 90, notes: 'Use rear entrance.' },
];
const green = '#183d2b';
const pale = '#d5f48b';

function GreenCollarDashboard() {
  const {getToken,userId} = useAuth();
  const [savedDay,setSavedDay] = useState<DayData|null>(null);
  const [savedCustomers,setSavedCustomers] = useState<SavedCustomer[]>([]);
  const [savedCustomerName,setSavedCustomerName] = useState('');
  const [savedCustomerPhone,setSavedCustomerPhone] = useState('');
  const [savedCustomerEmail,setSavedCustomerEmail] = useState('');
  const [savedCustomerNotes,setSavedCustomerNotes] = useState('');
  const [editingSavedCustomerId,setEditingSavedCustomerId] = useState<string|null>(null);
  const [serviceSetupCustomer,setServiceSetupCustomer] = useState<SavedCustomer|null>(null);
  const [serviceLocations,setServiceLocations] = useState<SavedServiceLocation[]>([]);
  const [serviceAgreements,setServiceAgreements] = useState<SavedServiceAgreement[]>([]);
  const [selectedServiceLocationId,setSelectedServiceLocationId] = useState('');
  const [serviceAddress,setServiceAddress] = useState('');
  const [servicePreferences,setServicePreferences] = useState('');
  const [serviceName,setServiceName] = useState('');
  const [serviceRate,setServiceRate] = useState('');
  const [serviceMinutes,setServiceMinutes] = useState('60');
  const [serviceStartDate,setServiceStartDate] = useState(new Date().toLocaleDateString('en-CA'));
  const [serviceFrequency,setServiceFrequency] = useState<ServiceFrequency>('weekly');
  const [savedDayError,setSavedDayError] = useState('');
  const [loadingSaved,setLoadingSaved] = useState(false);
  const [businessName,setBusinessName] = useState('');
  const [connectedBusiness,setConnectedBusiness] = useState<{id:string;name:string}|null>(null);
  async function saveCompletedService() {
    if(!workSession||workSession.status!=='completed'||workSession.jobId==='demo-job')return;
    const api=process.env.EXPO_PUBLIC_GREENCOLLAR_API_URL;
    if(!api){setTimerError('API URL not configured');return;}
    if(submitting.current||workSession.completionSaved)return;
    submitting.current=true;setLoadingSaved(true);setTimerError('');
    try {
      const token=await getToken({template:'greencollar-api'});
      if(!token)throw new Error('Sign in first');
      const businessId=workSession.businessId;
      const serviceDate=workSession.serviceDate;
      if(!businessId||!serviceDate)throw new Error('This restored timer has no saved visit identity. Review its duration, then discard it to continue.');
      const prefix=workSession.jobId;
      const agreementId=prefix.slice(0,-(serviceDate.length+1));
      if(!agreementId||!prefix.endsWith(':'+serviceDate))throw new Error('Invalid scheduled visit');
      await saveVisitCompletion(api,token,{businessId,agreementId,date:serviceDate,actualMinutes:completionRecord(workSession).actualMinutes});
      setWorkSession({...workSession,completionSaved:true});
      if(connectedBusiness?.id===businessId)setSavedDay(await fetchDayData(api,businessId,serviceDate,token));
    } catch(e) {setTimerError(e instanceof Error?e.message:'Unable to save completed service');}
    finally {submitting.current=false;setLoadingSaved(false);}
  }
  async function findMyBusiness() {
    const api=process.env.EXPO_PUBLIC_GREENCOLLAR_API_URL;
    if(!api){setSavedDayError('API URL not configured yet.');return;}
    setLoadingSaved(true);setSavedDayError('');
    try {
      const token=await getToken({template:'greencollar-api'});
      if(!token)throw new Error('Sign in first');
      const businesses=await getBusinesses(api,token);
      if(!businesses.length)throw new Error('No saved business yet. Create one below.');
      setConnectedBusiness(businesses[0]);
    }catch(e){setSavedDayError(e instanceof Error?e.message:'Unable to find your business');}
    finally{setLoadingSaved(false);}
  }
  async function loadSavedDay() {
    const api=process.env.EXPO_PUBLIC_GREENCOLLAR_API_URL;
    if(!api){setSavedDayError('API URL not configured yet.');return;}
    setLoadingSaved(true);setSavedDayError('');
    try{
      const token=await getToken({template:'greencollar-api'});
      if(!token)throw new Error('Sign in first');
      const businesses=await getBusinesses(api,token);
      const business=connectedBusiness?.id??businesses[0]?.id;
      if(!business)throw new Error('Create a business before loading its workday');
      if(!connectedBusiness)setConnectedBusiness(businesses[0]);
      const date=new Date().toLocaleDateString('en-CA');
      setSavedDay(await fetchDayData(api,business,date,token));
    }catch(e){setSavedDayError(e instanceof Error?e.message:'Unable to load saved data');}
    finally{setLoadingSaved(false);}
  }
  const [tab, setTab] = useState<'today' | 'customers' | 'planner' | 'invoices'>('today');
  const [customers, setCustomers] = useState<Customer[]>(seed);
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [hours, setHours] = useState('8');
  const [maxJobs, setMaxJobs] = useState('6');
  const [planned, setPlanned] = useState(false);
  const [workSession,setWorkSession]=useState<WorkSession|null>(null);
  const [timerNow,setTimerNow]=useState(Date.now());
  const [timerError,setTimerError]=useState('');

  const [invoiceDrafts,setInvoiceDrafts]=useState<InvoiceDraft[]>([]);
  const [invoiceError,setInvoiceError]=useState('');
  function prepareInvoiceDrafts(){
    if(!savedDay||!connectedBusiness){setInvoiceError('Load a saved workday and business first');return;}
    try {
      const jobs=billableCompletedServices(savedDay,connectedBusiness.id);
      setInvoiceDrafts(previous=>{
        const prior=new Map(previous.map(d=>[d.id,d]));
        for(const j of jobs){
          const id='draft:'+j.businessId+':'+j.agreementId+':'+j.visitDate;
          if(!prior.has(id))prior.set(id,invoiceFromCompletedService(j,id,j.visitDate));
        }
        return [...prior.values()];
      });
      setInvoiceError('');
    }catch(e){setInvoiceError(e instanceof Error?e.message:'Could not prepare drafts');}
  }
  function editDraftPrice(id:string,value:string){
    if(!/^\d+(\.\d{0,2})?$/.test(value))return;
    const dollars=Number(value);
    if(!Number.isFinite(dollars)||dollars>1000000)return;
    const cents=Math.round(dollars*100);
    setInvoiceDrafts(prev=>prev.map(d=>d.id===id&&d.status==='draft'?{...d,lines:d.lines.map((line,i)=>i===0?{...line,unitPriceCents:cents}:line)}:d));
  }
  const [timerRestored,setTimerRestored]=useState(false);
  const submitting=useRef(false);
  useEffect(()=>{
    let active=true;
    setTimerRestored(false);
    setWorkSession(null);
    if(!userId){return ()=>{active=false;};}
    void loadWorkSession(userId).then(saved=>{
      if(active){setWorkSession(saved);setTimerRestored(true);}
    }).catch(()=>{if(active){setTimerError('Could not restore job timer');setTimerRestored(true);}});
    return ()=>{active=false;};
  },[userId]);
  useEffect(()=>{
    if(!userId||!timerRestored)return;
    void saveWorkSession(userId,workSession).catch(()=>setTimerError('Could not preserve job timer'));
  },[userId,timerRestored,workSession]);
  function timerAction(action:'start'|'pause'|'resume'|'complete', jobId='demo-job') {
    try {
      if(!timerRestored)throw new Error('Timer is restoring');
      const now=Date.now();setTimerNow(now);setTimerError('');
      if(action==='start'){
        if(workSession?.status==='completed'&&workSession.jobId!=='demo-job'&&!workSession.completionSaved)throw new Error('Save or explicitly discard the completed visit before starting another job');
        const visit=jobId==='demo-job'?undefined:connectedBusiness&&savedDay?{businessId:connectedBusiness.id,serviceDate:savedDay.date}:undefined;
        if(jobId!=='demo-job'&&!visit)throw new Error('Load a saved workday before starting a scheduled service');
        setWorkSession(startWork(jobId,now,visit));return;
      }
      if(!workSession)throw new Error('Start a job first');
      const next=action==='pause'?pauseWork(workSession,now):action==='resume'?resumeWork(workSession,now):completeWork(workSession,now);
      setWorkSession(next);
    }catch(e){setTimerError(e instanceof Error?e.message:'Timer error');}
  }

  function discardCompletedVisit() {
    Alert.alert('Discard unsaved visit?', 'The recorded duration will be removed from this device. The server may already have accepted a request if the connection failed; retry Save first if you are unsure.', [
      {text:'Keep visit',style:'cancel'},
      {text:'Discard visit',style:'destructive',onPress:()=>{setWorkSession(null);setTimerError('');}}
    ]);
  }

  function addCustomer() {
    if (!name.trim() || !address.trim()) return;
    setCustomers(prev => [...prev, {
      id: Date.now(), name: name.trim(), address: address.trim(),
      service: 'General service', rate: 0, minutes: 60, notes: ''
    }]);
    setName(''); setAddress('');
  }
  async function loadSavedCustomers() {
    const api=process.env.EXPO_PUBLIC_GREENCOLLAR_API_URL;
    if(!api||!connectedBusiness){setSavedDayError('Load your business first');return;}
    setLoadingSaved(true);setSavedDayError('');
    try {
      const token=await getToken({template:'greencollar-api'});
      if(!token)throw new Error('Sign in first');
      setSavedCustomers(await listSavedCustomers(api,connectedBusiness.id,token));
    }catch(e){setSavedDayError(e instanceof Error?e.message:'Could not load customers');}
    finally{setLoadingSaved(false);}
  }
  async function saveCustomer() {
    const api=process.env.EXPO_PUBLIC_GREENCOLLAR_API_URL;
    if(!api||!connectedBusiness){setSavedDayError('Load your business first');return;}
    if(!savedCustomerName.trim()){setSavedDayError('Customer name is required');return;}
    setLoadingSaved(true);setSavedDayError('');
    try {
      const token=await getToken({template:'greencollar-api'});
      if(!token)throw new Error('Sign in first');
      const details={name:savedCustomerName.trim(),phone:savedCustomerPhone.trim()||undefined,email:savedCustomerEmail.trim()||undefined,notes:savedCustomerNotes.trim()||undefined};
      if(editingSavedCustomerId)await updateSavedCustomer(api,connectedBusiness.id,token,editingSavedCustomerId,details);
      else await createSavedCustomer(api,connectedBusiness.id,token,details);
      setSavedCustomers(await listSavedCustomers(api,connectedBusiness.id,token));
      setSavedCustomerName('');setSavedCustomerPhone('');setSavedCustomerEmail('');setSavedCustomerNotes('');
      setEditingSavedCustomerId(null);
    }catch(e){setSavedDayError(e instanceof Error?e.message:'Could not save customer');}
    finally{setLoadingSaved(false);}
  }
  function editSavedCustomer(customer:SavedCustomer) {
    setSavedCustomerName(customer.name);setSavedCustomerPhone(customer.phone??'');
    setSavedCustomerEmail(customer.email??'');setSavedCustomerNotes(customer.notes??'');
    setEditingSavedCustomerId(customer.id);setSavedDayError('');
  }
  function cancelSavedCustomerEdit() {
    setSavedCustomerName('');setSavedCustomerPhone('');setSavedCustomerEmail('');setSavedCustomerNotes('');
    setEditingSavedCustomerId(null);setSavedDayError('');
  }
  async function openServiceSetup(customer:SavedCustomer) {
    const api=process.env.EXPO_PUBLIC_GREENCOLLAR_API_URL;
    if(!api||!connectedBusiness){setSavedDayError('Load your business first');return;}
    setServiceSetupCustomer(customer);setSelectedServiceLocationId('');setSavedDayError('');
    setLoadingSaved(true);
    try{
      const token=await getToken({template:'greencollar-api'});
      if(!token)throw new Error('Sign in first');
      const [locations,agreements]=await Promise.all([
        listServiceLocations(api,connectedBusiness.id,token,customer.id),
        listServiceAgreements(api,connectedBusiness.id,token)
      ]);
      setServiceLocations(locations);setServiceAgreements(agreements);
      if(locations.length)setSelectedServiceLocationId(locations[0].id);
    }catch(e){setSavedDayError(e instanceof Error?e.message:'Could not load service setup');}
    finally{setLoadingSaved(false);}
  }
  async function saveServiceLocation() {
    const api=process.env.EXPO_PUBLIC_GREENCOLLAR_API_URL;
    if(!api||!connectedBusiness||!serviceSetupCustomer){setSavedDayError('Select a saved customer first');return;}
    if(!serviceAddress.trim()){setSavedDayError('Service address is required');return;}
    setLoadingSaved(true);setSavedDayError('');
    try{
      const token=await getToken({template:'greencollar-api'});
      if(!token)throw new Error('Sign in first');
      const location=await createServiceLocation(api,connectedBusiness.id,token,{
        customerId:serviceSetupCustomer.id,address:serviceAddress.trim(),
        preferences:servicePreferences.trim()||undefined
      });
      const locations=await listServiceLocations(api,connectedBusiness.id,token,serviceSetupCustomer.id);
      setServiceLocations(locations);setSelectedServiceLocationId(location.id);
      setServiceAddress('');setServicePreferences('');
    }catch(e){setSavedDayError(e instanceof Error?e.message:'Could not save service location');}
    finally{setLoadingSaved(false);}
  }
  async function saveServiceAgreement() {
    const api=process.env.EXPO_PUBLIC_GREENCOLLAR_API_URL;
    if(!api||!connectedBusiness||!serviceSetupCustomer||!selectedServiceLocationId){setSavedDayError('Choose a saved service location first');return;}
    const dollars=Number(serviceRate),minutes=Number(serviceMinutes);
    if(!serviceName.trim()||!Number.isFinite(dollars)||dollars<0||dollars>1000000||!Number.isInteger(minutes)||minutes<1||minutes>1440){
      setSavedDayError('Enter a service name, a rate from $0 to $1,000,000, and a duration from 1 to 1,440 minutes');return;
    }
    setLoadingSaved(true);setSavedDayError('');
    try{
      const token=await getToken({template:'greencollar-api'});
      if(!token)throw new Error('Sign in first');
      await createServiceAgreement(api,connectedBusiness.id,token,{
        customerId:serviceSetupCustomer.id,locationId:selectedServiceLocationId,
        serviceName:serviceName.trim(),rateCents:Math.round(dollars*100),estimatedMinutes:minutes,
        startsOn:serviceStartDate,frequency:serviceFrequency
      });
      setServiceAgreements(await listServiceAgreements(api,connectedBusiness.id,token));
      setServiceName('');setServiceRate('');
      const date=new Date().toLocaleDateString('en-CA');
      setSavedDay(await fetchDayData(api,connectedBusiness.id,date,token));
    }catch(e){setSavedDayError(e instanceof Error?e.message:'Could not save service agreement');}
    finally{setLoadingSaved(false);}
  }
  async function registerBusiness() {
    const api=process.env.EXPO_PUBLIC_GREENCOLLAR_API_URL;
    if(!api){setSavedDayError('API URL not configured yet.');return;}
    if(!businessName.trim())return;
    setLoadingSaved(true);setSavedDayError('');
    try {
      const token=await getToken({template:'greencollar-api'});
      if(!token)throw new Error('Sign in first');
      const business=await createBusiness(api,token,businessName.trim());
      setConnectedBusiness(business);
      setBusinessName('');
    }catch(e){setSavedDayError(e instanceof Error?e.message:'Unable to create business');}
    finally{setLoadingSaved(false);}
  }
  const visible = customers.slice(0, Math.max(0, parseInt(maxJobs, 10) || 0));
  const estimatedMinutes = visible.reduce((total, c) => total + c.minutes, 0);

  return (
    <SafeAreaView style={styles.page}>
      <StatusBar barStyle="light-content" />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.logo}>greencollar.</Text>
        <Text style={styles.subtitle}>Your business. On autopilot.</Text>
        <View style={styles.tabs}>
          {(['today', 'customers', 'planner', 'invoices'] as const).map(t => (
            <Pressable key={t} style={[styles.tab, tab === t && styles.activeTab]} onPress={() => setTab(t)}>
              <Text style={[styles.tabText, tab === t && styles.activeTabText]}>{t.toUpperCase()}</Text>
            </Pressable>
          ))}
        </View>

        {tab === 'today' && <>
          <Text style={styles.heading}>Today's overview</Text>
          <View style={styles.card}>
            <Text style={styles.cardHeading}>Job timer</Text>
            <Text style={styles.muted}>Use a saved scheduled service below to record its completion. The timer is saved on this device and restored after reopening.</Text>
            <Text style={styles.big}>{workSession?getElapsedMinutes(workSession,timerNow):0} min</Text>
            <Text style={styles.body}>Status: {workSession?.status??'not started'} {workSession?.jobId!=='demo-job'&&workSession?.jobId?'· Saved visit':''}</Text>
            {!workSession && <Pressable style={styles.primary} onPress={()=>timerAction('start')}><Text style={styles.primaryText}>Start demo job</Text></Pressable>}
            {workSession?.status==='running' && <Pressable style={styles.primary} onPress={()=>timerAction('pause')}><Text style={styles.primaryText}>Pause job</Text></Pressable>}
            {workSession?.status==='paused' && <Pressable style={styles.primary} onPress={()=>timerAction('resume')}><Text style={styles.primaryText}>Resume job</Text></Pressable>}
            {workSession && workSession.status!=='completed' && <Pressable style={styles.primary} onPress={()=>timerAction('complete')}><Text style={styles.primaryText}>Complete job</Text></Pressable>}
            {workSession?.status==='running' && <Pressable style={styles.primary} onPress={()=>setTimerNow(Date.now())}><Text style={styles.primaryText}>Refresh elapsed time</Text></Pressable>}
            {workSession?.status==='completed' && <Text style={styles.body}>Recorded demo duration: {completionRecord(workSession).actualMinutes} min</Text>}
            {workSession?.status==='completed' && workSession.jobId!=='demo-job' && !workSession.completionSaved && <><Pressable style={styles.primary} disabled={loadingSaved} onPress={()=>void saveCompletedService()}><Text style={styles.primaryText}>Save completed visit</Text></Pressable><Pressable style={[styles.primary,{backgroundColor:'#f0f5ef'}]} onPress={discardCompletedVisit}><Text style={styles.primaryText}>Discard unsaved visit</Text></Pressable></>}
            {workSession?.completionSaved && <Text style={styles.body}>Visit completion saved to Cloudflare.</Text>}
            {workSession?.status==='completed' && workSession.jobId==='demo-job' && <Pressable style={styles.primary} onPress={()=>timerAction('start')}><Text style={styles.primaryText}>Start another demo</Text></Pressable>}
            {!!timerError && <Text style={styles.muted}>{timerError}</Text>}
          </View>
          <Text style={styles.muted}>Prototype customer cards below use synthetic data. Saved Cloudflare records load separately.</Text>
          {!connectedBusiness && <View style={styles.card}><Text style={styles.cardHeading}>Create or find your business</Text><Pressable style={styles.primary} disabled={loadingSaved} onPress={()=>void findMyBusiness()}><Text style={styles.primaryText}>Find my saved business</Text></Pressable><TextInput style={styles.input} placeholder="Business name" placeholderTextColor="#819b8b" value={businessName} onChangeText={setBusinessName}/><Pressable style={styles.primary} disabled={loadingSaved} onPress={()=>void registerBusiness()}><Text style={styles.primaryText}>Create business</Text></Pressable><Text style={styles.muted}>Already registered? Find your saved business above. Otherwise create a new one.</Text></View>}
          {connectedBusiness && <Text style={styles.muted}>Business: {connectedBusiness.name}</Text>}
          <Pressable style={styles.primary} disabled={loadingSaved} onPress={()=>void loadSavedDay()}><Text style={styles.primaryText}>{loadingSaved?'Loading...':'Load saved workday'}</Text></Pressable>
          {!!savedDayError && <Text style={styles.muted}>{savedDayError}</Text>}
          {savedDay && <View style={styles.card}><Text style={styles.cardHeading}>Due today · Saved records</Text><Text style={styles.body}>{summarizeSavedDay(savedDay).pendingCount} jobs due · ${(summarizeSavedDay(savedDay).estimatedRevenueCents / 100).toFixed(2)} expected revenue · {summarizeSavedDay(savedDay).estimatedServiceMinutes} service minutes</Text><Text style={styles.muted}>{summarizeSavedDay(savedDay).completedCount} completed · {summarizeSavedDay(savedDay).skippedCount} skipped. Due-work preview only; no road routing or fuel estimate yet.</Text>{summarizeSavedDay(savedDay).due.slice(0,12).map(j=><View key={j.id}><Text style={styles.body}>{j.customer} · {j.service} · {j.address}</Text><Pressable style={styles.primary} disabled={!!workSession&&(workSession.status!=='completed'||(workSession.jobId!=='demo-job'&&!workSession.completionSaved))} onPress={()=>timerAction('start',j.id)}><Text style={styles.primaryText}>Start this service</Text></Pressable></View>)}</View>}
          <View style={styles.card}>
            <Text style={styles.label}>Example customers</Text>
            <Text style={styles.big}>{customers.length}</Text>
          </View>
          <View style={styles.card}>
            <Text style={styles.label}>Next development milestone</Text>
            <Text style={styles.body}>Connected customer records, real constraints, road routing, and a live job workflow.</Text>
          </View>
        </>}

        {tab === 'customers' && <>
          <Text style={styles.heading}>Customers</Text>
          <View style={styles.card}>
            <Text style={styles.cardHeading}>Saved customers · Cloudflare</Text>
            {connectedBusiness ? <>
              <Pressable style={styles.primary} disabled={loadingSaved} onPress={()=>void loadSavedCustomers()}><Text style={styles.primaryText}>Load saved customers</Text></Pressable>
              {savedCustomers.map(c=><View key={c.id} style={styles.card}>
                <Text style={styles.cardHeading}>{c.name}</Text>
                {!!c.phone&&<Text style={styles.body}>{c.phone}</Text>}
                {!!c.email&&<Text style={styles.body}>{c.email}</Text>}
                {!!c.notes&&<Text style={styles.muted}>{c.notes}</Text>}
                <Pressable style={styles.primary} onPress={()=>editSavedCustomer(c)}><Text style={styles.primaryText}>Edit profile</Text></Pressable>
                <Pressable style={[styles.primary,{backgroundColor:'#f0f5ef'}]} disabled={loadingSaved} onPress={()=>void openServiceSetup(c)}><Text style={styles.primaryText}>Set up service</Text></Pressable>
              </View>)}
              {serviceSetupCustomer&&<View style={styles.card}>
                <Text style={styles.cardHeading}>Service setup · {serviceSetupCustomer.name}</Text>
                <Pressable style={[styles.primary,{backgroundColor:'#f0f5ef'}]} onPress={()=>setServiceSetupCustomer(null)}><Text style={styles.primaryText}>Close service setup</Text></Pressable>
                <Text style={styles.label}>Saved service locations</Text>
                {!serviceLocations.length&&<Text style={styles.muted}>No service address saved yet.</Text>}
                {serviceLocations.map(location=><Pressable key={location.id} style={[styles.primary,{backgroundColor:selectedServiceLocationId===location.id?pale:'#f0f5ef'}]} onPress={()=>setSelectedServiceLocationId(location.id)}>
                  <Text style={styles.primaryText}>{selectedServiceLocationId===location.id?'Selected · ':''}{location.address}</Text>
                  {!!location.preferences&&<Text style={styles.muted}>{location.preferences}</Text>}
                </Pressable>)}
                <TextInput style={styles.input} placeholder="Service address" placeholderTextColor="#819b8b" value={serviceAddress} onChangeText={setServiceAddress}/>
                <TextInput style={styles.input} placeholder="Site preferences (optional)" placeholderTextColor="#819b8b" multiline value={servicePreferences} onChangeText={setServicePreferences}/>
                <Pressable style={styles.primary} disabled={loadingSaved||!serviceAddress.trim()} onPress={()=>void saveServiceLocation()}><Text style={styles.primaryText}>Save service location</Text></Pressable>
                {!!selectedServiceLocationId&&<>
                  <Text style={styles.label}>New recurring service</Text>
                  <TextInput style={styles.input} placeholder="Service name" placeholderTextColor="#819b8b" value={serviceName} onChangeText={setServiceName}/>
                  <TextInput style={styles.input} placeholder="Rate in dollars" placeholderTextColor="#819b8b" keyboardType="decimal-pad" value={serviceRate} onChangeText={setServiceRate}/>
                  <TextInput style={styles.input} placeholder="Estimated minutes" placeholderTextColor="#819b8b" keyboardType="number-pad" value={serviceMinutes} onChangeText={setServiceMinutes}/>
                  <TextInput style={styles.input} placeholder="Start date (YYYY-MM-DD)" placeholderTextColor="#819b8b" value={serviceStartDate} onChangeText={setServiceStartDate}/>
                  <Text style={styles.label}>Repeat</Text>
                  <View style={styles.tabs}>{(['weekly','biweekly','monthly','daily'] as const).map(frequency=><Pressable key={frequency} style={[styles.tab,serviceFrequency===frequency&&styles.activeTab]} onPress={()=>setServiceFrequency(frequency)}><Text style={[styles.tabText,serviceFrequency===frequency&&styles.activeTabText]}>{frequency.toUpperCase()}</Text></Pressable>)}</View>
                  <Text style={styles.muted}>Weekly repeats every 7 days from the start date. Add a weekday picker before using a fixed weekday schedule.</Text>
                  <Pressable style={styles.primary} disabled={loadingSaved||!serviceName.trim()||!serviceRate.trim()} onPress={()=>void saveServiceAgreement()}><Text style={styles.primaryText}>Save recurring service</Text></Pressable>
                </>}
                <Text style={styles.label}>Existing agreements</Text>
                {serviceAgreements.filter(a=>a.customer_id===serviceSetupCustomer.id).map(a=><Text key={a.id} style={styles.body}>{a.service_name} · ${(a.rate_cents/100).toFixed(2)} · {a.frequency} · {a.active?'active':'inactive'}</Text>)}
              </View>}
              <Text style={styles.cardHeading}>{editingSavedCustomerId?'Edit saved customer':'Add saved customer'}</Text>
              <TextInput style={styles.input} placeholder="Customer name" placeholderTextColor="#819b8b" value={savedCustomerName} onChangeText={setSavedCustomerName}/>
              <TextInput style={styles.input} placeholder="Phone (optional)" placeholderTextColor="#819b8b" keyboardType="phone-pad" value={savedCustomerPhone} onChangeText={setSavedCustomerPhone}/>
              <TextInput style={styles.input} placeholder="Email (optional)" placeholderTextColor="#819b8b" keyboardType="email-address" autoCapitalize="none" value={savedCustomerEmail} onChangeText={setSavedCustomerEmail}/>
              <TextInput style={styles.input} placeholder="Notes (optional)" placeholderTextColor="#819b8b" multiline value={savedCustomerNotes} onChangeText={setSavedCustomerNotes}/>
              <Pressable style={styles.primary} disabled={loadingSaved||!savedCustomerName.trim()} onPress={()=>void saveCustomer()}><Text style={styles.primaryText}>{editingSavedCustomerId?'Save profile':'Save customer securely'}</Text></Pressable>
              {editingSavedCustomerId&&<Pressable style={[styles.primary,{backgroundColor:'#f0f5ef'}]} onPress={cancelSavedCustomerEdit}><Text style={styles.primaryText}>Cancel edit</Text></Pressable>}
            </> : <Text style={styles.muted}>Create or load your business on Today before saving real customers.</Text>}
            {!!savedDayError && <Text style={styles.muted}>{savedDayError}</Text>}
          </View>
          <Text style={styles.heading}>Sample data · Not saved</Text>
          {customers.map(c => <View key={c.id} style={styles.card}>
            <Text style={styles.cardHeading}>{c.name}</Text>
            <Text style={styles.muted}>{c.address} · {c.service}</Text>
            <Text style={styles.body}>Rate ${c.rate} · Estimated {c.minutes} min</Text>
            {!!c.notes && <Text style={styles.label}>Reminder: {c.notes}</Text>}
          </View>)}
          <Text style={styles.heading}>Add example customer</Text>
          <TextInput style={styles.input} placeholder="Customer name" placeholderTextColor="#819b8b" value={name} onChangeText={setName} />
          <TextInput style={styles.input} placeholder="Service address" placeholderTextColor="#819b8b" value={address} onChangeText={setAddress} />
          <Pressable style={styles.primary} onPress={addCustomer}><Text style={styles.primaryText}>Add customer</Text></Pressable>
          <Text style={styles.muted}>Example cards above are in memory only. Use the saved-customer section for database records.</Text>
        </>}

        {tab === 'invoices' && <>
          <Text style={styles.heading}>Invoices · Draft review</Text>
          <Text style={styles.muted}>These are local previews. No invoice has been saved, sent, charged, or marked paid.</Text>
          <Pressable style={styles.primary} disabled={!savedDay||!connectedBusiness} onPress={prepareInvoiceDrafts}><Text style={styles.primaryText}>Prepare drafts from completed visits</Text></Pressable>
          {!!invoiceError && <Text style={styles.muted}>{invoiceError}</Text>}
          {invoiceDrafts.map(d=><View key={d.id} style={styles.card}>
            <Text style={styles.cardHeading}>{d.lines[0]?.description||'Invoice'} · {d.status}</Text>
            <Text style={styles.muted}>Customer: {savedDay?.customers.find(c=>c.id===d.customerId)?.name??d.customerId}</Text>
            <Text style={styles.muted}>Service date: {d.issuedOn} · Due: {d.dueOn}</Text>
            <Text style={styles.label}>Service price (USD)</Text>
            <TextInput style={styles.input} keyboardType="decimal-pad" value={(d.lines[0].unitPriceCents/100).toFixed(2)} onChangeText={v=>editDraftPrice(d.id,v)}/>
            <Text style={styles.body}>Draft total: ${(invoiceTotals(d.lines,d.taxBasisPoints).totalCents/100).toFixed(2)}</Text>
            <Text style={styles.muted}>Tax defaults to $0. Review tax treatment before issuing. Save, send, and payment tracking are not connected yet.</Text>
          </View>)}
          {!invoiceDrafts.length && <Text style={styles.muted}>No drafts prepared. Load a workday with completed visits on Today first.</Text>}
        </>}
        {tab === 'planner' && <>
          <Text style={styles.heading}>Plan your day</Text>
          <Text style={styles.label}>Hours available</Text>
          <TextInput keyboardType="numeric" style={styles.input} value={hours} onChangeText={v => { setHours(v); setPlanned(false); }} />
          <Text style={styles.label}>Maximum jobs</Text>
          <TextInput keyboardType="numeric" style={styles.input} value={maxJobs} onChangeText={v => { setMaxJobs(v); setPlanned(false); }} />
          <Pressable style={styles.primary} onPress={() => setPlanned(true)}><Text style={styles.primaryText}>Preview workload</Text></Pressable>
          {planned && <View style={styles.card}>
            <Text style={styles.cardHeading}>Workload preview</Text>
            <Text style={styles.body}>{visible.length} example jobs · {estimatedMinutes} min service time</Text>
            <Text style={styles.muted}>Available: {hours || '0'} hours. This is NOT an optimized route: road travel, scheduling constraints, and fuel are not yet connected.</Text>
          </View>}
        </>}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#0e261b' },
  content: { padding: 20, paddingBottom: 50, gap: 12, maxWidth: 680, width: '100%', alignSelf: 'center' },
  logo: { color: pale, fontSize: 34, fontWeight: '900', marginTop: 14 },
  subtitle: { color: '#c4d9cc', fontSize: 14, marginBottom: 12 },
  tabs: { flexDirection: 'row', backgroundColor: '#193c2c', borderRadius: 12, padding: 5, marginBottom: 8 },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: 9 },
  activeTab: { backgroundColor: pale },
  tabText: { color: '#c4d9cc', fontSize: 11, fontWeight: '800' },
  activeTabText: { color: green },
  heading: { color: '#fff', fontSize: 21, fontWeight: '800', marginTop: 7 },
  card: { padding: 16, backgroundColor: '#1a3c2b', borderRadius: 14, gap: 7 },
  cardHeading: { color: '#fff', fontSize: 17, fontWeight: '700' },
  big: { color: pale, fontSize: 34, fontWeight: '900' },
  muted: { color: '#a9c2b2', lineHeight: 20, fontSize: 13 },
  body: { color: '#f0f5ef', fontSize: 14, lineHeight: 21 },
  label: { color: '#c4d9cc', fontSize: 13, fontWeight: '600' },
  input: { color: '#fff', borderWidth: 1, borderColor: '#547562', backgroundColor: '#173826', padding: 14, borderRadius: 10 },
  primary: { backgroundColor: pale, padding: 15, borderRadius: 10, alignItems: 'center', marginTop: 5 },
  primaryText: { color: green, fontWeight: '800' },
});

function AuthGate() {
  const { isLoaded, isSignedIn } = useAuth();
  const { startHostedAuth } = useHostedAuth();
  const { signOut } = useClerk();
  const [authError, setAuthError] = useState('');
  if (!isLoaded) return <SafeAreaView style={styles.page}><Text style={styles.logo}>greencollar.</Text><Text style={styles.muted}>Loading secure sign-in...</Text></SafeAreaView>;
  if (isSignedIn) return <><GreenCollarDashboard/><Pressable accessibilityRole="button" style={{backgroundColor:'#183d2b',padding:10,alignItems:'center'}} onPress={() => void signOut()}><Text style={{color:'#d5f48b'}}>Sign out</Text></Pressable></>;
  return (
    <SafeAreaView style={[styles.page,{justifyContent:'center',padding:24,gap:16}]}>
      <Text style={styles.logo}>greencollar.</Text>
      <Text style={styles.subtitle}>Your business. On autopilot.</Text>
      <Pressable style={styles.primary} onPress={() => {setAuthError('');void startHostedAuth({mode:'sign-in'}).catch(() => setAuthError('Unable to open sign-in. Check Clerk Native API configuration.'));}}><Text style={styles.primaryText}>Sign in</Text></Pressable>
      <Pressable style={[styles.primary,{backgroundColor:'#f0f5ef'}]} onPress={() => {setAuthError('');void startHostedAuth({mode:'sign-up'}).catch(() => setAuthError('Unable to open sign-up. Check Clerk Native API configuration.'));}}><Text style={styles.primaryText}>Create account</Text></Pressable>
      {!!authError && <Text style={styles.muted}>{authError}</Text>}
      <Text style={styles.muted}>Development build. Customer records are still example data until business onboarding is connected.</Text>
    </SafeAreaView>
  );
}

export default function App() {
  const key = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY;
  if (!key) return (
    <SafeAreaView style={[styles.page,{padding:24,justifyContent:'center'}]}>
      <Text style={styles.logo}>greencollar.</Text>
      <Text style={styles.muted}>Clerk publishable key not configured. Add EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY to your local .env file.</Text>
    </SafeAreaView>
  );
  return <ClerkProvider publishableKey={key} tokenCache={tokenCache}><AuthGate/></ClerkProvider>;
}
