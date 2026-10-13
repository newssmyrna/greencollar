import React, { useState, useEffect, useRef } from 'react';
import * as Location from 'expo-location';
import { ClerkProvider, useAuth, useClerk } from '@clerk/expo';
import { useHostedAuth } from '@clerk/expo/hosted-auth';
import { tokenCache } from '@clerk/expo/token-cache';
import { fetchDayData, type DayData } from './src/data/greencollar-api';
import { fetchRoutingSettings, acknowledgeRoutingNotice, setBusinessRoutingEnabled, requestRoutingMatrix, type RoutingSettings } from './src/data/routing-api';
import { reportWeatherInterruption, listWeatherInterruptions, type WeatherInterruption, type WeatherInterruptionReason } from './src/data/weather-interruptions';
import { getWorkdaySchedule, saveWorkdaySchedule, listWorkdayMembers, type WorkdaySchedule, type ScheduledTask, type BusinessMember } from './src/data/workday-schedules';
import { businessRoleCapabilities } from './src/domain/weather-replan';
import { prepareTruckPreview, type PreviewTruck, type TruckPreviewRoute } from './src/domain/truck-preview';
import { summarizeSavedDay } from './src/data/saved-day';
import {createSavedQueueReview,canApproveSavedQueueReview,isSavedQueueApproved,savedQueueApprovalAction} from './src/domain/saved-queue-review';
import {describeSavedQueueAppointments,describeAppointmentCheckAssumptions} from './src/domain/saved-queue-appointments';
import {assessServiceWorkload} from './src/domain/service-workload';
import {describeSavedQueueWorkload,type SavedQueueWorkloadLimits} from './src/domain/saved-queue-workload';
import {orderSavedQueue,moveSavedQueueVisit,type SavedQueueOrder,type SavedQueueTravelEstimate} from './src/domain/saved-queue-order';
import {localSavedQueueOrder} from './src/data/local-saved-queue-order-native';
import {localSavedQueueWorkload} from './src/data/local-saved-queue-workload-native';
import {createSavedQueueWorkloadSettings,workloadSettingsHaveUnsavedChanges,workloadSettingsReadyForApproval} from './src/data/saved-queue-workload-settings';
import {localSavedQueueApproval} from './src/data/local-saved-queue-approval-native';
import { getBusinesses, createBusiness, type OwnedBusiness } from './src/data/business-api';
import { listSavedCustomers, createSavedCustomer, type SavedCustomer } from './src/data/customer-api';
import { pauseWork, resumeWork, completeWork, completionRecord, type WorkSession } from './src/domain/work-session';
import {canStartNextWork,startNextWork,hasSavedWorkCompletion,workSessionDate} from './src/domain/work-handoff';
import {normalizeWorkNote,withWorkNote} from './src/domain/work-note';
import {saveVisitCompletion} from './src/data/visit-completion';
import {saveVisitSkip} from './src/data/visit-skip';
import {billableCompletedServices,unbillableCompletedServiceCount} from './src/domain/completed-invoice';
import {invoiceTotals,setInvoiceDueDays,setInvoiceTaxBasisPoints} from './src/domain/invoice';
import {listInvoiceDrafts,createPersistedInvoiceDraft,savePersistedInvoiceDraft,type PersistedInvoiceDraft} from './src/data/invoice-draft-api';
import {timerDisplay,createForegroundTimerTicker} from './src/domain/timer-display';
import {completionReviewKey,isCompletionReviewConfirmed} from './src/domain/completion-review';
import {createDurableTimerTransition} from './src/domain/durable-timer-transition';
import {loadWorkSession,saveWorkSession} from './src/data/local-work-session';
import {listServiceLocations,createServiceLocation,type SavedServiceLocation} from './src/data/service-location-api';
import {listServiceAgreements,createServiceAgreement,type SavedServiceAgreement} from './src/data/service-agreement-api';
import {dollarsToCents,localCalendarDate} from './src/domain/service-agreement';
import {parseServiceClock,describeServiceTimeConstraints} from './src/domain/service-time';
import {generateDueVisits,type Frequency} from './src/domain/recurrence';
import {assessProximity,createLocationConfirmation,type ProximityAssessment,type LocationConfirmation} from './src/domain/location-assist';
import {loadLocationConfirmations,saveLocationConfirmation,markLocationConfirmationSynced,pendingLocationConfirmations,type StoredLocationConfirmation} from './src/data/local-location-confirmations';
import {listLocationConfirmations,syncLocationConfirmation,type ServerLocationConfirmation} from './src/data/location-confirmation-api';
import {filterLocationConfirmations,type LocationConfirmationKindFilter,type LocationConfirmationSourceFilter} from './src/domain/location-confirmation-filter';
import {
  SafeAreaView, ScrollView, View, Text, TextInput, AppState,
  Pressable, StyleSheet, StatusBar, Alert, Linking
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

function scheduleClockMinute(value:string):number|null{const m=/^(\d{1,2}):(\d{2})$/.exec(value.trim());if(!m)return null;const h=Number(m[1]),minute=Number(m[2]);return h<=23&&minute<=59?h*60+minute:null;}
function savedQueueTravelKey(fromVisitId:string|null,toVisitId:string):string{
  return JSON.stringify([fromVisitId,toVisitId]);
}
function parseTravelMinutesDraft(value:string):number|undefined{
  const normalized=value.trim();
  if(!normalized)return undefined;
  if(!/^\d{1,4}$/.test(normalized))return NaN;
  const minutes=Number(normalized);
  return Number.isSafeInteger(minutes)&&minutes<=1440?minutes:NaN;
}
function travelDraftsFromEstimates(estimates:readonly SavedQueueTravelEstimate[]):Record<string,string>{
  return Object.fromEntries(estimates.map(estimate=>[savedQueueTravelKey(estimate.fromVisitId,estimate.toVisitId),String(estimate.minutes)]));
}
function travelEstimatesForOrder(visitIds:readonly string[],estimates:readonly SavedQueueTravelEstimate[]):SavedQueueTravelEstimate[]{
  const adjacent=new Set(visitIds.slice(1).map((id,index)=>savedQueueTravelKey(visitIds[index],id)));
  if(visitIds[0])adjacent.add(savedQueueTravelKey(null,visitIds[0]));
  return estimates.filter(estimate=>adjacent.has(savedQueueTravelKey(estimate.fromVisitId,estimate.toVisitId)));
}
function travelEstimatesFromDrafts(visitIds:readonly string[],drafts:Record<string,string>):SavedQueueTravelEstimate[]{
  const estimates:SavedQueueTravelEstimate[]=[];
  if(visitIds[0]){
    const toVisitId=visitIds[0],value=drafts[savedQueueTravelKey(null,toVisitId)];
    if(value!==undefined&&value.trim())estimates.push({fromVisitId:null,toVisitId,minutes:parseTravelMinutesDraft(value)!});
  }
  for(let index=1;index<visitIds.length;index++){
    const fromVisitId=visitIds[index-1],toVisitId=visitIds[index],value=drafts[savedQueueTravelKey(fromVisitId,toVisitId)];
    if(value===undefined||!value.trim())continue;
    estimates.push({fromVisitId,toVisitId,minutes:parseTravelMinutesDraft(value)!});
  }
  return estimates;
}
function travelDraftsValid(visitIds:readonly string[],drafts:Record<string,string>):boolean{
  return travelEstimatesFromDrafts(visitIds,drafts).every(estimate=>Number.isSafeInteger(estimate.minutes)&&estimate.minutes>=0&&estimate.minutes<=1440);
}

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
  const [agreementEarliest,setAgreementEarliest]=useState('');
  const [agreementLatest,setAgreementLatest]=useState('');
  const [agreementFixed,setAgreementFixed]=useState('');
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
        daysOfWeek:a.days_of_week?JSON.parse(a.days_of_week):undefined,active:a.active===1,
        preferredStartMinute:a.preferred_start_minute??undefined,preferredFinishMinute:a.preferred_finish_minute??undefined,
        fixedStartMinute:a.fixed_start_minute??undefined
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
      const timing={
        preferredStartMinute:parseServiceClock(agreementEarliest),
        preferredFinishMinute:parseServiceClock(agreementLatest,true),
        fixedStartMinute:parseServiceClock(agreementFixed)
      };
      const token=await getToken({template:'greencollar-api'});if(!token)throw new Error('Sign in first');
      const saved=await createServiceAgreement(api,connectedBusiness.id,locationCustomerId,token,{
        locationId:agreementLocationId,serviceName:agreementName,rateCents:dollarsToCents(agreementPrice),
        estimatedMinutes:Number(agreementMinutes),startsOn:agreementStart,endsOn:agreementEnd||undefined,
        frequency:agreementFrequency,...(agreementFrequency==='custom'?{intervalDays:Number(agreementInterval)}:{}),...timing
      });
      if(sequence!==locationRequest.current)return;
      setServiceAgreements(previous=>[...previous,saved]);setAgreementName('');setAgreementPrice('');
      setAgreementEarliest('');setAgreementLatest('');setAgreementFixed('');
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
    setAgreementEarliest('');setAgreementLatest('');setAgreementFixed('');
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
  const [connectedBusiness,setConnectedBusiness] = useState<OwnedBusiness|null>(null);
  const [weatherReportBusy,setWeatherReportBusy]=useState(false);
  const [weatherReportError,setWeatherReportError]=useState('');
  const [weatherReportSent,setWeatherReportSent]=useState(false);
  const weatherReportEventId=useRef('');
  const [weatherInbox,setWeatherInbox]=useState<{scope:string;items:WeatherInterruption[]}|null>(null);
  const [weatherInboxBusy,setWeatherInboxBusy]=useState(false);
  const [weatherInboxError,setWeatherInboxError]=useState('');
  useEffect(()=>{setAgreementEarliest('');setAgreementLatest('');setAgreementFixed('');setScheduleMembers([]);setScheduleWorkerSubjects([]);setScheduleLunchStart({});setScheduleLunchEnd({});setScheduleTaskWorker('');setWorkdaySchedule(null);},[userId,connectedBusiness?.id]);
  useEffect(()=>{
    routingSettingsRequest.current++;
    routingSettingsBusyRef.current=false;
    setRoutingSettings(null);setRoutingSettingsBusy(false);setRoutingSettingsError('');
  },[userId,connectedBusiness?.id]);
  useEffect(()=>{setInvoiceDrafts([]);invoiceDraftSnapshot.current.clear();setInvoiceError('');},[userId,connectedBusiness?.id]);
  async function saveCompletedService() {
    if(!connectedBusiness||!savedDay||!workSession||workSession.status!=='completed'||workSession.jobId==='demo-job')
      return;
    const reviewKey=completionReviewKey(userId,workSession,savedDay.date);
    if(!isCompletionReviewConfirmed(reviewKey,completionReviewConfirmedKey)){
      setTimerError('Review and confirm the recorded duration before saving this visit.');return;
    }
    const api=process.env.EXPO_PUBLIC_GREENCOLLAR_API_URL;
    if(!api){setTimerError('API URL not configured');return;}
    if(submitting.current||timerSaved||!timerReady||timerNeedsRestore.current||timerTransition.current.busy)return;
    submitting.current=true;setLoadingSaved(true);setTimerError('');
    try {
      const token=await getToken({template:'greencollar-api'});
      if(!token)throw new Error('Sign in first');
      const prefix=workSession.jobId;
      const agreementId=prefix.slice(0,-(savedDay.date.length+1));
      if(!agreementId||!prefix.endsWith(':'+savedDay.date))throw new Error('Invalid scheduled visit');
      await saveVisitCompletion(api,token,{businessId:connectedBusiness.id,agreementId,date:savedDay.date,actualMinutes:completionRecord(workSession).actualMinutes,workNote:workSession.note??''});
      if(timerOperator.current!==userId||workSessionCurrent.current!==workSession)return;
      setTimerSaved(true);
      setSavedDay(await fetchDayData(api,connectedBusiness.id,savedDay.date,token));
    } catch(e) {setTimerError(e instanceof Error?e.message:'Unable to save completed service');}
    finally {submitting.current=false;setLoadingSaved(false);}
  }
  async function saveWorkNote(){
    if(timerTransition.current.busy){setWorkNoteError('Wait for the current timer save to finish.');return;}
    const operator=userId,current=workSessionCurrent.current;
    if(!operator||!current||current.jobId==='demo-job'||!timerReady||timerNeedsRestore.current){
      setWorkNoteError('Restore a saved job timer before saving its note.');return;
    }
    if(current.status==='completed'&&(timerSaved||hasSavedWorkCompletion(current,savedDay?.visits??[]))){
      setWorkNoteError('This completed visit is already saved.');return;
    }
    let writing=false;
    try{
      const next=withWorkNote(current,workNoteDraft);
      if(next.note===(current.note??'')){setWorkNoteError('');return;}
      writing=true;setTimerTransitionBusy(true);setWorkNoteError('');
      const applied=await timerTransition.current.run(next,snapshot=>saveWorkSession(operator,snapshot),
        ()=>timerOperator.current===operator&&workSessionCurrent.current===current,
        snapshot=>{workSessionCurrent.current=snapshot;setWorkSession(snapshot);});
      if(!applied&&timerOperator.current===operator)throw new Error('The active job changed before the note save completed.');
    }catch(e){
      if(timerOperator.current===operator){
        if(writing){timerNeedsRestore.current=true;setTimerRestored(false);setTimerReadyUser(null);}
        setWorkNoteError(writing
          ?'Could not confirm the note save. Restore the job timer before continuing; the note may have been written.'
          :e instanceof Error?e.message:'Unable to save work note');
      }
    }finally{if(writing)setTimerTransitionBusy(false);}
  }

  async function skipSavedVisit(agreementId:string,date:string){
    if(!connectedBusiness||!savedDay||savedDay.date!==date){setVisitSkipError('Load the matching saved workday first.');return;}
    const api=process.env.EXPO_PUBLIC_GREENCOLLAR_API_URL;
    if(!api){setVisitSkipError('API URL not configured');return;}
    if(visitSkipBusy||timerTransition.current.busy)return;
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
  async function persistSavedQueueApproval(review:NonNullable<typeof savedQueueReview>){
    if(!userId){setSavedQueueApprovalError('Sign in to approve this saved work queue.');return;}
    if(!currentSavedQueueContext.current.canApprove||currentSavedQueueContext.current.userId!==userId||currentSavedQueueContext.current.approvalKey!==review.approvalKey){setSavedQueueApprovalError('The work queue changed. Review it again before approving.');return;}
    setSavedQueueApprovalBusy(true);setSavedQueueApprovalError('');
    try{
      await localSavedQueueApproval.approve(userId,review);
      if(currentSavedQueueContext.current.canApprove&&currentSavedQueueContext.current.userId===userId&&currentSavedQueueContext.current.approvalKey===review.approvalKey)setApprovedSavedQueueKey(review.approvalKey);
    }catch{
      setApprovedSavedQueueKey(null);
      setSavedQueueApprovalError('Secure device storage could not save the approval. Starting saved work is disabled.');
    }finally{setSavedQueueApprovalBusy(false);}
  }
  function requestSavedQueueApproval(){
    if(!savedQueueReview||!currentSavedQueueContext.current.canApprove||savedQueueApprovalChecking||savedQueueApprovalBusy)return;
    const review=savedQueueReview;
    const workloadDetails=review.workload?describeSavedQueueWorkload(review.workload)+' All visits remain in this queue. Workload totals exclude travel and breaks.\n\n':'';
    const appointmentDetails=describeSavedQueueAppointments(review.appointments)+' '+describeAppointmentCheckAssumptions(review.appointments)+(review.appointments.status==='conflicts'?' Approval records your review; it does not resolve these conflicts.':'')+'\n\n';
    const details=workloadDetails+appointmentDetails+review.visitCount+' scheduled visits · '+review.estimatedServiceMinutes+' estimated service minutes · $'+(review.expectedRevenueCents/100).toFixed(2)+' expected revenue. This is the saved work order; travel is not optimized.\n\n'+savedQueueVisits.map((visit,index)=>(index+1)+'. '+visit.customer+' · '+visit.service+' · '+describeServiceTimeConstraints(visit)).join('\n');
    Alert.alert("Review today's work queue",details,[
      {text:'Keep reviewing',style:'cancel'},
      {text:savedQueueApprovalAction(review),onPress:()=>void persistSavedQueueApproval(review)}
    ]);
  }  function confirmSkipSavedVisit(agreementId:string,date:string){
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
  async function loadSavedDay(date=localCalendarDate()) {
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
      setSavedDay(await fetchDayData(api,business,date,token));
    }catch(e){setSavedDayError(e instanceof Error?e.message:'Unable to load saved data');}
    finally{setLoadingSaved(false);}
  }
  async function loadRoutingSettings(){
    const api=process.env.EXPO_PUBLIC_GREENCOLLAR_API_URL;
    if(!api||!connectedBusiness){setRoutingSettingsError('Load a saved business and configure the API URL first. Manual travel estimates remain available.');return;}
    if(routingSettingsBusyRef.current)return;
    routingSettingsBusyRef.current=true;
    const request=++routingSettingsRequest.current;
    const scope=JSON.stringify([userId,connectedBusiness.id]);
    setRoutingSettingsBusy(true);setRoutingSettingsError('');
    try{
      const token=await getToken({template:'greencollar-api'});
      if(!token)throw new Error('Sign in first');
      const settings=await fetchRoutingSettings(api,connectedBusiness.id,token);
      if(request===routingSettingsRequest.current&&scope===JSON.stringify([userId,connectedBusiness?.id]))
        setRoutingSettings(settings);
    }catch(error){
      if(request===routingSettingsRequest.current)
        setRoutingSettingsError(error instanceof Error?error.message:'Routing readiness is unavailable. Manual travel estimates remain active.');
    }finally{
      if(request===routingSettingsRequest.current){routingSettingsBusyRef.current=false;setRoutingSettingsBusy(false);}
    }
  }
  async function updateRoutingSettings(action:'acknowledge'|'withdraw'|'enable'|'disable'){
    const api=process.env.EXPO_PUBLIC_GREENCOLLAR_API_URL,settings=routingSettings,business=connectedBusiness;
    if(!api||!business||!settings||(action!=='disable'&&!settings.noticeVersion)){setRoutingSettingsError('Current routing policy settings are unavailable. Manual travel estimates remain active.');return;}
    if(action==='acknowledge'&&(!settings.termsUrl||!settings.privacyUrl)){setRoutingSettingsError('Public Terms and Privacy pages must be ready before acknowledging the notice.');return;}
    if(action==='enable'&&(!settings.available||!settings.noticeAcknowledged)){setRoutingSettingsError('Provider readiness and this operator’s current notice acknowledgment are both required.');return;}
    if(action==='disable'&&!settings.businessEnabled){return;}
    if(routingSettingsBusyRef.current)return;
    routingSettingsBusyRef.current=true;
    const request=++routingSettingsRequest.current;
    const scope=JSON.stringify([userId,business.id]);
    setRoutingSettingsBusy(true);setRoutingSettingsError('');
    let writeSubmitted=false;
    try{
      const token=await getToken({template:'greencollar-api'});
      if(!token)throw new Error('Sign in first');
      if(action==='acknowledge'||action==='withdraw'){
        await acknowledgeRoutingNotice(api,business.id,token,settings.noticeVersion??'',action==='acknowledge');
        writeSubmitted=true;
      }else{
        await setBusinessRoutingEnabled(api,business.id,token,action==='enable',settings.noticeAcknowledged,settings.noticeVersion??'');
        writeSubmitted=true;
      }
      const updated=await fetchRoutingSettings(api,business.id,token);
      if(request===routingSettingsRequest.current&&scope===JSON.stringify([userId,connectedBusiness?.id]))
        setRoutingSettings(updated);
    }catch(error){
      if(request===routingSettingsRequest.current)
        setRoutingSettingsError(writeSubmitted?'The setting change was submitted but could not be confirmed. Refresh routing readiness before retrying.':error instanceof Error?error.message:'Could not update routing settings. Manual travel estimates remain active.');
    }finally{
      if(request===routingSettingsRequest.current){routingSettingsBusyRef.current=false;setRoutingSettingsBusy(false);}
    }
  }
  async function openRoutingPolicy(url:string|null){
    if(!url||!/^https:\/\//i.test(url)){setRoutingSettingsError('A public HTTPS policy page is not configured.');return;}
    try{await Linking.openURL(url);}
    catch{setRoutingSettingsError('Could not open the policy page. Manual travel estimates remain active.');}
  }
  const [tab, setTab] = useState<'today' | 'customers' | 'planner' | 'invoices' | 'schedule'>('today');
  const [workdaySchedule,setWorkdaySchedule]=useState<WorkdaySchedule|null>(null);
  const [scheduleBusy,setScheduleBusy]=useState(false);
  const [scheduleError,setScheduleError]=useState('');
  const [scheduleNotice,setScheduleNotice]=useState('');
  const [scheduleTruckId,setScheduleTruckId]=useState('truck-1');
  const [scheduleStart,setScheduleStart]=useState('08:00');
  const [scheduleEnd,setScheduleEnd]=useState('17:00');
  const [scheduleMembers,setScheduleMembers]=useState<BusinessMember[]>([]);
  const [scheduleRosterBusy,setScheduleRosterBusy]=useState(false);
  const [scheduleWorkerSubjects,setScheduleWorkerSubjects]=useState<string[]>([]);
  const [scheduleLunchStart,setScheduleLunchStart]=useState<Record<string,string>>({});
  const [scheduleLunchEnd,setScheduleLunchEnd]=useState<Record<string,string>>({});
  const [scheduleSelectedAgreementIds,setScheduleSelectedAgreementIds]=useState<string[]>([]);
  const [scheduleTaskDrafts,setScheduleTaskDrafts]=useState<Record<string,ScheduledTask[]>>({});
  const [scheduleTaskLabel,setScheduleTaskLabel]=useState('Mowing');
  const [scheduleTaskMinutes,setScheduleTaskMinutes]=useState('45');
  const [scheduleTaskWorker,setScheduleTaskWorker]=useState('');
  const [customers, setCustomers] = useState<Customer[]>(seed);
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [hours, setHours] = useState('8');
  const [maxJobs, setMaxJobs] = useState('6');
  const [planned, setPlanned] = useState(false);
  const [workSession,setWorkSession]=useState<WorkSession|null>(null);
  const workSessionCurrent=useRef<WorkSession|null>(null);
  workSessionCurrent.current=workSession;
  const timerOperator=useRef<string|null|undefined>(userId);
  timerOperator.current=userId;
  const [timerNow,setTimerNow]=useState(Date.now());
  const displayedTimer=timerDisplay(workSession,timerNow);
  const [timerError,setTimerError]=useState('');
  const [workNoteDraft,setWorkNoteDraft]=useState('');
  const [workNoteError,setWorkNoteError]=useState('');
  const [timerSaved,setTimerSaved]=useState(false);
  const [completionReviewConfirmedKey,setCompletionReviewConfirmedKey]=useState('');
  const [visitSkipBusy,setVisitSkipBusy]=useState('');
  const [visitSkipError,setVisitSkipError]=useState('');
  const [visitSkipNotice,setVisitSkipNotice]=useState('');
  const [approvedSavedQueueKey,setApprovedSavedQueueKey]=useState<string|null>(null);
  const [savedQueueApprovalChecking,setSavedQueueApprovalChecking]=useState(false);
  const [savedQueueApprovalBusy,setSavedQueueApprovalBusy]=useState(false);
  const [savedQueueApprovalError,setSavedQueueApprovalError]=useState('');
  const savedQueueApprovalRequest=useRef(0);
  const [savedQueueWorkloadSettings]=useState(()=>createSavedQueueWorkloadSettings(localSavedQueueWorkload));
  const [savedQueueWorkloadState,setSavedQueueWorkloadState]=useState(()=>savedQueueWorkloadSettings.getState());
  const [savedQueueOrder,setSavedQueueOrder]=useState<SavedQueueOrder|null>(null);
  const [savedQueueOrderReadyScope,setSavedQueueOrderReadyScope]=useState<string|null>(null);
  const [savedQueueOrderLoadBusy,setSavedQueueOrderLoadBusy]=useState(false);
  const [savedQueueOrderSaveBusy,setSavedQueueOrderSaveBusy]=useState(false);
  const [savedQueueOrderError,setSavedQueueOrderError]=useState('');
  const [savedQueueOrderReload,setSavedQueueOrderReload]=useState(0);
  const [savedQueueTravelDrafts,setSavedQueueTravelDrafts]=useState<Record<string,string>>({});
  const [savedQueueTravelError,setSavedQueueTravelError]=useState('');
  const [routingSettings,setRoutingSettings]=useState<RoutingSettings|null>(null);
  const [routingSettingsBusy,setRoutingSettingsBusy]=useState(false);
  const [routingSettingsError,setRoutingSettingsError]=useState('');
  const [roadTruckAssignments,setRoadTruckAssignments]=useState<Record<string,PreviewTruck>>({});
  const [roadPreview,setRoadPreview]=useState<{scope:string;truck:PreviewTruck;legs:{from:number;to:number;minutes:number|null}[];attribution:string}|null>(null);
  const [roadPreviewBusy,setRoadPreviewBusy]=useState(false);
  const roadPreviewRequest=useRef(0);
  const routingSettingsRequest=useRef(0);
  const routingSettingsBusyRef=useRef(false);
  const savedQueueOrderWriteLock=useRef(false);
  const savedQueueScopeRef=useRef('');
  const currentSavedQueueContext=useRef<{userId:string|null|undefined;approvalKey:string|null;canApprove:boolean}>({userId:null,approvalKey:null,canApprove:false});
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
  const [invoiceDrafts,setInvoiceDrafts]=useState<PersistedInvoiceDraft[]>([]);
  const [invoiceError,setInvoiceError]=useState('');
  const [invoiceBusy,setInvoiceBusy]=useState(false);
  const [invoiceSavingId,setInvoiceSavingId]=useState<string|null>(null);
  const invoiceDraftSnapshot=useRef(new Map<string,string>());
  const invoiceRevision=(d:PersistedInvoiceDraft)=>JSON.stringify({dueOn:d.dueOn,unitPriceCents:d.lines[0]?.unitPriceCents,taxBasisPoints:d.taxBasisPoints});
  async function prepareInvoiceDrafts(){
    const api=process.env.EXPO_PUBLIC_GREENCOLLAR_API_URL;
    if(!savedDay||!connectedBusiness||!api){setInvoiceError('Load a saved workday, business, and API connection first');return;}
    setInvoiceBusy(true);setInvoiceError('');
    try{
      const token=await getToken({template:'greencollar-api'});if(!token)throw new Error('Sign in first');
      const existing=await listInvoiceDrafts(api,connectedBusiness.id,token);
      const byVisit=new Map(existing.invoiceDrafts.map(d=>[d.serviceVisitId,d]));
      for(const job of billableCompletedServices(savedDay,connectedBusiness.id)){
        const current=byVisit.get(job.visitId);
        const saved=current??await createPersistedInvoiceDraft(api,token,connectedBusiness.id,job.visitId,job.visitDate);
        byVisit.set(saved.serviceVisitId,saved);
      }
      const drafts=[...byVisit.values()];
      setInvoiceDrafts(drafts);
      invoiceDraftSnapshot.current=new Map(drafts.map(d=>[d.id,invoiceRevision(d)]));
      setInvoiceError(existing.hasMore?'Showing the newest 200 drafts; additional saved drafts exist.':'');
    }catch(e){setInvoiceError(e instanceof Error?e.message:'Could not load or prepare saved drafts');}
    finally{setInvoiceBusy(false);}
  }
  async function saveInvoiceDraft(id:string){
    const api=process.env.EXPO_PUBLIC_GREENCOLLAR_API_URL,draft=invoiceDrafts.find(d=>d.id===id);
    if(!api||!draft){setInvoiceError('Load this saved draft before saving changes');return;}
    if(invoiceSavingId)return;
    setInvoiceSavingId(id);setInvoiceError('');
    try{
      const token=await getToken({template:'greencollar-api'});if(!token)throw new Error('Sign in first');
      const saved=await savePersistedInvoiceDraft(api,token,draft);
      setInvoiceDrafts(previous=>previous.map(d=>d.id===id?saved:d));
      invoiceDraftSnapshot.current.set(id,invoiceRevision(saved));
    }catch(e){setInvoiceError(e instanceof Error?e.message:'Could not save invoice draft');}
    finally{setInvoiceSavingId(null);}
  }
  function editDraftPrice(id:string,value:string){
    if(!/^\d+(\.\d{0,2})?$/.test(value))return;
    const dollars=Number(value);
    if(!Number.isFinite(dollars)||dollars>1000000)return;
    const cents=Math.round(dollars*100);
    setInvoiceDrafts(prev=>prev.map(d=>d.id===id&&d.status==='draft'?{...d,lines:d.lines.map((line,i)=>i===0?{...line,unitPriceCents:cents}:line)}:d));
  }
  function editDraftTaxRate(id:string,value:string){
    if(!/^\d{1,3}(\.\d{0,2})?$/.test(value))return;
    const percent=Number(value);if(!Number.isFinite(percent)||percent>100)return;
    const basisPoints=Math.round(percent*100);
    setInvoiceDrafts(prev=>prev.map(d=>d.id===id&&d.status==='draft'?{...setInvoiceTaxBasisPoints(d,basisPoints),serviceVisitId:d.serviceVisitId}:d));
  }
  function editDraftDueDays(id:string,days:number){
    setInvoiceDrafts(prev=>prev.map(d=>d.id===id&&d.status==='draft'?{...setInvoiceDueDays(d,days),serviceVisitId:d.serviceVisitId}:d));
  }
  const timerNeedsRestore=useRef(true);
  const [timerRestored,setTimerRestored]=useState(false);
  const [timerReadyUser,setTimerReadyUser]=useState<string|null>(null);
  const [timerRestoreBusy,setTimerRestoreBusy]=useState(false);
  const [timerRestoreRetry,setTimerRestoreRetry]=useState(0);
  const timerTransition=useRef(createDurableTimerTransition());
  const [timerTransitionBusy,setTimerTransitionBusy]=useState(false);
  const timerReady=timerRestored&&timerReadyUser===userId&&!timerTransitionBusy;
  const submitting=useRef(false);
  useEffect(()=>{
    let active=true;
    timerNeedsRestore.current=true;
    setTimerRestored(false);setTimerReadyUser(null);setTimerSaved(false);setTimerError('');
    setWorkSession(null);workSessionCurrent.current=null;
    if(!userId){setTimerRestoreBusy(false);return ()=>{active=false;};}
    setTimerRestoreBusy(true);
    void loadWorkSession(userId).then(saved=>{
      if(active){timerNeedsRestore.current=false;workSessionCurrent.current=saved;setWorkSession(saved);setTimerReadyUser(userId);setTimerRestored(true);}
    }).catch(error=>{if(active)setTimerError('Could not restore job timer. '+(error instanceof Error?error.message:'Storage is unavailable')+'. Retry before starting work; the saved timer has not been replaced.');})
      .finally(()=>{if(active)setTimerRestoreBusy(false);});
    return ()=>{active=false;};
  },[userId,timerRestoreRetry]);
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
  async function timerAction(action:'start'|'pause'|'resume'|'complete', jobId='demo-job') {
    if(timerTransition.current.busy)return;
    const operator=userId;
    let saving=false;
    try {
      if(!operator||!timerReady||timerNeedsRestore.current)throw new Error('Restore the job timer before starting work');
      if(submitting.current)throw new Error('Wait for the completed visit to finish saving');
      const now=Date.now();setTimerNow(now);setTimerError('');
      const current=workSessionCurrent.current;
      if(action==='complete'&&current&&current.jobId!=='demo-job'&&normalizeWorkNote(workNoteDraft)!==(current.note??''))
        throw new Error('Save the work note before completing this visit.');
      let next:WorkSession;
      if(action==='start'){
        if(jobId!=='demo-job'&&(!currentSavedQueueContext.current.canApprove
          ||currentSavedQueueContext.current.userId!==operator
          ||currentSavedQueueContext.current.approvalKey!==approvedSavedQueueKey
          ||!approvedSavedQueueKey||savedQueueApprovalChecking||savedQueueApprovalBusy
          ||!savedQueueVisits.some(visit=>visit.id===jobId)))
          throw new Error('Review and approve the current saved work queue before starting this service.');
        const completionSaved=timerSaved||hasSavedWorkCompletion(current,savedDay?.visits??[]);
        next=startNextWork(jobId,now,current,completionSaved);
      }else{
        if(!current)throw new Error('Start a job first');
        next=action==='pause'?pauseWork(current,now):action==='resume'?resumeWork(current,now):completeWork(current,now);
      }
      saving=true;setTimerTransitionBusy(true);
      await timerTransition.current.run(next,snapshot=>saveWorkSession(operator,snapshot),
        ()=>timerOperator.current===operator&&workSessionCurrent.current===current,
        snapshot=>{
          workSessionCurrent.current=snapshot;setWorkSession(snapshot);
          if(action==='start')setTimerSaved(false);
        });
    }catch(e){
      if(timerOperator.current===operator){
        if(saving){timerNeedsRestore.current=true;setTimerRestored(false);setTimerReadyUser(null);}
        setTimerError(saving?'Could not confirm the timer save. Restore the job timer before continuing; the requested change is not confirmed.':e instanceof Error?e.message:'Timer error');
      }
    }finally{if(saving)setTimerTransitionBusy(false);}
  }

  useEffect(()=>{
    if(workSession?.status!=='running'||tab!=='today'){setTimerNow(Date.now());return;}
    const ticker=createForegroundTimerTicker(setTimerNow,Date.now,{
      every(callback,milliseconds){const id=setInterval(callback,milliseconds);return ()=>clearInterval(id);}
    });
    ticker.setActive(AppState.currentState==='active'||AppState.currentState===null);
    const subscription=AppState.addEventListener('change',state=>ticker.setActive(state==='active'));
    return ()=>{ticker.dispose();subscription.remove();};
  },[workSession?.status,workSession?.startedAt,userId,tab]);

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
  const savedDueSummary=savedDay?summarizeSavedDay(savedDay):null;
  const completedTimerSaved=timerSaved||hasSavedWorkCompletion(workSession,savedDay?.visits??[]);
  const completedTimerDate=workSessionDate(workSession);
  const completedReviewKey=completionReviewKey(userId,workSession,savedDay?.date??null);
  useEffect(()=>{
    setWorkNoteDraft(workSession?.note??'');setWorkNoteError('');
  },[userId,workSession?.jobId,workSession?.startedAt,workSession?.note]);
  const completedServiceEstimate=workSession?.status==='completed'&&savedDay
    ?savedDay.agreements.find(agreement=>workSession.jobId===agreement.id+':'+savedDay.date)?.estimated_minutes??null
    :null;
  useEffect(()=>{setCompletionReviewConfirmedKey('');},[completedReviewKey]);
  const timerCanStart=timerReady&&!timerTransitionBusy&&!loadingSaved&&canStartNextWork(workSession,completedTimerSaved);
  const savedQueueScope=JSON.stringify([userId,connectedBusiness?.id,savedDay?.date]);
  const weatherScope=JSON.stringify([userId,connectedBusiness?.id,savedDay?.date]);
  useEffect(()=>{setWeatherReportError('');setWeatherReportSent(false);weatherReportEventId.current='';setWeatherInbox(null);setWeatherInboxError('');},[weatherScope]);
  savedQueueScopeRef.current=savedQueueScope;
  const savedQueueOrderReady=savedQueueOrderReadyScope===savedQueueScope;
  const savedQueueOrderedVisits=orderSavedQueue(savedDueSummary?.due??[],savedQueueScope,savedQueueOrder);
  const savedQueueVisitIds=savedQueueOrderedVisits.map(visit=>visit.id);
  const savedQueueTravelEstimates=travelEstimatesFromDrafts(savedQueueVisitIds,savedQueueTravelDrafts);
  const savedQueuePersistedTravel=travelEstimatesForOrder(savedQueueVisitIds,savedQueueOrder?.travelEstimates??[]);
  const savedQueueTravelValid=travelDraftsValid(savedQueueVisitIds,savedQueueTravelDrafts);
  const savedQueueTravelDirty=JSON.stringify(savedQueueTravelEstimates)!==JSON.stringify(savedQueuePersistedTravel);
  const savedQueueVisits=savedQueueOrderedVisits.map((visit,index)=>{
    const fromVisitId=index===0?null:savedQueueVisitIds[index-1];
    const travelMinutesBefore=parseTravelMinutesDraft(savedQueueTravelDrafts[savedQueueTravelKey(fromVisitId,visit.id)]??'');
    return travelMinutesBefore===undefined?visit:{...visit,travelMinutesBefore};
  });
  const truckPreviewPlan=prepareTruckPreview(savedQueueVisits,roadTruckAssignments);
  const truckPreviewScope=JSON.stringify([savedQueueScope,savedQueueVisitIds]);
  useEffect(()=>{roadPreviewRequest.current++;setRoadTruckAssignments({});setRoadPreview(null);},[truckPreviewScope]);
  const currentWorkloadState=savedQueueWorkloadState.scopeKey===savedQueueScope?savedQueueWorkloadState:null;
  const currentWorkloadLimits=currentWorkloadState?.draft??{hours:'',maxJobs:''};
  const savedWorkloadReadyForApproval=workloadSettingsReadyForApproval(currentWorkloadState);
  const savedWorkloadDirty=!!currentWorkloadState&&workloadSettingsHaveUnsavedChanges(currentWorkloadState);
  const savedQueueReview=savedDay&&connectedBusiness&&savedDueSummary?createSavedQueueReview(connectedBusiness.id,savedDay.date,savedQueueVisits,currentWorkloadLimits):null;
  const savedQueueWorkload=savedQueueReview?.workload;
  const savedQueueWorkloadValid=savedQueueWorkload?.status==='within_limits'||savedQueueWorkload?.status==='over_limits';
  const savedQueueAppointments=savedQueueReview?.appointments;
  const savedAppointmentCheckReady=savedQueueOrderReady&&(currentWorkloadState?.status==='ready'||currentWorkloadState?.status==='saving');
  const savedQueueSettingsValid=savedQueueWorkloadValid&&savedQueueAppointments?.workdayWindow.status!=='invalid'&&savedQueueAppointments?.plannedBreak.status!=='invalid';
  const savedQueueAppointmentIssues=new Map<string,string[]>();
  for(const issue of savedQueueAppointments?.issues??[]){
    savedQueueAppointmentIssues.set(issue.visitId,[...(savedQueueAppointmentIssues.get(issue.visitId)??[]),issue.message]);
  }
  const savedQueueCanApprove=savedWorkloadReadyForApproval&&savedQueueTravelValid&&!savedQueueTravelDirty&&canApproveSavedQueueReview(savedQueueReview)&&savedQueueOrderReady&&!savedQueueOrderLoadBusy&&!savedQueueOrderSaveBusy&&!loadingSaved&&!visitSkipBusy;
  currentSavedQueueContext.current={userId,approvalKey:savedQueueReview?.approvalKey??null,canApprove:savedQueueCanApprove};
  const savedQueueEditingLocked=timerTransitionBusy||!savedQueueOrderReady||savedQueueOrderLoadBusy||savedQueueOrderSaveBusy||loadingSaved||savedQueueApprovalChecking||savedQueueApprovalBusy||!!visitSkipBusy||!!workSession&&workSession.status!=='completed';
  const savedQueueWorkloadOperationLocked=timerTransitionBusy||!savedQueueOrderReady||savedQueueOrderLoadBusy||savedQueueOrderSaveBusy||loadingSaved||savedQueueApprovalBusy||!!visitSkipBusy||!!workSession&&workSession.status!=='completed';
  const savedQueueWorkloadEditingLocked=savedQueueWorkloadOperationLocked||currentWorkloadState?.status!=='ready';
  useEffect(()=>savedQueueWorkloadSettings.subscribe(setSavedQueueWorkloadState),[savedQueueWorkloadSettings]);
  useEffect(()=>{
    void savedQueueWorkloadSettings.activate(userId&&connectedBusiness&&savedDay
      ?{subject:userId,businessId:connectedBusiness.id,date:savedDay.date}:null);
    return ()=>savedQueueWorkloadSettings.reset();
  },[savedQueueScope,savedQueueWorkloadSettings]);
  function invalidateSavedWorkloadApproval(){
    // Gate dialog/start callbacks immediately, before React applies the next settings state.
    currentSavedQueueContext.current={...currentSavedQueueContext.current,approvalKey:null,canApprove:false};
    savedQueueApprovalRequest.current++;setSavedQueueApprovalChecking(false);
    setApprovedSavedQueueKey(null);setSavedQueueApprovalError('');
  }
  function changeSavedQueueWorkloadLimit(field:keyof SavedQueueWorkloadLimits,value:string){
    if(savedQueueWorkloadEditingLocked)return;
    invalidateSavedWorkloadApproval();
    savedQueueWorkloadSettings.edit(field,value);
  }
  async function saveSavedQueueWorkloadLimits(){
    if(savedQueueWorkloadEditingLocked)return;
    invalidateSavedWorkloadApproval();
    await savedQueueWorkloadSettings.save();
  }
  function retrySavedQueueWorkloadLimits(){
    if(savedQueueWorkloadOperationLocked)return;
    invalidateSavedWorkloadApproval();
    void savedQueueWorkloadSettings.retry();
  }
  function replaceSavedQueueWorkloadLimits(){
    if(savedQueueWorkloadOperationLocked)return;
    invalidateSavedWorkloadApproval();
    savedQueueWorkloadSettings.enterReplacement();
  }
  const savedQueueReordered=savedQueueVisits.some((visit,index)=>visit.id!==savedDueSummary?.due[index]?.id);
  useEffect(()=>{
    let active=true;
    setSavedQueueOrder(null);setSavedQueueTravelDrafts({});setSavedQueueTravelError('');setSavedQueueOrderReadyScope(null);setSavedQueueOrderError('');
    if(!userId||!connectedBusiness||!savedDay){
      setSavedQueueOrderLoadBusy(false);setSavedQueueOrderReadyScope(savedQueueScope);
      return ()=>{active=false;};
    }
    setSavedQueueOrderLoadBusy(true);
    void localSavedQueueOrder.loadState({subject:userId,businessId:connectedBusiness.id,date:savedDay.date},savedDueSummary?.due.map(visit=>visit.id)??[])
      .then(restored=>{
        if(!active)return;
        setSavedQueueOrder(restored?{scopeKey:savedQueueScope,visitIds:restored.visitIds,travelEstimates:restored.travelEstimates}:null);
        setSavedQueueTravelDrafts(travelDraftsFromEstimates(restored?.travelEstimates??[]));
        setSavedQueueOrderReadyScope(savedQueueScope);
      }).catch(()=>{
        if(active)setSavedQueueOrderError('Could not restore this device’s work order. Retry before approving or starting saved work.');
      }).finally(()=>{if(active)setSavedQueueOrderLoadBusy(false);});
    return ()=>{active=false;};
  },[savedQueueScope,savedQueueOrderReload]);
  async function persistSavedQueueOrder(visitIds:string[],travelEstimates=travelEstimatesForOrder(visitIds,savedQueueOrder?.travelEstimates??[]),resetTravelDraft=false){
    if(savedQueueEditingLocked||savedQueueOrderWriteLock.current||!userId||!connectedBusiness||!savedDay)return;
    savedQueueOrderWriteLock.current=true;setSavedQueueOrderSaveBusy(true);setSavedQueueOrderError('');
    const scope=savedQueueScope;
    const compatibleTravelEstimates=travelEstimatesForOrder(visitIds,travelEstimates);
    try{
      await localSavedQueueOrder.save({subject:userId,businessId:connectedBusiness.id,date:savedDay.date},visitIds,compatibleTravelEstimates);
      if(savedQueueScopeRef.current!==scope)return;
      setSavedQueueOrder({scopeKey:scope,visitIds,travelEstimates:compatibleTravelEstimates});
      if(resetTravelDraft)setSavedQueueTravelDrafts(travelDraftsFromEstimates(compatibleTravelEstimates));
      setSavedQueueTravelError('');
      setApprovedSavedQueueKey(null);setSavedQueueApprovalError('');
    }catch(error){
      if(savedQueueScopeRef.current===scope)setSavedQueueOrderError(error instanceof Error?error.message:'Could not save the order. The previous order is unchanged.');
    }finally{savedQueueOrderWriteLock.current=false;setSavedQueueOrderSaveBusy(false);}
  }
  function changeSavedQueueOrder(visitId:string,direction:'earlier'|'later'){
    if(savedQueueEditingLocked)return;
    void persistSavedQueueOrder(moveSavedQueueVisit(savedQueueVisits,visitId,direction).map(visit=>visit.id));
  }
  function resetSavedQueueOrder(){
    if(savedQueueEditingLocked)return;
    void persistSavedQueueOrder(savedDueSummary?.due.map(visit=>visit.id)??[]);
  }
  function changeSavedQueueTravelEstimate(fromVisitId:string|null,toVisitId:string,value:string){
    if(savedQueueEditingLocked)return;
    invalidateSavedWorkloadApproval();setSavedQueueTravelError('');
    const key=savedQueueTravelKey(fromVisitId,toVisitId);
    setSavedQueueTravelDrafts(current=>({...current,[key]:value}));
  }
  function saveSavedQueueTravelEstimates(){
    if(savedQueueEditingLocked||!savedQueueOrderReady)return;
    if(!travelDraftsValid(savedQueueVisitIds,savedQueueTravelDrafts)){
      setSavedQueueTravelError('Enter a whole number from 0 to 1440 minutes for each estimate, or clear the field.');return;
    }
    setSavedQueueTravelError('');
    void persistSavedQueueOrder(savedQueueVisitIds,savedQueueTravelEstimates,true);
  }
  const savedQueueApproved=savedWorkloadReadyForApproval&&isSavedQueueApproved(savedQueueReview,approvedSavedQueueKey);
  useEffect(()=>{
    const request=++savedQueueApprovalRequest.current;
    setApprovedSavedQueueKey(null);setSavedQueueApprovalError('');
    if(!userId||!savedQueueReview||!savedWorkloadReadyForApproval||!canApproveSavedQueueReview(savedQueueReview)||!savedQueueOrderReady){setSavedQueueApprovalChecking(false);return;}
    const review=savedQueueReview;
    setSavedQueueApprovalChecking(true);
    void localSavedQueueApproval.isApproved(userId,review).then(approved=>{
      if(savedQueueApprovalRequest.current===request)setApprovedSavedQueueKey(approved?review.approvalKey:null);
    }).catch(()=>{
      if(savedQueueApprovalRequest.current===request)setSavedQueueApprovalError('Could not verify the device-saved approval. Review and approve again.');
    }).finally(()=>{
      if(savedQueueApprovalRequest.current===request)setSavedQueueApprovalChecking(false);
    });
    return ()=>{if(savedQueueApprovalRequest.current===request)savedQueueApprovalRequest.current++;};
  },[userId,connectedBusiness?.id,savedDay?.date,savedQueueReview?.approvalKey,savedQueueOrderReady,savedWorkloadReadyForApproval]);
  const workloadPreview=planned?assessServiceWorkload(customers.map(customer=>({id:String(customer.id),minutes:customer.minutes})),hours,maxJobs):null;
  const visibleServerLocationConfirmations=filterLocationConfirmations(serverLocationConfirmations,serverAuditKindFilter,serverAuditSourceFilter);

  function requestRoadPreview(route:TruckPreviewRoute){
    if(!connectedBusiness||roadPreviewBusy)return;
    const plan=prepareTruckPreview(savedQueueVisits,roadTruckAssignments);
    if(plan.status!=='ready'){Alert.alert('Truck assignment incomplete','Assign every due stop and confirm each saved coordinate before requesting a preview.');return;}
    const scope=truckPreviewScope;
    Alert.alert('Send stop coordinates to Google?',
      `Truck has ${route.stops.length} stops; the matrix contains ${route.elementCount} elements. Only saved coordinates are sent. Usage is billed if routing is enabled; the server monthly budget can reject the request. No names, notes, contacts, employee data, or device GPS are sent.`,
      [{text:'Cancel',style:'cancel'},{text:'Send and calculate',onPress:()=>{void (async()=>{
        const request=++roadPreviewRequest.current;setRoadPreviewBusy(true);
        try{
          const api=process.env.EXPO_PUBLIC_GREENCOLLAR_API_URL;
          if(!api)throw new Error('Configure the API URL first.');
          const token=await getToken({template:'greencollar-api'});
          if(!token)throw new Error('Sign in first.');
          const settings=await fetchRoutingSettings(api,connectedBusiness.id,token);
          if(!settings.available||!settings.enabled||!settings.businessEnabled||!settings.noticeAcknowledged)
            throw new Error('Routing is not currently enabled for this business and operator. Manual estimates remain available.');
          const points=route.stops.map((stop,index)=>({id:'p'+(index+1),lat:stop.lat,lon:stop.lon}));
          const result=await requestRoutingMatrix(api,connectedBusiness.id,token,points);
          if(request!==roadPreviewRequest.current||scope!==JSON.stringify([savedQueueScope, savedQueueVisitIds]))return;
          const legs=route.stops.slice(0,-1).map((_,index)=>({from:index,to:index+1,minutes:result.durations[index][index+1]===null?null:Math.ceil((result.durations[index][index+1] as number)/60)}));
          setRoadPreview({scope,truck:route.truck,legs,attribution:result.attribution});
        }catch(error){if(request===roadPreviewRequest.current)Alert.alert('Drive-time preview unavailable',error instanceof Error?error.message:'Manual estimates remain available.');}
        finally{if(request===roadPreviewRequest.current)setRoadPreviewBusy(false);}
      })();}}]);
  }
  async function submitWeatherInterruption(reason:WeatherInterruptionReason){
    if(!connectedBusiness||!savedDay||!savedDueSummary||weatherReportBusy)return;
    const api=process.env.EXPO_PUBLIC_GREENCOLLAR_API_URL;
    if(!api){setWeatherReportError('API URL is not configured.');return;}
    const remainingVisitIds=savedQueueVisitIds;
    const completedVisitIds=savedDay.visits.filter(v=>v.scheduled_date===savedDay.date&&v.status==='completed')
      .map(v=>v.agreement_id+':'+v.scheduled_date);
    if(!remainingVisitIds.length){setWeatherReportError('There are no unfinished due visits to carry forward.');return;}
    setWeatherReportBusy(true);setWeatherReportError('');
    try{
      const token=await getToken({template:'greencollar-api'});
      if(!token)throw new Error('Sign in first.');
      if(!weatherReportEventId.current)weatherReportEventId.current='wx-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,10);
      await reportWeatherInterruption(api,token,{businessId:connectedBusiness.id,eventId:weatherReportEventId.current,workDate:savedDay.date,
        reportedAt:new Date().toISOString(),reason,completedVisitIds,remainingVisitIds});
      setWeatherReportSent(true);
    }catch(error){setWeatherReportError(error instanceof Error?error.message:'Unable to save the interruption report.');}
    finally{setWeatherReportBusy(false);}
  }
  function promptWeatherInterruption(){
    if(!connectedBusiness||!savedDay||!savedDueSummary||!businessRoleCapabilities(connectedBusiness.role).recordFieldWork)return;
    Alert.alert('Report a shortened workday',
      `${savedDueSummary.completedCount} completed · ${savedQueueVisitIds.length} unfinished. This records the interruption for manager review; it does not reschedule visits or notify customers.`,
      [{text:'Cancel',style:'cancel'},
       {text:'Rain',onPress:()=>void submitWeatherInterruption('rain')},
       {text:'Other reason',style:'destructive',onPress:()=>void submitWeatherInterruption('other')}]);
  }
  async function refreshWeatherInbox(){
    if(!connectedBusiness||!savedDay||!businessRoleCapabilities(connectedBusiness.role).manageSchedule)return;
    const api=process.env.EXPO_PUBLIC_GREENCOLLAR_API_URL;
    if(!api){setWeatherInboxError('API URL is not configured.');return;}
    setWeatherInboxBusy(true);setWeatherInboxError('');
    try{
      const token=await getToken({template:'greencollar-api'});
      if(!token)throw new Error('Sign in first.');
      const items=await listWeatherInterruptions(api,connectedBusiness.id,savedDay.date,token);
      setWeatherInbox({scope:weatherScope,items});
    }catch(error){setWeatherInboxError(error instanceof Error?error.message:'Unable to load interruption reports.');}
    finally{setWeatherInboxBusy(false);}
  }
  return (
    <SafeAreaView style={styles.page}>
      <StatusBar barStyle="light-content" />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.logo}>greencollar.</Text>
        <Text style={styles.subtitle}>Your business. On autopilot.</Text>
        <View style={styles.tabs}>
          {(['today', 'customers', 'planner', 'invoices', ...(connectedBusiness&&businessRoleCapabilities(connectedBusiness.role).manageSchedule?['schedule' as const]:[])] as const).map(t => (
            <Pressable key={t} style={[styles.tab, tab === t && styles.activeTab]} onPress={() => setTab(t)}>
              <Text style={[styles.tabText, tab === t && styles.activeTabText]}>{t.toUpperCase()}</Text>
            </Pressable>
          ))}
        </View>

        {tab === 'schedule' && connectedBusiness && businessRoleCapabilities(connectedBusiness.role).manageSchedule && <>
          <Text style={styles.heading}>Workday schedule draft</Text>
          <Text style={styles.muted}>Build one truck route for the loaded workday. Add multiple crew members, order stops, and assign separate tasks to individual workers. Saving creates a draft only when none exists for this workday. Existing drafts can be inspected but this first editor does not yet hydrate them for editing. Workers can view only routes they are assigned to.</Text>
          {!savedDay && <Text style={styles.muted}>Load today’s saved workday from the Today tab first so eligible service stops are available.</Text>}
          <View style={styles.card}>
            <Text style={styles.cardHeading}>Route and crew</Text>
            <Text style={styles.label}>Truck ID</Text>
            <TextInput accessibilityLabel="Truck ID" style={styles.input} value={scheduleTruckId} onChangeText={setScheduleTruckId} autoCapitalize="none" />
            <Text style={styles.label}>Route start (24 hour time)</Text>
            <TextInput accessibilityLabel="Route start time" style={styles.input} value={scheduleStart} onChangeText={setScheduleStart} placeholder="08:00" />
            <Text style={styles.label}>Route end (24 hour time)</Text>
            <TextInput accessibilityLabel="Route end time" style={styles.input} value={scheduleEnd} onChangeText={setScheduleEnd} placeholder="17:00" />
            <Text style={styles.label}>Business crew</Text>
            <Pressable accessibilityRole="button" style={styles.primary} disabled={scheduleRosterBusy} onPress={async()=>{
              const api=process.env.EXPO_PUBLIC_GREENCOLLAR_API_URL;if(!api||!connectedBusiness){setScheduleError('Load a business and configure the API URL first.');return;}
              setScheduleRosterBusy(true);setScheduleError('');
              try{const token=await getToken({template:'greencollar-api'});if(!token)throw new Error('Sign in first.');const members=await listWorkdayMembers(api,connectedBusiness.id,token);setScheduleMembers(members);setScheduleWorkerSubjects(current=>current.filter(subject=>members.some(member=>member.subject===subject)));setScheduleNotice(members.length+' verified business member(s) loaded.');}
              catch(error){setScheduleError(error instanceof Error?error.message:'Could not load business crew.');}
              finally{setScheduleRosterBusy(false);}
            }}><Text style={styles.primaryText}>{scheduleRosterBusy?'Loading crew…':'Load business crew'}</Text></Pressable>
            {!scheduleMembers.length?<Text style={styles.muted}>Load the verified owner/admin/worker roster, then select everyone assigned to this route.</Text>:scheduleMembers.map(member=>{
              const selected=scheduleWorkerSubjects.includes(member.subject);
              return <Pressable key={member.subject} accessibilityRole="button" accessibilityState={{selected}} style={styles.primary} onPress={()=>{
                setScheduleWorkerSubjects(current=>selected?current.filter(subject=>subject!==member.subject):[...current,member.subject]);
                if(selected&&scheduleTaskWorker===member.subject)setScheduleTaskWorker('');
                else if(!selected&&!scheduleTaskWorker)setScheduleTaskWorker(member.subject);
              }}><Text style={styles.primaryText}>{selected?'✓ ':''}{member.role} · {member.subject}</Text></Pressable>;
            })}
            <Text style={styles.muted}>Roster access is owner/admin only. Names are not stored in the membership table, so verified account IDs and roles are shown.</Text>
          </View>
          <View style={styles.card}>
            <Text style={styles.cardHeading}>Stops and tasks {savedDay ? '· '+savedDay.date : ''}</Text>
            {!savedDay?.agreements.length && <Text style={styles.muted}>No service agreements loaded for this workday.</Text>}
            {savedDay?.agreements.filter(a=>a.active===1&&a.starts_on<=savedDay.date&&(!a.ends_on||a.ends_on>=savedDay.date)).map((agreement,index)=>{
              const selected=scheduleSelectedAgreementIds.includes(agreement.id);
              const tasks=scheduleTaskDrafts[agreement.id]??[];
              return <View key={agreement.id} style={styles.card}>
                <Pressable accessibilityRole="button" accessibilityState={{selected}} onPress={()=>setScheduleSelectedAgreementIds(current=>selected?current.filter(id=>id!==agreement.id):[...current,agreement.id])}>
                  <Text style={styles.body}>{selected?'☑':'□'} {selected?(scheduleSelectedAgreementIds.indexOf(agreement.id)+1)+'. ':''}{agreement.service_name} · {agreement.address}</Text>
                </Pressable>
                {!!tasks.length&&tasks.map(task=><Text key={task.taskId} style={styles.muted}>• {task.label} · {task.estimatedMinutes} min · {task.assignedSubjects.join(', ')}</Text>)}
                {selected&&<View style={styles.card}>
                  <Text style={styles.label}>Task name for this stop</Text>
                  <TextInput accessibilityLabel={'Task name '+agreement.service_name} style={styles.input} value={scheduleTaskLabel} onChangeText={setScheduleTaskLabel} />
                  <Text style={styles.label}>Assigned worker</Text>
                  {scheduleWorkerSubjects.map(subject=><Pressable key={subject} accessibilityRole="button" accessibilityState={{selected:scheduleTaskWorker===subject}} style={styles.primary} onPress={()=>setScheduleTaskWorker(subject)}><Text style={styles.primaryText}>{scheduleTaskWorker===subject?'✓ ':''}{subject}</Text></Pressable>)}
                  <Text style={styles.label}>Estimated task minutes</Text>
                  <TextInput accessibilityLabel="Estimated task minutes" keyboardType="numeric" style={styles.input} value={scheduleTaskMinutes} onChangeText={setScheduleTaskMinutes} />
                  <Pressable accessibilityRole="button" style={styles.primary} onPress={()=>{
                    const minutes=Number(scheduleTaskMinutes),worker=scheduleTaskWorker;
                    if(!worker||!Number.isInteger(minutes)||minutes<1||minutes>1440){setScheduleError('Choose a crew member and enter task minutes from 1 to 1440.');return;}
                    setScheduleError('');
                    setScheduleTaskDrafts(current=>({...current,[agreement.id]:[...(current[agreement.id]??[]),{taskId:'task-'+Date.now()+'-'+(current[agreement.id]??[]).length,label:scheduleTaskLabel.trim()||agreement.service_name,assignedSubjects:[worker],estimatedMinutes:minutes}]}));
                    setScheduleTaskLabel('Weed whacking');
                  }}><Text style={styles.primaryText}>Add task to this stop</Text></Pressable>
                </View>}
              </View>;
            })}
          </View>
          {!!workdaySchedule&&<View style={styles.card}><Text style={styles.cardHeading}>Saved draft · version {workdaySchedule.version}</Text><Text style={styles.muted}>{workdaySchedule.routes.length} route(s) · last updated {new Date(workdaySchedule.updatedAt).toLocaleString()}</Text></View>}
          {!!scheduleError&&<Text accessibilityLiveRegion="polite" style={styles.muted}>{scheduleError}</Text>}
          {!!scheduleNotice&&<Text accessibilityLiveRegion="polite" style={styles.muted}>{scheduleNotice}</Text>}
          <Pressable accessibilityRole="button" style={styles.primary} disabled={scheduleBusy||!savedDay} onPress={async()=>{
            if(!savedDay||!connectedBusiness)return;
            const api=process.env.EXPO_PUBLIC_GREENCOLLAR_API_URL;if(!api){setScheduleError('API URL is not configured.');return;}
            setScheduleBusy(true);setScheduleError('');setScheduleNotice('');
            try{const token=await getToken({template:'greencollar-api'});if(!token)throw new Error('Sign in first.');
              const loaded=await getWorkdaySchedule(api,connectedBusiness.id,savedDay.date,token).catch(error=>{if(error instanceof Error&&error.message.includes('404'))return null;throw error;});
              if(loaded){setWorkdaySchedule(loaded);setScheduleNotice('A saved draft exists. This first editor can inspect it but cannot safely overwrite it yet; no changes were made.');return;}
              const workers=[...new Set(scheduleWorkerSubjects)];
              const startMinute=scheduleClockMinute(scheduleStart),endMinute=scheduleClockMinute(scheduleEnd);
              if(!scheduleTruckId.trim()||!workers.length||startMinute===null||endMinute===null||startMinute>=endMinute)throw new Error('Enter a truck, load and select at least one verified crew member, and enter valid start/end times.');
              const selected=scheduleSelectedAgreementIds;
              if(!selected.length)throw new Error('Select at least one stop.');
              const routes=[{routeId:'route-1',truckId:scheduleTruckId.trim(),startMinute,endMinute,workers:workers.map(subject=>({subject,startMinute,endMinute})),stops:selected.map((id,index)=>({visitId:id+':'+savedDay.date,order:index+1,tasks:scheduleTaskDrafts[id]??[]}))}];
              if(routes[0].stops.some(stop=>!stop.tasks.length))throw new Error('Add at least one task to every selected stop.');
              const saved=await saveWorkdaySchedule(api,token,{businessId:connectedBusiness.id,workDate:savedDay.date,expectedVersion:0,routes});
              setWorkdaySchedule(saved);setScheduleNotice('Draft saved. It is not published to a live route or GPS device.');
            }catch(error){setScheduleError(error instanceof Error?error.message:'Could not save schedule draft.');}
            finally{setScheduleBusy(false);}
          }}><Text style={styles.primaryText}>{scheduleBusy?'Saving…':'Save workday draft'}</Text></Pressable>
          <Pressable accessibilityRole="button" style={styles.primary} disabled={scheduleBusy||!savedDay} onPress={async()=>{
            if(!savedDay||!connectedBusiness)return;const api=process.env.EXPO_PUBLIC_GREENCOLLAR_API_URL;if(!api){setScheduleError('API URL is not configured.');return;}
            setScheduleBusy(true);setScheduleError('');try{const token=await getToken({template:'greencollar-api'});if(!token)throw new Error('Sign in first.');const saved=await getWorkdaySchedule(api,connectedBusiness.id,savedDay.date,token);setWorkdaySchedule(saved);setScheduleNotice('Loaded saved draft. Review the version and current form before saving.');}
            catch(error){setScheduleError(error instanceof Error?error.message:'Could not load schedule draft.');}finally{setScheduleBusy(false);}
          }}><Text style={styles.primaryText}>Load saved draft</Text></Pressable>
        </>}
        {tab === 'today' && <>
          <Text style={styles.heading}>Today's overview</Text>
          <View style={styles.card}>
            <Text style={styles.cardHeading}>Job timer</Text>
            <Text style={styles.muted}>Use a saved scheduled service below to record its completion. The timer is saved on this device and restored after reopening. Elapsed time updates automatically while this screen is active.</Text>
            <Text style={styles.big}>{displayedTimer.minutes===null?'—':displayedTimer.minutes} min</Text>
            {!!displayedTimer.error&&<Text accessibilityLiveRegion="polite" style={styles.muted}>{displayedTimer.error}</Text>}
            <Text style={styles.body}>Status: {workSession?.status??'not started'} {workSession?.jobId!=='demo-job'&&workSession?.jobId?'· Saved visit':''}</Text>
            {timerTransitionBusy&&<Text style={styles.muted}>Saving timer change…</Text>}
            {!workSession && <Pressable style={styles.primary} disabled={!timerCanStart} onPress={()=>timerAction('start')}><Text style={styles.primaryText}>Start demo job</Text></Pressable>}
            {workSession?.status==='running' && <Pressable style={styles.primary} disabled={!timerReady||timerTransitionBusy} onPress={()=>void timerAction('pause')}><Text style={styles.primaryText}>Pause job</Text></Pressable>}
            {workSession?.status==='paused' && <Pressable style={styles.primary} disabled={!timerReady||timerTransitionBusy} onPress={()=>void timerAction('resume')}><Text style={styles.primaryText}>Resume job</Text></Pressable>}
            {workSession && workSession.status!=='completed' && <Pressable style={styles.primary} disabled={!timerReady||timerTransitionBusy||workSession.jobId!=='demo-job'&&workNoteDraft.trim()!==(workSession.note??'')} onPress={()=>void timerAction('complete')}><Text style={styles.primaryText}>Complete job</Text></Pressable>}
            {workSession?.status==='running' && <Pressable style={styles.primary} onPress={()=>setTimerNow(Date.now())}><Text style={styles.primaryText}>Refresh elapsed time</Text></Pressable>}
            {workSession&&workSession.jobId!=='demo-job'&&timerRestored&&timerReadyUser===userId&&<View style={styles.card}>
              <Text style={styles.cardHeading}>Visit work note</Text>
              <TextInput accessibilityLabel="Visit work note" style={[styles.input,{minHeight:84,textAlignVertical:'top'}]} placeholder="Record work completed or follow-up needed" placeholderTextColor="#819b8b" value={workNoteDraft} onChangeText={setWorkNoteDraft} multiline maxLength={1000} editable={!timerTransitionBusy&&!completedTimerSaved}/>
              <Text style={styles.muted}>{workNoteDraft.length}/1000 · {completedTimerSaved?'Saved with the completed visit.':'Saved on this device until completion is submitted.'}</Text>
              {!!workNoteError&&<Text accessibilityLiveRegion="polite" style={styles.muted}>{workNoteError}</Text>}
              {!completedTimerSaved&&<Pressable accessibilityRole="button" style={styles.primary} disabled={!timerReady||timerTransitionBusy||loadingSaved} onPress={()=>void saveWorkNote()}><Text style={styles.primaryText}>{timerTransitionBusy?'Saving work note…':'Save work note'}</Text></Pressable>}
            </View>}
            {workSession?.status==='completed' && <View style={styles.card}>
              <Text style={styles.cardHeading}>Review completed service</Text>
              {completedServiceEstimate!==null&&<Text style={styles.body}>Scheduled estimate: {completedServiceEstimate} min</Text>}
              <Text style={styles.body}>Recorded actual: {completionRecord(workSession).actualMinutes} min</Text>
              {workSession.jobId!=='demo-job'&&!completedTimerSaved&&<Pressable accessibilityRole="checkbox" accessibilityState={{checked:isCompletionReviewConfirmed(completedReviewKey,completionReviewConfirmedKey)}} style={styles.primary} onPress={()=>setCompletionReviewConfirmedKey(current=>isCompletionReviewConfirmed(completedReviewKey,current)?'':(completedReviewKey??''))}>
                <Text style={styles.primaryText}>{isCompletionReviewConfirmed(completedReviewKey,completionReviewConfirmedKey)?'✓ Duration reviewed':'Confirm recorded duration'}</Text>
              </Pressable>}
              {workSession.jobId!=='demo-job'&&!completedTimerSaved&&<Text style={styles.muted}>Check the recorded minutes before saving. Any timer or workday change clears this confirmation.</Text>}
            </View>}
            {workSession?.status==='completed' && workSession.jobId!=='demo-job' && !completedTimerSaved && <Pressable style={styles.primary} disabled={loadingSaved||!timerReady||timerTransitionBusy||!isCompletionReviewConfirmed(completedReviewKey,completionReviewConfirmedKey)} onPress={()=>void saveCompletedService()}><Text style={styles.primaryText}>Save completed visit</Text></Pressable>}
            {completedTimerSaved && <Text style={styles.body}>Visit completion saved to Cloudflare.</Text>}
            {workSession?.status==='completed'&&workSession.jobId!=='demo-job'&&!completedTimerSaved&&completedTimerDate&&<Pressable accessibilityRole="button" style={styles.primary} disabled={loadingSaved} onPress={()=>void loadSavedDay(completedTimerDate)}><Text style={styles.primaryText}>Load completed visit’s workday · {completedTimerDate}</Text></Pressable>}
            {workSession?.status==='completed' && <Pressable style={styles.primary} disabled={!timerCanStart} onPress={()=>timerAction('start')}><Text style={styles.primaryText}>Start another demo</Text></Pressable>}
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
            {!!timerError && <Text accessibilityLiveRegion="polite" style={styles.muted}>{timerError}</Text>}
            {timerRestoreBusy&&<Text accessibilityLiveRegion="polite" style={styles.muted}>Restoring your saved timer…</Text>}
            {!timerReady&&!timerRestoreBusy&&!timerTransitionBusy&&<Pressable accessibilityRole="button" style={styles.primary} onPress={()=>setTimerRestoreRetry(value=>value+1)}><Text style={styles.primaryText}>Retry restoring job timer</Text></Pressable>}
            {workSession?.status==='completed'&&workSession.jobId!=='demo-job'&&!completedTimerSaved&&<Text style={styles.muted}>Save this completed visit before starting another job. Load its original workday below to save or confirm the matching record.</Text>}
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
          {savedDay && savedDueSummary && <View style={styles.card}>
            <Text style={styles.cardHeading}>Due workday · {savedDay.date} · Saved records</Text>
            <Text style={styles.body}>{savedDueSummary.pendingCount} jobs due · ${(savedDueSummary.estimatedRevenueCents / 100).toFixed(2)} expected revenue · {savedDueSummary.estimatedServiceMinutes} service minutes</Text>
            <Text style={styles.muted}>{savedDueSummary.completedCount} completed · {savedDueSummary.skippedCount} skipped. This is a saved work queue, not an optimized route; travel and fuel estimates are unavailable.</Text>
            {savedDay.visits.filter(visit=>visit.status==='completed'&&!!visit.work_note?.trim()).map(visit=><Text key={visit.agreement_id+':'+visit.scheduled_date} style={styles.body}>{visit.completed_service_name??visit.agreement_id}: {visit.work_note}</Text>)}
            {savedQueueVisitIds.length>0&&connectedBusiness&&businessRoleCapabilities(connectedBusiness.role).recordFieldWork&&<View style={{marginTop:10,padding:10,backgroundColor:'#f0f5ef',borderRadius:8}}>
              <Text style={styles.cardHeading}>Shortened workday</Text>
              <Text style={styles.muted}>Report a shortened day for rain or another reason, including staffing, equipment, lightning, or customer changes. Completed work stays completed; the report does not change tomorrow's schedule.</Text>
              <Pressable accessibilityRole="button" style={styles.primary} disabled={weatherReportBusy||weatherReportSent} onPress={promptWeatherInterruption}><Text style={styles.primaryText}>{weatherReportBusy?'Saving report…':weatherReportSent?'Interruption sent for manager review':'Report a shortened workday'}</Text></Pressable>
              {!!weatherReportError&&<Text accessibilityLiveRegion="polite" style={styles.muted}>{weatherReportError}</Text>}
            </View>}
            {!!savedDay&&!!connectedBusiness&&businessRoleCapabilities(connectedBusiness.role).manageSchedule&&<View style={{marginTop:10,padding:10,backgroundColor:'#f0f5ef',borderRadius:8}}>
              <Text style={styles.cardHeading}>Manager interruption review</Text>
              <Text style={styles.muted}>Review field reports for {savedDay.date}. Opening the inbox does not update work orders.</Text>
              <Pressable accessibilityRole="button" style={styles.primary} disabled={weatherInboxBusy} onPress={()=>void refreshWeatherInbox()}><Text style={styles.primaryText}>{weatherInboxBusy?'Loading reports…':'Review interruption reports'}</Text></Pressable>
              {!!weatherInboxError&&<Text accessibilityLiveRegion="polite" style={styles.muted}>{weatherInboxError}</Text>}
              {weatherInbox?.scope===weatherScope&&weatherInbox.items.map(item=><View key={item.eventId} style={{paddingVertical:8,borderTopWidth:1,borderTopColor:'#d8e2d6'}}>
                <Text style={styles.body}>{item.reason==='other'?'Other reason':'Rain'} · {new Date(item.reportedAt).toLocaleTimeString([], {hour:'numeric',minute:'2-digit'})}</Text>
                <Text style={styles.muted}>{item.completedVisitIds.length} completed · {item.remainingVisitIds.length} unfinished · reporter {item.reporterSubject}</Text>
                <Text style={styles.muted}>Manager review is required before preparing or approving a schedule change. No schedule change or customer notice has been sent.</Text>
              </View>)}
              {weatherInbox?.scope===weatherScope&&weatherInbox.items.length===0&&<Text style={styles.muted}>No weather interruptions reported for this workday.</Text>}
            </View>}
            {savedQueueWorkload&&savedDueSummary.pendingCount>0&&<View style={styles.card}>
              <Text style={styles.cardHeading}>Remaining work settings</Text>
              <Text style={styles.muted}>Set service hours, a visit limit, or both for this remaining queue. You can reserve planned breaks below.</Text>
              <Text style={styles.label}>Service hours available</Text>
              <TextInput accessibilityLabel="Service hours available for remaining saved visits" style={styles.input} keyboardType="decimal-pad" placeholder="Optional, 0.25 to 24" placeholderTextColor="#819b8b" value={currentWorkloadLimits.hours} maxLength={6} editable={!savedQueueWorkloadEditingLocked} onChangeText={value=>changeSavedQueueWorkloadLimit('hours',value)}/>
              <Text style={styles.label}>Remaining visit limit</Text>
              <TextInput accessibilityLabel="Maximum remaining saved visits" style={styles.input} keyboardType="number-pad" placeholder="Optional, 1 to 200" placeholderTextColor="#819b8b" value={currentWorkloadLimits.maxJobs} maxLength={3} editable={!savedQueueWorkloadEditingLocked} onChangeText={value=>changeSavedQueueWorkloadLimit('maxJobs',value)}/>
              <Text style={styles.label}>Planned work start (optional)</Text>
              <TextInput accessibilityLabel="Planned start of remaining work" style={styles.input} placeholder="HH:MM, for example 08:00" placeholderTextColor="#819b8b" value={currentWorkloadLimits.workdayStart??''} maxLength={5} autoCapitalize="none" autoCorrect={false} editable={!savedQueueWorkloadEditingLocked} onChangeText={value=>changeSavedQueueWorkloadLimit('workdayStart',value)}/>
              <Text style={styles.label}>Planned work finish (optional)</Text>
              <TextInput accessibilityLabel="Planned finish of remaining work" style={styles.input} placeholder="HH:MM, for example 17:00" placeholderTextColor="#819b8b" value={currentWorkloadLimits.workdayFinish??''} maxLength={5} autoCapitalize="none" autoCorrect={false} editable={!savedQueueWorkloadEditingLocked} onChangeText={value=>changeSavedQueueWorkloadLimit('workdayFinish',value)}/>
              <Text style={styles.muted}>Use one local 24-hour clock for this workday. Enter both times; finish must be later on the same day and may be 24:00. Leave both blank for checks across 00:00–24:00. Service hours above remain a separate service-time budget.</Text>
              <Text style={styles.label}>Planned breaks (optional)</Text>
              <TextInput accessibilityLabel="Planned breaks, one start-finish pair per line" style={[styles.input,{minHeight:116,textAlignVertical:'top'}]} placeholder={'HH:MM-HH:MM, one per line\nFor example: 10:00-10:15\n12:00-12:30'} placeholderTextColor="#819b8b" value={currentWorkloadLimits.breaks??''} maxLength={128} multiline autoCapitalize="none" autoCorrect={false} editable={!savedQueueWorkloadEditingLocked} onChangeText={value=>changeSavedQueueWorkloadLimit('breaks',value)}/>
              <Text style={styles.muted}>Enter up to eight start-finish pairs on separate lines, within the work window if set. Leave blank for no planned breaks. Checks keep every service uninterrupted and flag fixed appointments that overlap any break. Travel and any other breaks still need to be allowed for.</Text>
              <Text accessibilityLiveRegion="polite" style={styles.body}>{describeSavedQueueWorkload(savedQueueWorkload)}</Text>
              <Text style={styles.muted}>All {savedQueueWorkload.visitCount} remaining visits stay visible. Limits do not skip, defer or reorder them. These totals count service time only. Appointment checks separately account for your planned break; these totals exclude travel, breaks and fuel.</Text>
              {(!currentWorkloadState||currentWorkloadState.status==='loading')&&<Text accessibilityLiveRegion="polite" style={styles.muted}>Restoring saved work settings…</Text>}
              {!!currentWorkloadState?.error&&<Text accessibilityLiveRegion="polite" style={styles.muted}>{currentWorkloadState.error}</Text>}
              {currentWorkloadState?.status==='error'&&<>
                <Pressable accessibilityRole="button" style={styles.primary} disabled={savedQueueWorkloadOperationLocked} onPress={retrySavedQueueWorkloadLimits}><Text style={styles.primaryText}>Retry restoring work settings</Text></Pressable>
                <Pressable accessibilityRole="button" style={styles.primary} disabled={savedQueueWorkloadOperationLocked} onPress={replaceSavedQueueWorkloadLimits}><Text style={styles.primaryText}>Enter replacement settings</Text></Pressable>
              </>}
              {(currentWorkloadState?.status==='ready'||currentWorkloadState?.status==='saving')&&<Pressable accessibilityRole="button" accessibilityState={{disabled:savedQueueWorkloadEditingLocked||!savedWorkloadDirty||!savedQueueSettingsValid}} style={styles.primary} disabled={savedQueueWorkloadEditingLocked||!savedWorkloadDirty||!savedQueueSettingsValid} onPress={()=>void saveSavedQueueWorkloadLimits()}><Text style={styles.primaryText}>{currentWorkloadState.status==='saving'?'Saving work settings…':savedWorkloadDirty?'Save work settings':'Work settings saved on this device'}</Text></Pressable>}
              {currentWorkloadState?.status==='ready'&&savedWorkloadDirty&&<Text style={styles.muted}>Save valid settings before approving this work queue. Unsaved edits do not replace the stored settings.</Text>}
              <Text style={styles.muted}>Saved settings restore on this device for the same operator, business and date. They do not sync across devices. After completing work, update and save the budget, work window and any remaining break for the remaining visits.</Text>
            </View>}
            {savedQueueAppointments&&savedDueSummary.pendingCount>0&&<View style={styles.card}>
              <Text style={styles.cardHeading}>Appointment checks</Text>
              <Text style={styles.muted}>Optionally enter manual travel estimates from a starting point you choose to the first stop and between adjacent stops. The starting point is supplied by you and is not stored. No location lookup or road routing is used; estimates affect these timing checks only and are not arrival predictions.</Text>
              {savedQueueTravelValid&&savedQueueTravelEstimates.length>0&&<Text style={styles.body}>Current order: {savedQueueTravelEstimates.length} estimated {savedQueueTravelEstimates.length===1?'leg':'legs'} · {savedQueueTravelEstimates.reduce((total,estimate)=>total+estimate.minutes,0)} travel minutes</Text>}
              {!savedQueueTravelValid&&<Text accessibilityLiveRegion="polite" style={styles.muted}>Enter a whole number from 0 to 1440 minutes for each estimate, or clear the field.</Text>}
              {!!savedQueueTravelError&&<Text accessibilityLiveRegion="polite" style={styles.muted}>{savedQueueTravelError}</Text>}
              {savedQueueTravelDirty
                ?<Pressable accessibilityRole="button" accessibilityState={{disabled:savedQueueEditingLocked||!savedQueueOrderReady||!savedQueueTravelValid}} style={styles.primary} disabled={savedQueueEditingLocked||!savedQueueOrderReady||!savedQueueTravelValid} onPress={saveSavedQueueTravelEstimates}><Text style={styles.primaryText}>{savedQueueOrderSaveBusy?'Saving travel estimates…':'Save travel estimates on this device'}</Text></Pressable>
              :savedQueueTravelEstimates.length>0&&<Text style={styles.muted}>Travel estimates are saved on this device for this work order. Your chosen starting point is not saved.</Text>}
              <Text accessibilityLiveRegion="polite" style={styles.body}>{!savedQueueOrderReady?'Restore the work order before checking appointment timing.':!savedAppointmentCheckReady?'Restore work settings before checking appointment timing.':describeSavedQueueAppointments(savedQueueAppointments)}</Text>
              {savedAppointmentCheckReady&&<Text style={styles.muted}>{describeAppointmentCheckAssumptions(savedQueueAppointments)}</Text>}
              {savedAppointmentCheckReady&&savedWorkloadDirty&&<Text style={styles.muted}>This preview uses your unsaved work settings. Save them before approving.</Text>}
              {savedAppointmentCheckReady&&savedQueueTravelDirty&&<Text style={styles.muted}>This preview uses unsaved travel estimates. Save them on this device before approving.</Text>}
              {savedAppointmentCheckReady&&savedQueueAppointments.status==='conflicts'&&<Text style={styles.muted}>Review each timing warning below. You can change the order and check again. Approving with warnings records your review; it does not resolve the conflicts or change an appointment.</Text>}
            </View>}
            {savedDueSummary.pendingCount>0&&<View style={styles.card}>
              <Text style={styles.cardHeading}>Road routing readiness</Text>
              <Text style={styles.muted}>This panel checks routing readiness. Manual estimates remain available; coordinates are sent only after a separate, explicit preview confirmation.</Text>
              {!routingSettings&&<Text style={styles.body}>Routing remains unavailable until public policy pages, current provider pricing, provider credentials, and business controls are ready.</Text>}
              {!!routingSettings&&<Text accessibilityLiveRegion="polite" style={styles.body}>
                {routingSettings.enabled?'Business routing is enabled.':routingSettings.businessEnabled?'Business routing is saved, but provider or policy checks are not ready.':routingSettings.available?'Provider and policy checks are ready; business routing is off.':'Provider or policy checks are not ready. Manual travel estimates remain active.'}
              </Text>}
              {!!routingSettings&&routingSettings.noticeVersion&&routingSettings.termsUrl&&routingSettings.privacyUrl&&<>
                <Text style={styles.muted}>{routingSettings.notice}</Text>
                <View style={{flexDirection:'row',gap:8,flexWrap:'wrap'}}>
                  <Pressable accessibilityRole="button" style={[styles.primary,{padding:11}]} disabled={routingSettingsBusy} onPress={()=>void openRoutingPolicy(routingSettings.termsUrl)}><Text style={styles.primaryText}>Review Terms</Text></Pressable>
                  <Pressable accessibilityRole="button" style={[styles.primary,{padding:11}]} disabled={routingSettingsBusy} onPress={()=>void openRoutingPolicy(routingSettings.privacyUrl)}><Text style={styles.primaryText}>Review Privacy</Text></Pressable>
                </View>
                {routingSettings.noticeAcknowledged
                  ?<><Text style={styles.muted}>This operator has acknowledged the current location notice.</Text><Pressable accessibilityRole="button" style={[styles.primary,{backgroundColor:'#f0f5ef'}]} disabled={routingSettingsBusy} onPress={()=>void updateRoutingSettings('withdraw')}><Text style={styles.primaryText}>Withdraw my routing acknowledgment</Text></Pressable></>
                  :<Pressable accessibilityRole="button" style={styles.primary} disabled={routingSettingsBusy} onPress={()=>void updateRoutingSettings('acknowledge')}><Text style={styles.primaryText}>Acknowledge the current location notice</Text></Pressable>}
              </>}
              {!!routingSettings&&routingSettings.available&&!routingSettings.businessEnabled&&routingSettings.noticeAcknowledged&&<Pressable accessibilityRole="button" style={styles.primary} disabled={routingSettingsBusy} onPress={()=>void updateRoutingSettings('enable')}><Text style={styles.primaryText}>Enable for this business · owner/admin</Text></Pressable>}
              {!!routingSettings&&routingSettings.businessEnabled&&<Pressable accessibilityRole="button" style={[styles.primary,{backgroundColor:'#f0f5ef'}]} disabled={routingSettingsBusy} onPress={()=>void updateRoutingSettings('disable')}><Text style={styles.primaryText}>Disable routing for this business · owner/admin</Text></Pressable>}
              <Pressable accessibilityRole="button" style={[styles.primary,{backgroundColor:'#f0f5ef'}]} disabled={routingSettingsBusy||!connectedBusiness} onPress={()=>void loadRoutingSettings()}><Text style={styles.primaryText}>{routingSettingsBusy?'Checking routing settings…':routingSettings?'Refresh routing readiness':'Check routing readiness'}</Text></Pressable>
              {!!routingSettingsError&&<Text accessibilityLiveRegion="polite" style={styles.muted}>{routingSettingsError}</Text>}
              <Text style={styles.muted}>Business routing controls and this operator’s current notice acknowledgment are checked again before each request. A separate, explicit confirmation sends only saved stop coordinates to Google. Enabling or disabling the business setting makes no provider request.</Text>
              <Text style={styles.cardHeading}>Temporary truck assignment</Text>
              <Text style={styles.muted}>Assign every due stop to one of three trucks. Assignments follow the visible queue order and stay in memory only for this session. Each preview uses an explicit request and the monthly server budget gate.</Text>
              {savedQueueVisits.map((visit,index)=><View key={'truck-'+visit.id} style={{paddingVertical:8,borderBottomWidth:1,borderBottomColor:'#e3e9e1'}}>
                <Text style={styles.body}>{index+1}. {visit.customer} · {visit.service}</Text>
                <View style={{flexDirection:'row',gap:8,flexWrap:'wrap',marginTop:6}}>
                  {(['truck-1','truck-2','truck-3'] as PreviewTruck[]).map((truck,truckIndex)=><Pressable key={truck} accessibilityRole="button" accessibilityState={{selected:roadTruckAssignments[visit.id]===truck}} style={[styles.primary,{padding:9,backgroundColor:roadTruckAssignments[visit.id]===truck?'#d5f48b':'#f0f5ef'}]} onPress={()=>{roadPreviewRequest.current++;setRoadTruckAssignments(previous=>({...previous,[visit.id]:truck}));setRoadPreview(null);}}><Text style={styles.primaryText}>Truck {truckIndex+1}</Text></Pressable>)}
                </View>
              </View>)}
              {truckPreviewPlan.status==='missing_assignment'&&<Text style={styles.muted}>Assign all {savedQueueVisits.length} due stops before requesting a preview.</Text>}
              {truckPreviewPlan.status==='missing_coordinates'&&<Text style={styles.muted}>Saved coordinates are missing or invalid for {truckPreviewPlan.visitIds.length} stop(s); previews are blocked.</Text>}
              {truckPreviewPlan.status==='too_many_points'&&<Text style={styles.muted}>Truck {truckPreviewPlan.truck==='truck-1'?1:truckPreviewPlan.truck==='truck-2'?2:3} has {truckPreviewPlan.count} stops; the maximum is 25.</Text>}
              {truckPreviewPlan.status==='ready'&&truckPreviewPlan.routes.map(route=><View key={route.truck} style={{paddingTop:8}}>
                <Text style={styles.body}>Truck {route.truck==='truck-1'?1:route.truck==='truck-2'?2:3}: {route.stops.length} stop(s) · {route.elementCount} matrix elements</Text>
                {route.stops.length===1&&<Text style={styles.muted}>One stop assigned; there are no between-stop legs to calculate.</Text>}
                {route.stops.length>=2&&<Pressable accessibilityRole="button" style={styles.primary} disabled={roadPreviewBusy||!routingSettings?.enabled||!routingSettings.noticeAcknowledged} onPress={()=>requestRoadPreview(route)}><Text style={styles.primaryText}>{roadPreviewBusy?'Requesting preview…':`Review and request Truck ${route.truck==='truck-1'?1:route.truck==='truck-2'?2:3} drive times`}</Text></Pressable>}
              </View>)}
              {roadPreview&&roadPreview.scope===truckPreviewScope&&<View style={{padding:10,marginTop:8,backgroundColor:'#f0f5ef',borderRadius:8}}>
                <Text style={styles.body}>Truck {roadPreview.truck==='truck-1'?1:roadPreview.truck==='truck-2'?2:3} · current chosen order</Text>
                {roadPreview.legs.map((leg,index)=><Text key={index} style={styles.muted}>Stop {leg.from+1} → Stop {leg.to+1}: {leg.minutes===null?'unavailable':`${leg.minutes} min`}</Text>)}
                <Text style={styles.muted}>Drive-time estimates only; no depot legs, route optimization, or arrival times. Not saved. {roadPreview.attribution}</Text>
              </View>}
            </View>}
            <Pressable accessibilityRole="button" accessibilityState={{disabled:!savedQueueCanApprove||savedQueueApprovalChecking||savedQueueApprovalBusy}} style={styles.primary} disabled={!savedQueueCanApprove||savedQueueApprovalChecking||savedQueueApprovalBusy} onPress={requestSavedQueueApproval}><Text style={styles.primaryText}>{!savedQueueOrderReady?'Restore work order before approval':savedQueueOrderSaveBusy?'Saving work order…':savedQueueApprovalChecking?'Checking saved approval…':savedQueueApprovalBusy?'Saving approval…':savedQueueApproved?'Work queue approved on this device':'Review and approve work queue'}</Text></Pressable>
            {!!savedQueueApprovalError&&<Text accessibilityLiveRegion="polite" style={styles.muted}>{savedQueueApprovalError}</Text>}{!savedQueueApproved&&savedDueSummary.pendingCount>0&&<Text style={styles.muted}>Review the current work order before starting a saved visit. Approval is saved securely on this device and tied to this business, date, visit order, service and travel estimates, appointment times, work window, planned breaks and workload limits; changes require review again. Your chosen starting point itself is not saved.</Text>}
            {!!visitSkipNotice&&<Text accessibilityLiveRegion="polite" style={styles.body}>{visitSkipNotice}</Text>}
            {!!visitSkipError&&<Text accessibilityLiveRegion="polite" style={styles.muted}>{visitSkipError}</Text>}
            <Text style={styles.muted}>Use Move earlier or Move later to choose your work order. Changes save securely on this device and restore for this operator, business, and date. Travel estimates are linked to a specific adjacent stop pair or from your chosen starting point to the first stop; review them after reordering. Appointment times are unchanged and arrival times are not calculated.</Text>
            {savedQueueOrderLoadBusy&&<Text accessibilityLiveRegion="polite" style={styles.muted}>Restoring this device’s saved work order…</Text>}
            {!!savedQueueOrderError&&<Text accessibilityLiveRegion="polite" style={styles.muted}>{savedQueueOrderError}</Text>}
            {!savedQueueOrderReady&&!savedQueueOrderLoadBusy&&<Pressable accessibilityRole="button" style={styles.primary} disabled={savedQueueOrderSaveBusy} onPress={()=>setSavedQueueOrderReload(value=>value+1)}><Text style={styles.primaryText}>Retry restoring work order</Text></Pressable>}
            {savedQueueEditingLocked&&<Text style={styles.muted}>Finish active work or wait for order restoration and the current save before changing the order.</Text>}
            <Pressable accessibilityRole="button" accessibilityState={{disabled:savedQueueEditingLocked||!savedQueueReordered}} style={[styles.primary,{backgroundColor:'#f0f5ef'}]} disabled={savedQueueEditingLocked||!savedQueueReordered} onPress={resetSavedQueueOrder}><Text style={styles.primaryText}>Restore saved order</Text></Pressable>
            {savedQueueVisits.map((j,index)=><View key={j.id}>
              <Text style={styles.body}>{index+1}. {j.customer} · {j.service} · {j.address}</Text>
              <Text style={styles.muted}>{describeServiceTimeConstraints(j)}</Text>
              <Text style={styles.label}>{index===0?'Estimated travel from your chosen starting point to the first stop':'Estimated travel from '+savedQueueVisits[index-1].customer+' to this stop'} (minutes, optional)</Text>
              <TextInput accessibilityLabel={'Optional travel estimate from '+(index===0?'your chosen starting point':savedQueueVisits[index-1].customer)+' to '+j.customer+' in minutes'} style={styles.input} keyboardType="number-pad" placeholder="Minutes, for example 25" placeholderTextColor="#819b8b" value={savedQueueTravelDrafts[savedQueueTravelKey(index===0?null:savedQueueVisits[index-1].id,j.id)]??''} maxLength={4} editable={!savedQueueEditingLocked} onChangeText={value=>changeSavedQueueTravelEstimate(index===0?null:savedQueueVisits[index-1].id,j.id,value)}/>
              {savedAppointmentCheckReady&&(savedQueueAppointmentIssues.get(j.id)??[]).map((message,issueIndex)=><Text key={issueIndex} style={[styles.body,{color:'#a4481d'}]}>Timing warning: {message}</Text>)}
              <View style={{flexDirection:'row',flexWrap:'wrap',gap:8}}>
                <Pressable accessibilityRole="button" accessibilityLabel={'Move '+j.customer+' '+j.service+' earlier'} accessibilityState={{disabled:savedQueueEditingLocked||index===0}} style={[styles.primary,{backgroundColor:'#f0f5ef'}]} disabled={savedQueueEditingLocked||index===0} onPress={()=>changeSavedQueueOrder(j.id,'earlier')}><Text style={styles.primaryText}>Move earlier</Text></Pressable>
                <Pressable accessibilityRole="button" accessibilityLabel={'Move '+j.customer+' '+j.service+' later'} accessibilityState={{disabled:savedQueueEditingLocked||index===savedQueueVisits.length-1}} style={[styles.primary,{backgroundColor:'#f0f5ef'}]} disabled={savedQueueEditingLocked||index===savedQueueVisits.length-1} onPress={()=>changeSavedQueueOrder(j.id,'later')}><Text style={styles.primaryText}>Move later</Text></Pressable>
              </View>
              <Pressable style={styles.primary} disabled={!timerCanStart||!savedQueueOrderReady||savedQueueOrderSaveBusy||!savedQueueApproved||savedQueueApprovalChecking||savedQueueApprovalBusy} onPress={()=>timerAction('start',j.id)}><Text style={styles.primaryText}>{savedQueueApproved?'Start this service':'Approve the work queue first'}</Text></Pressable>
              <Pressable accessibilityRole="button" style={[styles.primary,{backgroundColor:'#f0f5ef'}]} disabled={timerTransitionBusy||!!visitSkipBusy||!!workSession&&workSession.status!=='completed'} onPress={()=>confirmSkipSavedVisit(j.id.slice(0,-(savedDay.date.length+1)),savedDay.date)}><Text style={styles.primaryText}>{visitSkipBusy===j.id?'Saving skip…':'Skip this visit'}</Text></Pressable>
            </View>)}
          </View>}
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
            {serviceAgreements.map(a=><View key={a.id}><Text style={styles.body}>{a.service_name} · ${(a.rate_cents/100).toFixed(2)} · {a.estimated_minutes} min</Text><Text style={styles.muted}>{a.address} · {a.frequency}{a.interval_days?' every '+a.interval_days+' days':''} · starts {a.starts_on}{a.ends_on?' · ends '+a.ends_on:''}</Text><Text style={styles.muted}>{describeServiceTimeConstraints({preferredStartMinute:a.preferred_start_minute??undefined,preferredFinishMinute:a.preferred_finish_minute??undefined,fixedStartMinute:a.fixed_start_minute??undefined})}</Text></View>)}
            {agreementsHaveMore&&<Text style={styles.muted}>Showing the first 200 recurring services. Additional services exist.</Text>}
            {!!serviceAgreements.length&&<Text style={styles.muted}>{scheduledServicePreview()}</Text>}
            {!!agreementLocationId&&<>
              <TextInput accessibilityLabel="Service name" style={styles.input} placeholder="Service name" placeholderTextColor="#819b8b" value={agreementName} onChangeText={setAgreementName} maxLength={160} editable={!agreementLoading}/>
              <TextInput accessibilityLabel="Agreed service price in USD" style={styles.input} placeholder="Price per visit (USD)" placeholderTextColor="#819b8b" keyboardType="decimal-pad" value={agreementPrice} onChangeText={setAgreementPrice} editable={!agreementLoading}/>
              <Text style={styles.label}>Estimated duration in minutes</Text>
              <TextInput accessibilityLabel="Estimated service minutes" style={styles.input} keyboardType="number-pad" value={agreementMinutes} onChangeText={setAgreementMinutes} editable={!agreementLoading}/>
              <Text style={styles.label}>Appointment times (optional)</Text>
              <Text style={styles.muted}>Use the service location’s local time in 24-hour HH:MM. Set a fixed start, a service window, or both. Leave blank for flexible timing. These times apply to every occurrence.</Text>
              <Text style={styles.label}>Earliest start</Text>
              <TextInput accessibilityLabel="Optional earliest service start" style={styles.input} placeholder="Earliest start, for example 09:00" placeholderTextColor="#819b8b" value={agreementEarliest} onChangeText={setAgreementEarliest} maxLength={5} autoCapitalize="none" autoCorrect={false} editable={!agreementLoading}/>
              <Text style={styles.label}>Latest finish</Text>
              <TextInput accessibilityLabel="Optional latest service finish" style={styles.input} placeholder="Latest finish, for example 12:00" placeholderTextColor="#819b8b" value={agreementLatest} onChangeText={setAgreementLatest} maxLength={5} autoCapitalize="none" autoCorrect={false} editable={!agreementLoading}/>
              <Text style={styles.label}>Fixed start</Text>
              <TextInput accessibilityLabel="Optional fixed appointment start" style={styles.input} placeholder="Fixed start, for example 10:30" placeholderTextColor="#819b8b" value={agreementFixed} onChangeText={setAgreementFixed} maxLength={5} autoCapitalize="none" autoCorrect={false} editable={!agreementLoading}/>
              <Text style={styles.muted}>The estimated service must finish within the same day and any saved window. Only latest finish accepts 24:00. Travel, breaks and conflicts with other visits are not checked here.</Text>
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
          <Text style={styles.muted}>Drafts save to the business when you tap Save draft changes. No invoice is issued, sent, charged, or marked paid.</Text>
          <Pressable style={styles.primary} disabled={!savedDay||!connectedBusiness||invoiceBusy} onPress={()=>void prepareInvoiceDrafts()}><Text style={styles.primaryText}>{invoiceBusy?'Loading saved drafts…':'Load or prepare drafts from completed visits'}</Text></Pressable>
          {!!savedDay && unbillableCompletedServiceCount(savedDay)>0 && <Text style={styles.muted}>{unbillableCompletedServiceCount(savedDay)} older completed visit(s) need manual billing review because no historical price snapshot exists.</Text>}
          {!!invoiceError && <Text style={styles.muted}>{invoiceError}</Text>}
          {invoiceDrafts.map(d=><View key={d.id} style={styles.card}>
            <Text style={styles.cardHeading}>{d.lines[0]?.description||'Invoice'} · {d.status}</Text>
            <Text style={styles.muted}>Customer: {d.customerName??d.customerId}</Text>
            <Text style={styles.muted}>Service date: {d.issuedOn} · Due: {d.dueOn}</Text>
            <Text style={styles.label}>Set due date from service date</Text>
            <View style={{flexDirection:'row',gap:8,flexWrap:'wrap'}}>{[0,7,14,30].map(days=><Pressable key={days} accessibilityRole="button" accessibilityLabel={days===0?'Due on service date':`Due ${days} days after service date`} style={[styles.primary,{padding:11}]} onPress={()=>editDraftDueDays(d.id,days)}><Text style={styles.primaryText}>{days===0?'Service date':`+${days} days`}</Text></Pressable>)}</View>
            <Text style={styles.label}>Service price (USD)</Text>
            <TextInput style={styles.input} keyboardType="decimal-pad" value={(d.lines[0].unitPriceCents/100).toFixed(2)} onChangeText={v=>editDraftPrice(d.id,v)}/>
            <Text style={styles.label}>Business-confirmed tax rate (%)</Text>
            <TextInput accessibilityLabel="Business-confirmed tax rate percent" style={styles.input} keyboardType="decimal-pad" value={(d.taxBasisPoints/100).toFixed(2)} onChangeText={v=>editDraftTaxRate(d.id,v)}/>
            <Text style={styles.body}>Draft total: ${(invoiceTotals(d.lines,d.taxBasisPoints).totalCents/100).toFixed(2)}</Text>
            <Pressable accessibilityRole="button" style={styles.primary} disabled={invoiceSavingId===d.id||invoiceRevision(d)===invoiceDraftSnapshot.current.get(d.id)} onPress={()=>void saveInvoiceDraft(d.id)}><Text style={styles.primaryText}>{invoiceSavingId===d.id?'Saving draft…':'Save draft changes'}</Text></Pressable>
            <Text style={styles.muted}>Tax starts at 0.00%. Enter a rate confirmed for this business; GreenCollar does not determine taxability. Review drafts are not issued, sent, charged, or marked paid.</Text>
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
          {planned && workloadPreview && <View style={styles.card}>
            <Text style={styles.cardHeading}>Workload preview</Text>
            {workloadPreview.status==='invalid_hours'?<Text accessibilityLiveRegion="polite" style={styles.muted}>Enter available hours from 0.25 to 24, using up to two decimal places.</Text>
              :workloadPreview.status==='invalid_job_cap'?<Text accessibilityLiveRegion="polite" style={styles.muted}>Enter a whole job cap from 1 to 200.</Text>
              :workloadPreview.status==='invalid_jobs'?<Text accessibilityLiveRegion="polite" style={styles.muted}>The sample job list contains an invalid ID or service duration.</Text>
              :<>
                <Text style={styles.body}>{workloadPreview.selectedJobCount} example jobs · {workloadPreview.selectedMinutes} estimated service minutes</Text>
                <Text style={styles.body}>Available: {workloadPreview.availableMinutes} service minutes · {workloadPreview.jobsOutsideCap} sample jobs outside the job cap</Text>
                {workloadPreview.overtimeMinutes>0
                  ?<Text accessibilityLiveRegion="polite" style={styles.muted}>Service estimates exceed the available work time by {workloadPreview.overtimeMinutes} minutes.</Text>
                  :<Text style={styles.muted}>Service estimates fit within the available work time.</Text>}
                <Text style={styles.muted}>Sample workload only. Travel, breaks, fixed appointments, customer time windows, and fuel are not included; this is not a route or feasibility guarantee.</Text>
              </>}
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
