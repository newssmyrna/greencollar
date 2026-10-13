import * as SecureStore from 'expo-secure-store';
import type {WorkSession} from '../domain/work-session';

const key=(subject:string)=>'greencollar_timer_'+subject.replace(/[^a-zA-Z0-9_-]/g,'_').slice(0,80);
const validTime=(value:unknown):value is number=>Number.isSafeInteger(value)&&(value as number)>=0;
const validDate=(value:unknown):value is string=>typeof value==='string'
  &&/^\d{4}-\d{2}-\d{2}$/.test(value)
  &&!Number.isNaN(Date.parse(value))
  &&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;

export async function loadWorkSession(subject:string):Promise<WorkSession|null>{
  if(!subject)return null;
  const value=await SecureStore.getItemAsync(key(subject));
  if(!value)return null;
  try{
    const parsed=JSON.parse(value) as Partial<WorkSession>;
    if(!parsed||typeof parsed.jobId!=='string'||!parsed.jobId.trim()
      ||!['running','paused','completed'].includes(String(parsed.status))
      ||!validTime(parsed.startedAt)||!validTime(parsed.elapsedMs)
      ||(parsed.lastResumedAt!==null&&parsed.lastResumedAt!==undefined&&!validTime(parsed.lastResumedAt))
      ||(parsed.completedAt!==null&&parsed.completedAt!==undefined&&!validTime(parsed.completedAt))
      ||(parsed.lastTransitionAt!==undefined&&!validTime(parsed.lastTransitionAt))
      ||(parsed.completionSaved!==undefined&&typeof parsed.completionSaved!=='boolean'))return null;
    const status=parsed.status as WorkSession['status'];
    const startedAt=parsed.startedAt;
    const lastResumedAt=parsed.lastResumedAt??null;
    const completedAt=parsed.completedAt??null;
    const lastTransitionAt=parsed.lastTransitionAt!==undefined
      ? parsed.lastTransitionAt
      : status==='completed'&&completedAt!==null ? completedAt : lastResumedAt??startedAt;
    if(!validTime(lastTransitionAt)||lastTransitionAt<startedAt)return null;
    const businessId=typeof parsed.businessId==='string'&&parsed.businessId.trim()?parsed.businessId:null;
    const serviceDate=validDate(parsed.serviceDate)?parsed.serviceDate:null;
    if((businessId===null)!==(serviceDate===null))return null;
    if(status==='running'&&(lastResumedAt===null||lastResumedAt<startedAt||lastTransitionAt<lastResumedAt||completedAt!==null))return null;
    if(status==='paused'&&(lastResumedAt!==null||completedAt!==null))return null;
    if(status==='completed'&&(lastResumedAt!==null||completedAt===null||completedAt<startedAt||lastTransitionAt!==completedAt))return null;
    const completionSaved=parsed.completionSaved===true;
    if(completionSaved&&(status!=='completed'||businessId===null||serviceDate===null))return null;
    return {
      jobId:parsed.jobId,status,startedAt,lastResumedAt,lastTransitionAt,
      elapsedMs:parsed.elapsedMs,completedAt,businessId,serviceDate,completionSaved
    };
  }catch{return null;}
}

export async function saveWorkSession(subject:string,s:WorkSession|null):Promise<void>{
  if(!subject)return;
  if(s)await SecureStore.setItemAsync(key(subject),JSON.stringify(s));
  else await SecureStore.deleteItemAsync(key(subject));
}
