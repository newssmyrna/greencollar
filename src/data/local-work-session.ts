import * as SecureStore from 'expo-secure-store';
import type {WorkSession} from '../domain/work-session';

const key=(subject:string)=>'greencollar_timer_'+subject.replace(/[^a-zA-Z0-9_-]/g,'_').slice(0,80);
const validDate=(value:unknown):value is string=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&!Number.isNaN(Date.parse(value))&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;

export async function loadWorkSession(subject:string):Promise<WorkSession|null>{
  if(!subject)return null;
  const value=await SecureStore.getItemAsync(key(subject));
  if(!value)return null;
  try{
    const parsed=JSON.parse(value) as Partial<WorkSession>;
    if(!parsed||typeof parsed.jobId!=='string'||!['running','paused','completed'].includes(String(parsed.status))
      ||!Number.isSafeInteger(parsed.startedAt)||!Number.isSafeInteger(parsed.elapsedMs)||(parsed.elapsedMs as number)<0
      ||(parsed.lastResumedAt!==null&&parsed.lastResumedAt!==undefined&&!Number.isSafeInteger(parsed.lastResumedAt))
      ||(parsed.completedAt!==null&&parsed.completedAt!==undefined&&!Number.isSafeInteger(parsed.completedAt))
      ||(parsed.lastTransitionAt!==undefined&&!Number.isSafeInteger(parsed.lastTransitionAt)))return null;
    const status=parsed.status as WorkSession['status'];
    const lastResumedAt=parsed.lastResumedAt??null;
    const completedAt=parsed.completedAt??null;
    const lastTransitionAt=parsed.lastTransitionAt!==undefined
      ? parsed.lastTransitionAt as number
      : status==='completed'&&completedAt!==null ? completedAt : lastResumedAt??parsed.startedAt as number;
    const businessId=typeof parsed.businessId==='string'&&parsed.businessId.trim()?parsed.businessId:null;
    const serviceDate=validDate(parsed.serviceDate)?parsed.serviceDate:null;
    if((businessId===null)!==(serviceDate===null)||lastTransitionAt<(parsed.startedAt as number))return null;
    if(status==='running'&&(lastResumedAt===null||lastResumedAt<(parsed.startedAt as number)||lastTransitionAt<lastResumedAt||completedAt!==null))return null;
    if(status==='paused'&&(lastResumedAt!==null||completedAt!==null))return null;
    if(status==='completed'&&(lastResumedAt!==null||completedAt===null||completedAt<(parsed.startedAt as number)||lastTransitionAt!==completedAt))return null;
    return {
      jobId:parsed.jobId,
      status,
      startedAt:parsed.startedAt as number,
      lastResumedAt,
      lastTransitionAt,
      elapsedMs:parsed.elapsedMs as number,
      completedAt,
      businessId,
      serviceDate,
      completionSaved:parsed.completionSaved===true
    };
  }catch{return null;}
}

export async function saveWorkSession(subject:string,s:WorkSession|null):Promise<void>{
  if(!subject)return;
  if(s)await SecureStore.setItemAsync(key(subject),JSON.stringify(s));
  else await SecureStore.deleteItemAsync(key(subject));
}
