import React, { useState, useEffect, useRef } from 'react';
import * as Location from 'expo-location';
import { ClerkProvider, useAuth, useClerk } from '@clerk/expo';
import { useHostedAuth } from '@clerk/expo/hosted-auth';
import { tokenCache } from '@clerk/expo/token-cache';
import { fetchDayData, type DayData } from './src/data/greencollar-api';
import { summarizeSavedDay } from './src/data/saved-day';
import { getBusinesses, createBusiness } from './src/data/business-api';
import { listSavedCustomers, createSavedCustomer, type SavedCustomer } from './src/data/customer-api';
import { startWork, pauseWork, resumeWork, completeWork, getElapsedMinutes, completionRecord, type WorkSession } from './src/domain/work-session';
import {saveVisitCompletion} from './src/data/visit-completion';
import {saveVisitSkip} from './src/data/visit-skip';
import {billableCompletedServices,invoiceFromCompletedService,unbillableCompletedServiceCount} from './src/domain/completed-invoice';
import {invoiceTotals,type InvoiceDraft} from './src/domain/invoice';
import {loadWorkSession,saveWorkSession} from './src/data/local-work-session';
import {listServiceLocations,createServiceLocation,type SavedServiceLocation} from './src/data/service-location-api';
import {listServiceAgreements,createServiceAgreement,type SavedServiceAgreement} from './src/data/service-agreement-api';
import {dollarsToCents,localCalendarDate} from './src/domain/service-agreement';
import {generateDueVisits,type Frequency} from './src/domain/recurrence';
import {assessProximity,createLocationConfirmation,type ProximityAssessment,type LocationConfirmation} from './src/domain/location-assist';
import {loadLocationConfirmations,saveLocationConfirmation,markLocationConfirmationSynced,pendingLocationConfirmations,type StoredLocationConfirmation} from './src/data/local-location-confirmations';
import {listLocationConfirmations,syncLocationConfirmation,type ServerLocationConfirmation} from './src/data/location-confirmation-api';
import {filterLocationConfirmations,type LocationConfirmationKindFilter,type LocationConfirmationSourceFilter} from './src/domain/location-confirmation-filter';
import {
  SafeAreaView, ScrollView, View, Text, TextInput, AppState,
  Pressable, StyleSheet, StatusBar, Alert
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
  const [locationCustomerId,setLocationCustomerId]=useState('');
  const [locations,setLocations]=useState<SavedServiceLocation[]>([]);
  const [locationAddress,setLocationAddress]=useState('');
  const [locationPreferences,setLocationPreferences]=useState('');
  const [locationLat,setLocationLat]=useState('');
  const [locationLon,setLocationLon]=useState('');
  const [locationError,setLocationError]=useState('');
  const [locationLoading,setLocationLoading]=useState(false);
  const [locationsHaveMore,setLocationsHaveMore]=useState(false);
  const locationRequest=useRef(0);
  const locationSaving=useRef(false);
  const locationSyncing=useRef(false);
  const [serviceAgreements,setServiceAgreements]=useState<SavedServiceAgreement[]>([]);
  const [agreementsHaveMore,setAgreementsHaveMore]=useState(false);
  const [agreementLocationId,setAgreementLocationId]=useState('');
  const [agreementName,setAgreementName]=useState('');
  const [agreementPrice,setAgreementPrice]=useState('');
  const [agreementMinutes,setAgreementMinutes]=useState('60');
  const [agreementStart,setAgreementStart]=useState(()=>localCalendarDate());
  const [agreementEnd,setAgreementEnd]=useState('');
  const [agreementFrequency,setAgreementFrequency]=useState<Frequency>('weekly');
  const [agreementInterval,setAgreementInterval]=useState('7');
  const [agreementError,setAgreementError]=useState('');
  const [agreementNotice,setAgreementNotice]=useState('');
  const [agreementLoading,setAgreementLoading]=useState(false);
  const agreementSaving=useRef(false);
  function scheduledServicePreview():string{
    try{
      const due=generateDueVisits(serviceAgreements.map(a=>({
        id:a.id,customerId:a.customer_id,locationId:a.location_id,serviceName:a.service_name,
        rateCents:a.rate_cents,estimatedMinutes:a.estimated_minutes,startsOn:a.starts_on,
        endsOn:a.ends_on??undefined,frequency:a.frequency as Frequency,intervalDays:a.interval_days??undefined,
        daysOfWeek:a.days_of_week?JSON.parse(a.days_of_week):undefined,active:a.active===1
      })),agreementStart,agreementStart);
      return due.length+' recurring services scheduled for '+agreementStart+'. Completion status is shown on Today.';
    }catch{return 'Enter a valid start date to preview scheduled services.';}
  }
  async function saveAgreement(){
    const api=process.env.EXPO_PUBLIC_GREENCOLLAR_API_URL;
    if(!api||!connectedBusiness||!locationCustomerId){setAgreementError('Select a saved customer first');return;}
    if(agreementSaving.current)return;
    agreementSaving.current=true;setAgreementLoading(true);setAgreementError('');setAgreementNotice('');
    const sequence=locationRequest.current;
    try{
      if(!/^\d{1,4}$/.test(agreementMinutes.trim()))throw new Error('Enter estimated duration in whole minutes');
      const token=await getToken({template:'greencollar-api'});if(!token)throw new Error('Sign in first');
      const saved=await createServiceAgreement(api,connectedBusiness.id,locationCustomerId,token,{
        locationId:agreementLocationId,serviceName:agreementName,rateCents:dollarsToCents(agreementPrice),
        estimatedMinutes:Number(agreementMinutes),startsOn:agreementStart,endsOn:agreementEnd||undefined,
        frequency:agreementFrequency,...(agreementFrequency==='custom'?{intervalDays:Number(agreementInterval)}:{})
      });
      if(sequence!==locationRequest.current)return;
      setServiceAgreements(previous=>[...previous,saved]);setAgreementName('');setAgreementPrice('');
      setAgreementNotice('Recurring service saved.');
      // A failed follow-up read must not turn a successful write into a retryable save error.
      try{
        const day=await fetchDayData(api,connectedBusiness.id,savedDay?.date??localCalendarDate(),token);
        if(sequence===locationRequest.current)setSavedDay(day);
      }catch{if(sequence===locationRequest.current)setAgreementNotice('Recurring service saved. Load the saved workday on Today to refresh the queue.');}
    }catch(e){if(sequence===locationRequest.current)setAgreementError(e instanceof Error?e.message:'Could not save recurring service');}
    finally{agreementSaving.current=false;if(sequence===locationRequest.current)setAgreementLoading(false);}
  }
  async function selectLocationCustomer(customerId:string){
    const sequence=++locationRequest.current;
    setLocationCustomerId(customerId);setLocations([]);setLocationsHaveMore(false);
    setLocationAddress('');setLocationPreferences('');setLocationLat('');setLocationLon('');setLocationError('');
    setServiceAgreements([]);setAgreementsHaveMore(false);setAgreementLocationId('');
    setAgreementName('');setAgreementPrice('');setAgreementError('');setAgreementNotice('');
    const api=process.env.EXPO_PUBLIC_GREENCOLLAR_API_URL;
    if(!api||!connectedBusiness){setLocationError('Load your business first');return;}
    setLocationLoading(true);
    try{
      const token=await getToken({template:'greencollar-api'});
      if(!token)throw new Error('Sign in first');
      const [result,services]=await Promise.all([
        listServiceLocations(api,connectedBusiness.id,customerId,token),
        listServiceAgreements(api,connectedBusiness.id,customerId,token)
      ]);
      if(sequence===locationRequest.current){
        setLocations(result.locations);setLocationsHaveMore(result.hasMore);
        setServiceAgreements(services.agreements);setAgreementsHaveMore(services.hasMore);
      }
    }catch(e){if(sequence===locationRequest.current)setLocationError(e instanceof Error?e.message:'Could not load addresses');}
    finally{if(sequence===locationRequest.current)setLocationLoading(false);}
  }
  async function saveLocation(){
    const api=process.env.EXPO_PUBLIC_GREENCOLLAR_API_URL;
    if(!api||!connectedBusiness||!locationCustomerId){setLocationError('Select a saved customer first');return;}
    if(locationSaving.current)return;
    locationSaving.current=true;setLocationLoading(true);setLocationError('');
    const sequence=locationRequest.current;
    try{
      const token=await getToken({template:'greencollar-api'});
      if(!token)throw new Error('Sign in first');
      const lat=locationLat.trim()===''?undefined:Number(locationLat.trim());
      const lon=locationLon.trim()===''?undefined:Number(locationLon.trim());
      const saved=await createServiceLocation(api,connectedBusiness.id,locationCustomerId,token,{address:locationAddress,preferences:locationPreferences,lat,lon});
      if(sequence===locationRequest.current){
        setLocations(previous=>[...previous,saved]);setLocationAddress('');setLocationPreferences('');setLocationLat('');setLocationLon('');
      }
    }catch(e){if(sequence===locationRequest.current)setLocationError(e instanceof Error?e.message:'Could not save address');}
    finally{locationSaving.current=false;if(sequence===locationRequest.current)setLocationLoading(false);}
  }
  async function captureServiceCoordinates(){
    setLocationError('');setLocationLoading(true);
    try{
      const permission=await Location.requestForegroundPermissionsAsync();
      if(permission.status!=='granted')throw new Error('Location permission is off. You can enter coordinates manually or keep this address without them.');
      const fix=await Location.getCurrentPositionAsync({accuracy:Location.Accuracy.High});
      if(fix.coords.accuracy===null||!Number.isFinite(fix.coords.accuracy)||fix.coords.accuracy>50)
        throw new Error('Location accuracy is too low. Move outdoors, retry, or enter the pin coordinates manually.');
      setLocationLat(fix.coords.latitude.toFixed(6));setLocationLon(fix.coords.longitude.toFixed(6));
    }catch(e){setLocationError(e instanceof Error?e.message:'Could not read current location');}
    finally{setLocationLoading(false);}
  }
  const [savedDayError,setSavedDayError] = useState('');
  const [loadingSaved,setLoadingSaved] = useState(false);
  const [businessName,setBusinessName] = useState('');
  const [connectedBusiness,setConnectedBusiness] = useState<{id:string;name:string}|null>(null);
  async function saveCompletedService() {
    if(!connectedBusiness||!savedDay||!workSession||workSession.status!=='completed'||workSession.jobId==='demo-job')
      return;
    const api=process.env.EXPO_PUBLIC_GREENCOLLAR_API_URL;
    if(!api){setTimerError('API URL not configured');return;}
    if(submitting.current||timerSaved)return;
    submitting.current=true;setLoadingSaved(true);setTimerError('');
    try {
      const token=await getToken({template:'greencollar-api'});
      if(!token)throw new Error('Sign in first');
      const prefix=workSession.jobId;
      const agreementId=prefix.slice(0,-(savedDay.date.length+1));
      if(!agreementId||!prefix.endsWith(':'+savedDay.date))throw new Error('Invalid scheduled visit');
      await saveVisitCompletion(api,token,{businessId:connectedBusiness.id,agreementId,date:savedDay.date,actualMinutes:completionRecord(workSession).actualMinutes});
      setTimerSaved(true);
      setSavedDay(await fetchDayData(api,connectedBusiness.id,savedDay.date,token));
    } catch(e) {setTimerError(e instanceof Error?e.message:'Unable to save completed service');}
    finally {submitting.current=false;setLoadingSaved(false);}
  }
  async function skipSavedVisit(agreementId:string,date:string){
    if(!connectedBusiness||!savedDay||savedDay.date!==date){setVisitSkipError('Load the matching saved workday first.');return;}
    const api=process.env.EXPO_PUBLIC_GREENCOLLAR_API_URL;
    if(!api){setVisitSkipError('API URL not configured');return;}
    if(visitSkipBusy)return;
    setVisitSkipBusy(agreementId);setVisitSkipError('');setVisitSkipNotice('');
    try{
      const token=await getToken({template:'greencollar-api'});
      if(!token)throw new Error('Sign in first');
      await saveVisitSkip(api,token,{businessId:connectedBusiness.id,agreementId,date});
      setVisitSkipNotice('Visit marked skipped.');
      try{setSavedDay(await fetchDayData(api,connectedBusiness.id,date,token));}
      catch{setVisitSkipNotice('Visit marked skipped. Reload the saved workday to refresh the queue.');}
    }catch(e){setVisitSkipError(e instanceof Error?e.message:'Unable to mark visit skipped');}
    finally{setVisitSkipBusy('');}
  }
  function confirmSkipSavedVisit(agreementId:string,date:string){
    Alert.alert('Skip this scheduled service?','This records the visit as skipped for '+date+'. You can’t skip a completed or active visit.',[
      {text:'Cancel',style:'cancel'},
      {text:'Mark skipped',style:'destructive',onPress:()=>void skipSavedVisit(agreementId,date)}
    ]);
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
      const date=localCalendarDate();
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
  const [timerSaved,setTimerSaved]=useState(false);
  const [visitSkipBusy,setVisitSkipBusy]=useState('');
  const [visitSkipError,setVisitSkipError]=useState('');
  const [visitSkipNotice,setVisitSkipNotice]=useState('');
  const [locationAssessment,setLocationAssessment]=useState<ProximityAssessment|null>(null);
  const [locationAssessmentJob,setLocationAssessmentJob]=useState('');
  const [locationCheckError,setLocationCheckError]=useState('');
  const [locationCheckBusy,setLocationCheckBusy]=useState(false);
  const [locationManualReason,setLocationManualReason]=useState('');
  const [locationConfirmations,setLocationConfirmations]=useState<StoredLocationConfirmation[]>([]);
  const [serverLocationConfirmations,setServerLocationConfirmations]=useState<ServerLocationConfirmation[]>([]);
  const [serverLocationConfirmationsBusy,setServerLocationConfirmationsBusy]=useState(false);
  const [serverLocationConfirmationsError,setServerLocationConfirmationsError]=useState('');
  const [serverLocationConfirmationsHasMore,setServerLocationConfirmationsHasMore]=useState(false);
  const [serverLocationConfirmationsCursor,setServerLocationConfirmationsCursor]=useState<string|null>(null);
  const [serverAuditKindFilter,setServerAuditKindFilter]=useState<LocationConfirmationKindFilter>('all');
  const [serverAuditSourceFilter,setServerAuditSourceFilter]=useState<LocationConfirmationSourceFilter>('all');
  const serverAuditRequest=useRef(0);
  const [locationConfirmError,setLocationConfirmError]=useState('');
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
    let active=true;
    setLocationConfirmations([]);
    if(!userId)return ()=>{active=false;};
    void loadLocationConfirmations(userId).then(events=>{if(active)setLocationConfirmations(events);}).catch(()=>{if(active)setLocationConfirmError('Could not load this device’s confirmation history');});
    return ()=>{active=false;};
  },[userId]);
  useEffect(()=>{
    serverAuditRequest.current++;
    setServerLocationConfirmations([]);
    setServerLocationConfirmationsHasMore(false);
    setServerLocationConfirmationsCursor(null);
    setServerAuditKindFilter('all');setServerAuditSourceFilter('all');
    setServerLocationConfirmationsError('');
    setServerLocationConfirmationsBusy(false);
    if(userId&&connectedBusiness?.id&&savedDay?.date&&process.env.EXPO_PUBLIC_GREENCOLLAR_API_URL)
      void loadServerLocationConfirmations();
  },[userId,connectedBusiness?.id,savedDay?.date]);
  useEffect(()=>{
    if(!userId||!connectedBusiness?.id||!process.env.EXPO_PUBLIC_GREENCOLLAR_API_URL)return;
    let active=true;
    const attemptSync=()=>{if(active)void syncLocationOutbox(connectedBusiness.id);};
    attemptSync();
    const subscription=AppState.addEventListener('change',state=>{if(state==='active')attemptSync();});
    return ()=>{active=false;subscription.remove();};
  },[userId,connectedBusiness?.id]);
  useEffect(()=>{
    if(!userId||!timerRestored)return;
    void saveWorkSession(userId,workSession).catch(()=>setTimerError('Could not preserve job timer'));
  },[userId,timerRestored,workSession]);
  function timerAction(action:'start'|'pause'|'resume'|'complete', jobId='demo-job') {
    try {
      if(!timerRestored)throw new Error('Timer is restoring');
      const now=Date.now();setTimerNow(now);setTimerError('');
      if(action==='start'){setTimerSaved(false);setWorkSession(startWork(jobId,now));return;}
      if(!workSession)throw new Error('Start a job first');
      const next=action==='pause'?pauseWork(workSession,now):action==='resume'?resumeWork(workSession,now):completeWork(workSession,now);
      setWorkSession(next);
    }catch(e){setTimerError(e instanceof Error?e.message:'Timer error');}
  }

  function activeSavedJob(){
    if(!savedDay||!workSession||workSession.jobId==='demo-job')return null;
    return summarizeSavedDay(savedDay).due.find(job=>job.id===workSession.jobId)??null;
  }
  async function checkActiveJobLocation(){
    const job=activeSavedJob();
    setLocationAssessment(null);setLocationAssessmentJob('');setLocationCheckError('');setLocationConfirmError('');
    if(!workSession||workSession.status==='completed'){setLocationCheckError('Start a saved scheduled service before checking the site.');return;}
    if(!job){setLocationCheckError('This active job has no matching saved site in today’s workday. Use manual confirmation if appropriate.');return;}
    if(job.lat===null||job.lon===null){setLocationCheckError('This service address has no saved site pin. Add coordinates under Customers, or use manual confirmation.');return;}
    setLocationCheckBusy(true);
    try{
      const permission=await Location.requestForegroundPermissionsAsync();
      if(permission.status!=='granted')throw new Error('Location permission is off. You can continue with a manual confirmation.');
      const fix=await Location.getCurrentPositionAsync({accuracy:Location.Accuracy.High});
      const fixAge=Date.now()-fix.timestamp;
      if(!Number.isFinite(fixAge)||fixAge<0||fixAge>120000)throw new Error('The location fix is stale. Retry for a fresh reading or confirm manually.');
      const accuracy=fix.coords.accuracy;
      if(accuracy===null||!Number.isFinite(accuracy)||accuracy<0)throw new Error('The device did not return a usable accuracy estimate. Confirm manually or retry.');
      const result=assessProximity({latitude:job.lat,longitude:job.lon},{latitude:fix.coords.latitude,longitude:fix.coords.longitude,accuracyMeters:accuracy},{radiusMeters:100,maxAccuracyMeters:50});
      setLocationAssessment(result);setLocationAssessmentJob(job.id);
      if(result.status==='unavailable')setLocationCheckError('GPS accuracy is too low for a suggestion. Confirm manually or retry outdoors.');
    }catch(e){setLocationCheckError(e instanceof Error?e.message:'Could not check current location');}
    finally{setLocationCheckBusy(false);}
  }
  async function loadServerLocationConfirmations(cursor?:string) {
    const api=process.env.EXPO_PUBLIC_GREENCOLLAR_API_URL;
    if(!api){setServerLocationConfirmationsError('API URL not configured.');return;}
    if(!connectedBusiness||!savedDay){setServerLocationConfirmationsError('Load a saved business workday first.');return;}
    const requestId=++serverAuditRequest.current;
    setServerLocationConfirmationsBusy(true);setServerLocationConfirmationsError('');
    try{
      const token=await getToken({template:'greencollar-api'});
      if(!token)throw new Error('Sign in first');
      const result=await listLocationConfirmations(api,token,connectedBusiness.id,savedDay.date,cursor);
      if(requestId===serverAuditRequest.current){
        setServerLocationConfirmations(previous=>{
          if(!cursor)return result.events;
          const existing=new Set(previous.map(event=>event.id));
          return [...previous,...result.events.filter(event=>!existing.has(event.id))];
        });
        setServerLocationConfirmationsHasMore(result.hasMore);
        setServerLocationConfirmationsCursor(result.nextCursor);
      }
    }catch(e){if(requestId===serverAuditRequest.current)setServerLocationConfirmationsError(e instanceof Error?e.message:'Could not load server audit history');}
    finally{if(requestId===serverAuditRequest.current)setServerLocationConfirmationsBusy(false);}
  }

  async function syncLocationOutbox(businessId:string,eventId?:string) {
    const api=process.env.EXPO_PUBLIC_GREENCOLLAR_API_URL;
    if(!api||!userId){setLocationConfirmError('Saved on this device; sync pending until API configuration and sign-in are available.');return;}
    if(locationSyncing.current)return;
    locationSyncing.current=true;
    setLocationCheckBusy(true);
    let synced=0,firstError='';
    try{
      const token=await getToken({template:'greencollar-api'});
      if(!token)throw new Error('Sign in first');
      const queued=await pendingLocationConfirmations(userId,businessId);
      const selected=eventId?queued.filter(event=>event.eventId===eventId):queued;
      if(!selected.length)return;
      for(const event of selected){
        try{
          if(!event.agreementId||!event.date||!event.businessId)throw new Error('Confirmation is missing its saved service scope');
          await syncLocationConfirmation(api,token,{
            eventId:event.eventId,businessId:event.businessId,agreementId:event.agreementId,date:event.date,
            kind:event.kind,source:event.source,proximity:event.proximity,manualReason:event.manualReason,confirmedAt:event.confirmedAt
          });
          await markLocationConfirmationSynced(userId,event.eventId);
          synced++;
        }catch(e){if(!firstError)firstError=e instanceof Error?e.message:'Sync failed';}
      }
      setLocationConfirmations(await loadLocationConfirmations(userId));
      const remaining=(await pendingLocationConfirmations(userId,businessId)).length;
      if(synced>0&&connectedBusiness?.id===businessId&&savedDay?.date&&selected.some(event=>event.date===savedDay.date))
        await loadServerLocationConfirmations();
      setLocationConfirmError(firstError
        ? 'Saved on this device; '+synced+' synced, '+remaining+' still pending. '+firstError
        : 'Synced '+synced+' location confirmation'+(synced===1?'':'s')+'.');
    }catch(e){
      setLocationConfirmError('Saved on this device; sync pending. '+(e instanceof Error?e.message:'Could not sync confirmations'));
    }finally{locationSyncing.current=false;setLocationCheckBusy(false);}
  }

  async function confirmActiveJobLocation(kind:'arrival'|'departure',source:'gps_suggestion'|'manual') {
    const job=activeSavedJob();
    if(!job||!workSession||workSession.status==='completed'||!userId||!connectedBusiness||!savedDay){setLocationConfirmError('Load a saved business workday and start a scheduled service first.');return;}
    if(source==='gps_suggestion'&&(locationAssessmentJob!==job.id||!locationAssessment)){setLocationConfirmError('Check the current site location before confirming a GPS suggestion.');return;}
    setLocationConfirmError('');
    try{
      const event=createLocationConfirmation({jobId:job.id,operatorId:userId,kind,confirmedAt:Date.now(),source,assessment:source==='gps_suggestion'?locationAssessment??undefined:undefined,manualReason:source==='manual'?locationManualReason:undefined});
      const date=savedDay.date;
      const suffix=':'+date;
      if(!job.id.endsWith(suffix))throw new Error('Invalid scheduled visit');
      const agreementId=job.id.slice(0,-suffix.length);
      if(!agreementId)throw new Error('Invalid service agreement');
      const updated=await saveLocationConfirmation(userId,{businessId:connectedBusiness.id,agreementId,date},event);
      setLocationConfirmations(updated);setLocationManualReason('');
      const stored=updated[updated.length-1];
      await syncLocationOutbox(connectedBusiness.id,stored?.eventId);
    }catch(e){setLocationConfirmError(e instanceof Error?e.message:'Could not save confirmation on this device');}
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
    setLoadingSaved(true);setSavedDayError('');
    try {
      const token=await getToken({template:'greencollar-api'});
      if(!token)throw new Error('Sign in first');
      await createSavedCustomer(api,connectedBusiness.id,token,{name:savedCustomerName,phone:savedCustomerPhone,email:savedCustomerEmail,notes:savedCustomerNotes});
      setSavedCustomers(await listSavedCustomers(api,connectedBusiness.id,token));
      setSavedCustomerName('');setSavedCustomerPhone('');setSavedCustomerEmail('');setSavedCustomerNotes('');
    }catch(e){setSavedDayError(e instanceof Error?e.message:'Could not save customer');}
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
  const visibleServerLocationConfirmations=filterLocationConfirmations(serverLocationConfirmations,serverAuditKindFilter,serverAuditSourceFilter);

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
            {workSession?.status==='completed' && workSession.jobId!=='demo-job' && !timerSaved && <Pressable style={styles.primary} disabled={loadingSaved} onPress={()=>void saveCompletedService()}><Text style={styles.primaryText}>Save completed visit</Text></Pressable>}
            {timerSaved && <Text style={styles.body}>Visit completion saved to Cloudflare.</Text>}
            {workSession?.status==='completed' && <Pressable style={styles.primary} onPress={()=>timerAction('start')}><Text style={styles.primaryText}>Start another demo</Text></Pressable>}
            {workSession&&workSession.status!=='completed'&&workSession.jobId!=='demo-job'&&<View style={styles.card}>
              <Text style={styles.cardHeading}>Service-site check</Text>
              <Text style={styles.muted}>One foreground location check can suggest arrival or departure. It never changes the job timer, completion, or billing. Confirmations save on this device first; pending events retry with the same ID.</Text>
              <Pressable accessibilityRole="button" style={[styles.primary,{backgroundColor:'#f0f5ef'}]} disabled={locationCheckBusy} onPress={()=>void checkActiveJobLocation()}><Text style={styles.primaryText}>{locationCheckBusy?'Checking site…':'Check current site location once'}</Text></Pressable>
              {!!locationCheckError&&<Text accessibilityLiveRegion="polite" style={styles.muted}>{locationCheckError}</Text>}
              {!!locationAssessment&&locationAssessmentJob===workSession.jobId&&<>
                <Text accessibilityLiveRegion="polite" style={styles.body}>{locationAssessment.status==='within_radius'?'GPS suggests arrival.':locationAssessment.status==='outside_radius'?'GPS suggests departure.':locationAssessment.status==='uncertain'?'Location is near the boundary; confirm manually.':'GPS is unavailable; confirm manually.'}{locationAssessment.distanceMeters!==undefined?' Approx. '+Math.round(locationAssessment.distanceMeters)+' m from the saved pin.':''}</Text>
                {locationAssessment.status==='within_radius'&&<Pressable accessibilityRole="button" style={styles.primary} onPress={()=>void confirmActiveJobLocation('arrival','gps_suggestion')}><Text style={styles.primaryText}>Confirm arrival</Text></Pressable>}
                {locationAssessment.status==='outside_radius'&&<Pressable accessibilityRole="button" style={styles.primary} onPress={()=>void confirmActiveJobLocation('departure','gps_suggestion')}><Text style={styles.primaryText}>Confirm departure</Text></Pressable>}
                <Pressable accessibilityRole="button" style={[styles.primary,{backgroundColor:'#f0f5ef'}]} onPress={()=>{setLocationAssessment(null);setLocationAssessmentJob('');}}><Text style={styles.primaryText}>Dismiss suggestion</Text></Pressable>
              </>}
              <Text style={styles.label}>Manual confirmation reason</Text>
              <TextInput accessibilityLabel="Manual location confirmation reason" style={styles.input} placeholder="For example: GPS unavailable, customer confirmed" placeholderTextColor="#819b8b" value={locationManualReason} onChangeText={setLocationManualReason} maxLength={280}/>
              <View style={{flexDirection:'row',gap:8}}><Pressable accessibilityRole="button" style={[styles.primary,{flex:1}]} disabled={!locationManualReason.trim()} onPress={()=>void confirmActiveJobLocation('arrival','manual')}><Text style={styles.primaryText}>Manually confirm arrival</Text></Pressable><Pressable accessibilityRole="button" style={[styles.primary,{flex:1}]} disabled={!locationManualReason.trim()} onPress={()=>void confirmActiveJobLocation('departure','manual')}><Text style={styles.primaryText}>Manually confirm departure</Text></Pressable></View>

            </View>}
            {(locationConfirmations.some(event=>event.businessId===connectedBusiness?.id||event.jobId===workSession?.jobId))&&<View style={styles.card}>
              <Text style={styles.cardHeading}>Location confirmations</Text>
              {locationConfirmations.some(event=>event.businessId===connectedBusiness?.id&&event.syncStatus==='pending')&&<Pressable accessibilityRole="button" style={[styles.primary,{backgroundColor:'#f0f5ef'}]} disabled={locationCheckBusy||!connectedBusiness} onPress={()=>connectedBusiness&&void syncLocationOutbox(connectedBusiness.id)}><Text style={styles.primaryText}>{locationCheckBusy?'Syncing confirmations…':'Retry pending sync'}</Text></Pressable>}
              {!!locationConfirmError&&<Text accessibilityLiveRegion="polite" style={styles.muted}>{locationConfirmError}</Text>}
              {locationConfirmations.filter(event=>event.businessId===connectedBusiness?.id||event.jobId===workSession?.jobId).slice(-5).map((event,i)=><Text key={event.eventId||event.confirmedAt+'-'+i} style={styles.muted}>{event.kind==='arrival'?'Arrival':'Departure'} · {new Date(event.confirmedAt).toLocaleString()} · {event.source==='manual'?'manual: '+(event.manualReason??'reason not recorded'):'GPS suggestion'} · {event.syncStatus==='synced'?'synced':event.syncStatus==='pending'?'sync pending':'device only'}</Text>)}
            </View>}
            {!!timerError && <Text style={styles.muted}>{timerError}</Text>}
          </View>
          <Text style={styles.muted}>Prototype customer cards below use synthetic data. Saved Cloudflare records load separately.</Text>
          {!connectedBusiness && <View style={styles.card}><Text style={styles.cardHeading}>Create or find your business</Text><Pressable style={styles.primary} disabled={loadingSaved} onPress={()=>void findMyBusiness()}><Text style={styles.primaryText}>Find my saved business</Text></Pressable><TextInput style={styles.input} placeholder="Business name" placeholderTextColor="#819b8b" value={businessName} onChangeText={setBusinessName}/><Pressable style={styles.primary} disabled={loadingSaved} onPress={()=>void registerBusiness()}><Text style={styles.primaryText}>Create business</Text></Pressable><Text style={styles.muted}>Already registered? Find your saved business above. Otherwise create a new one.</Text></View>}
          {connectedBusiness && <Text style={styles.muted}>Business: {connectedBusiness.name}</Text>}
          <Pressable style={styles.primary} disabled={loadingSaved} onPress={()=>void loadSavedDay()}><Text style={styles.primaryText}>{loadingSaved?'Loading...':'Load saved workday'}</Text></Pressable>
          {!!savedDayError && <Text style={styles.muted}>{savedDayError}</Text>}
          {connectedBusiness&&savedDay&&<View style={styles.card}>
            <Text style={styles.cardHeading}>Synced location audit · {savedDay.date}</Text>
            <Text style={styles.muted}>Read-only server history for this business and work date. Latest confirmations appear first.</Text>
            <Pressable accessibilityRole="button" style={[styles.primary,{backgroundColor:'#f0f5ef'}]} disabled={serverLocationConfirmationsBusy} onPress={()=>void loadServerLocationConfirmations()}><Text style={styles.primaryText}>{serverLocationConfirmationsBusy?'Loading audit…':'Load synced audit history'}</Text></Pressable>
            {!!serverLocationConfirmationsError&&<Text accessibilityLiveRegion="polite" style={styles.muted}>{serverLocationConfirmationsError}</Text>}
            {visibleServerLocationConfirmations.map(event=><Text key={event.id} style={styles.muted}>{event.kind==='arrival'?'Arrival':'Departure'} · {new Date(event.confirmed_at).toLocaleString()} · {event.source==='manual'?'manual: '+(event.manual_reason??'reason not recorded'):'GPS suggestion'} · {event.proximity}</Text>)}
            {serverLocationConfirmations.length>0&&<>
              <Text style={styles.muted}>Showing {visibleServerLocationConfirmations.length} of {serverLocationConfirmations.length} loaded confirmations. Filters apply only to loaded entries.</Text>
              <Text style={styles.label}>Event type</Text>
              <View style={{flexDirection:'row',gap:6,flexWrap:'wrap'}}>{([['all','All'],['arrival','Arrival'],['departure','Departure']] as const).map(([value,label])=><Pressable key={value} accessibilityRole="button" accessibilityState={{selected:serverAuditKindFilter===value}} style={[styles.primary,{paddingVertical:10,backgroundColor:serverAuditKindFilter===value?pale:'#f0f5ef'}]} onPress={()=>setServerAuditKindFilter(value)}><Text style={styles.primaryText}>{label}</Text></Pressable>)}</View>
              <Text style={styles.label}>Confirmation method</Text>
              <View style={{flexDirection:'row',gap:6,flexWrap:'wrap'}}>{([['all','All'],['gps_suggestion','GPS'],['manual','Manual']] as const).map(([value,label])=><Pressable key={value} accessibilityRole="button" accessibilityState={{selected:serverAuditSourceFilter===value}} style={[styles.primary,{paddingVertical:10,backgroundColor:serverAuditSourceFilter===value?pale:'#f0f5ef'}]} onPress={()=>setServerAuditSourceFilter(value)}><Text style={styles.primaryText}>{label}</Text></Pressable>)}</View>
            </>}{serverLocationConfirmationsHasMore&&serverLocationConfirmationsCursor&&<Pressable accessibilityRole="button" style={styles.primary} disabled={serverLocationConfirmationsBusy} onPress={()=>void loadServerLocationConfirmations(serverLocationConfirmationsCursor)}><Text style={styles.primaryText}>{serverLocationConfirmationsBusy?'Loading older history…':'Load older audit history'}</Text></Pressable>}
            {!serverLocationConfirmationsBusy&&!serverLocationConfirmationsError&&serverLocationConfirmations.length===0&&<Text style={styles.muted}>No confirmations recorded on the server for this date.</Text>}
          </View>}
          {savedDay && <View style={styles.card}><Text style={styles.cardHeading}>Due today · Saved records</Text><Text style={styles.body}>{summarizeSavedDay(savedDay).pendingCount} jobs due · ${(summarizeSavedDay(savedDay).estimatedRevenueCents / 100).toFixed(2)} expected revenue · {summarizeSavedDay(savedDay).estimatedServiceMinutes} service minutes</Text><Text style={styles.muted}>{summarizeSavedDay(savedDay).completedCount} completed · {summarizeSavedDay(savedDay).skippedCount} skipped. Due-work preview only; no road routing or fuel estimate yet.</Text>{!!visitSkipNotice&&<Text accessibilityLiveRegion="polite" style={styles.body}>{visitSkipNotice}</Text>}{!!visitSkipError&&<Text accessibilityLiveRegion="polite" style={styles.muted}>{visitSkipError}</Text>}{summarizeSavedDay(savedDay).due.slice(0,12).map(j=><View key={j.id}><Text style={styles.body}>{j.customer} · {j.service} · {j.address}</Text><Pressable style={styles.primary} disabled={!!workSession&&workSession.status!=='completed'} onPress={()=>timerAction('start',j.id)}><Text style={styles.primaryText}>Start this service</Text></Pressable><Pressable accessibilityRole="button" style={[styles.primary,{backgroundColor:'#f0f5ef'}]} disabled={!!visitSkipBusy||!!workSession&&workSession.status!=='completed'} onPress={()=>confirmSkipSavedVisit(j.id.slice(0,-(savedDay.date.length+1)),savedDay.date)}><Text style={styles.primaryText}>{visitSkipBusy===j.id?'Saving skip…':'Skip this visit'}</Text></Pressable></View>)}</View>}
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
              {savedCustomers.map(c=><View key={c.id} style={{paddingVertical:8,borderBottomWidth:1,borderBottomColor:'#31533f'}}><Text style={styles.body}>{c.name}</Text>{!!c.phone&&<Text style={styles.muted}>Phone: {c.phone}</Text>}{!!c.email&&<Text style={styles.muted}>Email: {c.email}</Text>}{!!c.notes&&<Text style={styles.muted}>Notes: {c.notes}</Text>}</View>)}
              <TextInput style={styles.input} placeholder="Customer name" placeholderTextColor="#819b8b" value={savedCustomerName} onChangeText={setSavedCustomerName}/>
              <TextInput style={styles.input} placeholder="Phone (optional)" placeholderTextColor="#819b8b" keyboardType="phone-pad" value={savedCustomerPhone} onChangeText={setSavedCustomerPhone}/>
              <TextInput style={styles.input} placeholder="Email (optional)" placeholderTextColor="#819b8b" keyboardType="email-address" autoCapitalize="none" value={savedCustomerEmail} onChangeText={setSavedCustomerEmail}/>
              <TextInput style={styles.input} placeholder="Access notes or preferences (optional)" placeholderTextColor="#819b8b" value={savedCustomerNotes} onChangeText={setSavedCustomerNotes} multiline maxLength={2000}/>
              <Pressable style={styles.primary} disabled={loadingSaved||!savedCustomerName.trim()} onPress={()=>void saveCustomer()}><Text style={styles.primaryText}>Save customer securely</Text></Pressable>
            </> : <Text style={styles.muted}>Create or load your business on Today before saving real customers.</Text>}
            {!!savedDayError && <Text style={styles.muted}>{savedDayError}</Text>}
          </View>
          {connectedBusiness&&<View style={styles.card}>
            <Text style={styles.cardHeading}>Service addresses</Text>
            <Text style={styles.muted}>Choose a saved customer, then add where the work happens.</Text>
            {!savedCustomers.length&&<Text style={styles.muted}>Load or save a customer above to begin.</Text>}
            {savedCustomers.map(c=><Pressable key={c.id} accessibilityRole="button" accessibilityState={{selected:c.id===locationCustomerId,disabled:locationLoading||agreementLoading}} style={styles.primary} disabled={locationLoading||agreementLoading} onPress={()=>void selectLocationCustomer(c.id)}><Text style={styles.primaryText}>{c.id===locationCustomerId?'Selected: ':''}{c.name}</Text></Pressable>)}
            {locationLoading&&<Text style={styles.muted}>Loading service addresses…</Text>}
            {locations.map(l=><View key={l.id}><Text style={styles.body}>{l.address}</Text>{!!l.preferences&&<Text style={styles.muted}>Access preferences: {l.preferences}</Text>}</View>)}
            {locationsHaveMore&&<Text style={styles.muted}>Showing the first 200 saved addresses. Additional addresses exist.</Text>}
            {!!locationCustomerId&&<>
              <TextInput accessibilityLabel="Service address" style={styles.input} placeholder="Service address" placeholderTextColor="#819b8b" value={locationAddress} onChangeText={setLocationAddress} editable={!locationLoading} maxLength={500}/>
              <TextInput accessibilityLabel="Service address access preferences" style={styles.input} placeholder="Gate, parking, or access preferences (optional)" placeholderTextColor="#819b8b" value={locationPreferences} onChangeText={setLocationPreferences} editable={!locationLoading} multiline maxLength={2000}/>
              <Text style={styles.muted}>Optional site pin coordinates. GreenCollar uses them for location assistance only after you save them.</Text>
              <View style={{flexDirection:'row',gap:8}}><TextInput accessibilityLabel="Latitude" keyboardType="decimal-pad" style={[styles.input,{flex:1}]} placeholder="Latitude" placeholderTextColor="#819b8b" value={locationLat} onChangeText={setLocationLat} editable={!locationLoading}/><TextInput accessibilityLabel="Longitude" keyboardType="decimal-pad" style={[styles.input,{flex:1}]} placeholder="Longitude" placeholderTextColor="#819b8b" value={locationLon} onChangeText={setLocationLon} editable={!locationLoading}/></View>
              <Pressable accessibilityRole="button" style={[styles.primary,{backgroundColor:'#f0f5ef'}]} disabled={locationLoading} onPress={()=>void captureServiceCoordinates()}><Text style={styles.primaryText}>{locationLoading?'Checking...':'Capture this device location once'}</Text></Pressable>
              <Text style={styles.muted}>Location is requested only when you tap Capture. No background tracking. You can also paste coordinates manually.</Text>
              <Pressable accessibilityRole="button" style={styles.primary} disabled={locationLoading||!locationAddress.trim()} onPress={()=>void saveLocation()}><Text style={styles.primaryText}>Save service address</Text></Pressable>
            </>}
            {!!locationError&&<Text style={styles.muted}>{locationError}</Text>}
          </View>}
          {connectedBusiness&&!!locationCustomerId&&<View style={styles.card}>
            <Text style={styles.cardHeading}>Recurring services</Text>
            <Text style={styles.muted}>Choose a saved address and enter the agreed service price and schedule.</Text>
            {!locations.length&&<Text style={styles.muted}>Save a service address above to begin.</Text>}
            {locations.map(l=><Pressable key={l.id} accessibilityRole="button" accessibilityState={{selected:l.id===agreementLocationId}} style={styles.primary} disabled={locationLoading||agreementLoading} onPress={()=>setAgreementLocationId(l.id)}><Text style={styles.primaryText}>{l.id===agreementLocationId?'Selected: ':''}{l.address}</Text></Pressable>)}
            {serviceAgreements.map(a=><View key={a.id}><Text style={styles.body}>{a.service_name} · ${(a.rate_cents/100).toFixed(2)} · {a.estimated_minutes} min</Text><Text style={styles.muted}>{a.address} · {a.frequency}{a.interval_days?' every '+a.interval_days+' days':''} · starts {a.starts_on}{a.ends_on?' · ends '+a.ends_on:''}</Text></View>)}
            {agreementsHaveMore&&<Text style={styles.muted}>Showing the first 200 recurring services. Additional services exist.</Text>}
            {!!serviceAgreements.length&&<Text style={styles.muted}>{scheduledServicePreview()}</Text>}
            {!!agreementLocationId&&<>
              <TextInput accessibilityLabel="Service name" style={styles.input} placeholder="Service name" placeholderTextColor="#819b8b" value={agreementName} onChangeText={setAgreementName} maxLength={160} editable={!agreementLoading}/>
              <TextInput accessibilityLabel="Agreed service price in USD" style={styles.input} placeholder="Price per visit (USD)" placeholderTextColor="#819b8b" keyboardType="decimal-pad" value={agreementPrice} onChangeText={setAgreementPrice} editable={!agreementLoading}/>
              <Text style={styles.label}>Estimated duration in minutes</Text>
              <TextInput accessibilityLabel="Estimated service minutes" style={styles.input} keyboardType="number-pad" value={agreementMinutes} onChangeText={setAgreementMinutes} editable={!agreementLoading}/>
              <Text style={styles.label}>Start date (YYYY-MM-DD)</Text>
              <TextInput accessibilityLabel="Service start date" style={styles.input} value={agreementStart} onChangeText={setAgreementStart} editable={!agreementLoading}/>
              <TextInput accessibilityLabel="Optional service end date" style={styles.input} placeholder="End date YYYY-MM-DD (optional)" placeholderTextColor="#819b8b" value={agreementEnd} onChangeText={setAgreementEnd} editable={!agreementLoading}/>
              {([['daily','Daily'],['weekly','Weekly'],['biweekly','Every 2 weeks'],['monthly','Monthly'],['custom','Custom interval']] as const).map(([value,label])=><Pressable key={value} accessibilityRole="button" accessibilityState={{selected:value===agreementFrequency}} style={styles.primary} disabled={agreementLoading} onPress={()=>setAgreementFrequency(value)}><Text style={styles.primaryText}>{value===agreementFrequency?'Selected: ':''}{label}</Text></Pressable>)}
              {agreementFrequency==='custom'&&<><Text style={styles.label}>Days between visits</Text><TextInput accessibilityLabel="Days between service visits" style={styles.input} keyboardType="number-pad" value={agreementInterval} onChangeText={setAgreementInterval} editable={!agreementLoading}/></>}
              <Text style={styles.muted}>Weekly schedules follow the start date's weekday. Monthly schedules use its calendar day, or the last day of a shorter month.</Text>
              <Pressable accessibilityRole="button" style={styles.primary} disabled={agreementLoading||!agreementName.trim()||!agreementPrice.trim()} onPress={()=>void saveAgreement()}><Text style={styles.primaryText}>{agreementLoading?'Saving recurring service…':'Save recurring service'}</Text></Pressable>
            </>}
            {!!agreementError&&<Text style={styles.muted}>{agreementError}</Text>}
            {!!agreementNotice&&<Text style={styles.body}>{agreementNotice}</Text>}
          </View>}
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
          {!!savedDay && unbillableCompletedServiceCount(savedDay)>0 && <Text style={styles.muted}>{unbillableCompletedServiceCount(savedDay)} older completed visit(s) need manual billing review because no historical price snapshot exists.</Text>}
          {!!invoiceError && <Text style={styles.muted}>{invoiceError}</Text>}
          {invoiceDrafts.map(d=><View key={d.id} style={styles.card}>
            <Text style={styles.cardHeading}>{d.lines[0]?.description||'Invoice'} · {d.status}</Text>
            <Text style={styles.muted}>Customer: {d.customerName??d.customerId}</Text>
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
