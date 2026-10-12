import * as SecureStore from 'expo-secure-store';
import {appendLocationConfirmation,type LocationConfirmation} from '../domain/location-assist';
import {oldestSyncedConfirmationId} from '../domain/location-outbox';

export type StoredLocationConfirmation = LocationConfirmation & {
  eventId: string;
  businessId?: string;
  agreementId?: string;
  date?: string;
  syncStatus: 'pending'|'synced'|'local_only';
};

const safeSubject=(subject:string)=>subject.replace(/[^a-zA-Z0-9_-]/g,'_').slice(0,80);
const indexKey=(subject:string)=>'greencollar_location_index_'+safeSubject(subject);
const eventKey=(subject:string,id:string)=>'greencollar_location_event_'+safeSubject(subject)+'_'+id;
const validId=(value:unknown):value is string=>typeof value==='string'&&/^[a-zA-Z0-9_-]{1,80}$/.test(value);
const validDate=(value:unknown):value is string=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)
  &&!Number.isNaN(Date.parse(value))&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;

function isStoredConfirmation(value:unknown):value is StoredLocationConfirmation {
  if(!value||typeof value!=='object')return false;
  const event=value as Partial<StoredLocationConfirmation>;
  const base=typeof event.jobId==='string'&&typeof event.operatorId==='string'
    &&(event.kind==='arrival'||event.kind==='departure')
    &&Number.isSafeInteger(event.confirmedAt)&&Number(event.confirmedAt)>=0
    &&(event.source==='manual'||event.source==='gps_suggestion')
    &&['within_radius','outside_radius','uncertain','unavailable','manual'].includes(String(event.proximity))
    &&(event.manualReason===undefined||(typeof event.manualReason==='string'&&event.manualReason.length<=280));
  if(!base)return false;
  // Preserve events written by earlier app builds, but keep them out of the retry queue.
  if(!event.eventId)return event.syncStatus===undefined;
  return validId(event.eventId)
    &&(event.syncStatus==='pending'||event.syncStatus==='synced'||event.syncStatus==='local_only')
    &&(event.businessId===undefined||typeof event.businessId==='string')
    &&(event.agreementId===undefined||typeof event.agreementId==='string')
    &&(event.date===undefined||validDate(event.date));
}

async function readIds(subject:string):Promise<string[]> {
  const value=await SecureStore.getItemAsync(indexKey(subject));
  if(!value)return [];
  try{
    const parsed:unknown=JSON.parse(value);
    return Array.isArray(parsed)?parsed.filter(validId).slice(-20):[];
  }catch{return [];}
}

export async function loadLocationConfirmations(subject:string):Promise<StoredLocationConfirmation[]> {
  if(!subject)return [];
  const ids=await readIds(subject);
  const events=await Promise.all(ids.map(async id=>{
    const value=await SecureStore.getItemAsync(eventKey(subject,id));
    if(!value)return null;
    try{
      const parsed:unknown=JSON.parse(value);
      if(!isStoredConfirmation(parsed))return null;
      if(!parsed.eventId)return {...parsed,eventId:id,syncStatus:'local_only' as const};
      if(parsed.eventId!==id)return null;
      return parsed;
    }catch{return null;}
  }));
  return events.filter((event):event is StoredLocationConfirmation=>event!==null);
}

/** Device-local history only; exact coordinates are never included in these records. */
export async function saveLocationConfirmation(
  subject:string,
  details:{businessId:string;agreementId:string;date:string},
  event:LocationConfirmation
):Promise<StoredLocationConfirmation[]> {
  if(!subject)throw new Error('Signed-in operator is required');
  if(!details.businessId||!details.agreementId||!validDate(details.date))throw new Error('A saved business, agreement, and service date are required');
  if(!isStoredConfirmation(event))throw new Error('Invalid location confirmation');
  let ids=await readIds(subject);
  const history=await loadLocationConfirmations(subject);
  const knownIds=new Set(history.map(item=>item.eventId));
  ids=[...new Set(ids.filter(id=>knownIds.has(id)))];
  const evictedId=ids.length>=20?oldestSyncedConfirmationId(history):undefined;
  if(ids.length>=20&&!evictedId)throw new Error('Local confirmation limit reached; sync pending events before recording more history');
  const retained=evictedId?history.filter(item=>item.eventId!==evictedId):history;
  appendLocationConfirmation(retained,event,20);
  const eventId=Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,14);
  const stored:StoredLocationConfirmation={...event,eventId,...details,syncStatus:'pending'};
  const newIds=[...ids.filter(id=>id!==evictedId),eventId];
  await SecureStore.setItemAsync(eventKey(subject,eventId),JSON.stringify(stored));
  try{
    await SecureStore.setItemAsync(indexKey(subject),JSON.stringify(newIds));
  }catch(error){
    await SecureStore.deleteItemAsync(eventKey(subject,eventId)).catch(()=>undefined);
    throw error;
  }
  if(evictedId)await SecureStore.deleteItemAsync(eventKey(subject,evictedId)).catch(()=>undefined);
  return [...retained,stored];
}

export async function markLocationConfirmationSynced(subject:string,eventId:string):Promise<StoredLocationConfirmation[]> {
  if(!subject||!validId(eventId))throw new Error('Invalid local confirmation ID');
  const key=eventKey(subject,eventId);
  const value=await SecureStore.getItemAsync(key);
  if(!value)throw new Error('Local confirmation was not found');
  const parsed:unknown=JSON.parse(value);
  if(!isStoredConfirmation(parsed)||parsed.eventId!==eventId)throw new Error('Invalid local confirmation');
  await SecureStore.setItemAsync(key,JSON.stringify({...parsed,syncStatus:'synced'}));
  return loadLocationConfirmations(subject);
}

export async function pendingLocationConfirmations(subject:string,businessId?:string):Promise<StoredLocationConfirmation[]> {
  const events=await loadLocationConfirmations(subject);
  return events.filter(event=>event.syncStatus==='pending'&&(!businessId||event.businessId===businessId));
}
