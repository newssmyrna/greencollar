import * as SecureStore from 'expo-secure-store';
import type {WorkSession} from '../domain/work-session';
const key=(subject:string)=>'greencollar_timer_'+subject.replace(/[^a-zA-Z0-9_-]/g,'_').slice(0,80);
export async function loadWorkSession(subject:string):Promise<WorkSession|null>{
  if(!subject)return null;
  const value=await SecureStore.getItemAsync(key(subject));
  if(!value)return null;
  try{
    const s=JSON.parse(value) as WorkSession;
    if(!s || typeof s.jobId!=='string'||!['running','paused','completed'].includes(s.status)
      ||!Number.isSafeInteger(s.startedAt)||!Number.isSafeInteger(s.elapsedMs)
      ||(s.lastResumedAt!==null&&!Number.isSafeInteger(s.lastResumedAt))
      ||(s.completedAt!==null&&!Number.isSafeInteger(s.completedAt)))return null;
    return s;
  }catch{return null;}
}
export async function saveWorkSession(subject:string,s:WorkSession|null):Promise<void>{
  if(!subject)return;
  if(s)await SecureStore.setItemAsync(key(subject),JSON.stringify(s));
  else await SecureStore.deleteItemAsync(key(subject));
}
