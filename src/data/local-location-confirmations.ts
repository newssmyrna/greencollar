import * as SecureStore from 'expo-secure-store';
import {appendLocationConfirmation,type LocationConfirmation} from '../domain/location-assist';

const safeSubject=(subject:string)=>subject.replace(/[^a-zA-Z0-9_-]/g,'_').slice(0,80);
const indexKey=(subject:string)=>'greencollar_location_index_'+safeSubject(subject);
const eventKey=(subject:string,id:string)=>'greencollar_location_event_'+safeSubject(subject)+'_'+id;
const validId=(value:unknown):value is string=>typeof value==='string'&&/^[a-zA-Z0-9_-]{1,40}$/.test(value);

function isConfirmation(value:unknown):value is LocationConfirmation {
  if(!value||typeof value!=='object')return false;
  const event=value as Partial<LocationConfirmation>;
  return typeof event.jobId==='string'&&typeof event.operatorId==='string'
    &&(event.kind==='arrival'||event.kind==='departure')
    &&Number.isSafeInteger(event.confirmedAt)&&Number(event.confirmedAt)>=0
    &&(event.source==='manual'||event.source==='gps_suggestion')
    &&['within_radius','outside_radius','uncertain','unavailable','manual'].includes(String(event.proximity))
    &&(event.manualReason===undefined||(typeof event.manualReason==='string'&&event.manualReason.length<=280));
}

async function readIds(subject:string):Promise<string[]> {
  const value=await SecureStore.getItemAsync(indexKey(subject));
  if(!value)return [];
  try{
    const parsed:unknown=JSON.parse(value);
    return Array.isArray(parsed)?parsed.filter(validId).slice(-20):[];
  }catch{return [];}
}

export async function loadLocationConfirmations(subject:string):Promise<LocationConfirmation[]> {
  if(!subject)return [];
  const ids=await readIds(subject);
  const events=await Promise.all(ids.map(async id=>{
    const value=await SecureStore.getItemAsync(eventKey(subject,id));
    if(!value)return null;
    try{const parsed:unknown=JSON.parse(value);return isConfirmation(parsed)?parsed:null;}catch{return null;}
  }));
  return events.filter((event):event is LocationConfirmation=>event!==null);
}

/** Device-local history only; exact coordinates are never included in these records. */
export async function saveLocationConfirmation(subject:string,event:LocationConfirmation):Promise<LocationConfirmation[]> {
  if(!subject)throw new Error('Signed-in operator is required');
  if(!isConfirmation(event))throw new Error('Invalid location confirmation');
  const ids=await readIds(subject);
  if(ids.length>=20)throw new Error('Local confirmation limit reached; server sync is required for more history');
  const history=await loadLocationConfirmations(subject);
  const next=appendLocationConfirmation(history,event,20);
  const id=Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,10);
  await SecureStore.setItemAsync(eventKey(subject,id),JSON.stringify(event));
  ids.push(id);
  await SecureStore.setItemAsync(indexKey(subject),JSON.stringify(ids));
  return next;
}
