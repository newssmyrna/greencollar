import type {WorkSession} from '../domain/work-session';
export type TimerSecureStorage={
 getItemAsync(key:string):Promise<string|null>;
 setItemAsync(key:string,value:string):Promise<void>;
 deleteItemAsync(key:string):Promise<void>;
};
function keyFor(subject:string):string{
 // Preserve existing standard Clerk keys without lossy replacement/truncation.
 if(!/^[a-zA-Z0-9_-]{1,80}$/.test(subject))throw new Error('Invalid operator storage context');
 return 'greencollar_timer_'+subject;
}
function validTime(value:unknown):value is number{
 return typeof value==='number'&&Number.isSafeInteger(value)&&value>=0;
}
/** Missing is distinct from corrupt: invalid records throw and remain untouched. */
export function parseWorkSessionRecord(value:string|null,now:number):WorkSession|null{
 if(!validTime(now))throw new Error('Device clock is invalid');
 if(value===null)return null;
 let parsed:unknown;
 try{parsed=JSON.parse(value);}catch{throw new Error('Saved timer is unreadable; it has not been replaced');}
 if(!parsed||typeof parsed!=='object')throw new Error('Saved timer is invalid; it has not been replaced');
 const s=parsed as Partial<WorkSession>;
 const invalid=()=>new Error('Saved timer state or timestamps are invalid; check the device clock before retrying');
 if(typeof s.jobId!=='string'||!s.jobId.trim()||!validTime(s.startedAt)||s.startedAt>now||!validTime(s.elapsedMs)
   ||(s.note!==undefined&&(typeof s.note!=='string'||s.note.length>1000)))throw invalid();
 if(s.status==='running'){
  if(!validTime(s.lastResumedAt)||s.lastResumedAt<s.startedAt||s.lastResumedAt>now||s.completedAt!==null||s.elapsedMs>s.lastResumedAt-s.startedAt)throw invalid();
 }else if(s.status==='paused'){
  if(s.lastResumedAt!==null||s.completedAt!==null||s.elapsedMs>now-s.startedAt)throw invalid();
 }else if(s.status==='completed'){
  if(s.lastResumedAt!==null||!validTime(s.completedAt)||s.completedAt<s.startedAt||s.completedAt>now||s.elapsedMs>s.completedAt-s.startedAt)throw invalid();
 }else throw invalid();
 return {jobId:s.jobId,status:s.status,startedAt:s.startedAt,lastResumedAt:s.lastResumedAt??null,elapsedMs:s.elapsedMs,completedAt:s.completedAt??null,...(s.note===undefined?{}:{note:s.note})};
}
/** Per-operator FIFO writes. Loads await the latest pending write.
 * Snapshot serialization happens at invocation; one failure does not poison later writes.
 */
export function createLocalWorkSessionStore(storage:TimerSecureStorage,clock:()=>number=Date.now){
 const pending=new Map<string,Promise<void>>();
 return {
  async loadWorkSession(subject:string):Promise<WorkSession|null>{
   const key=keyFor(subject);
   let write:Promise<void>|undefined;
   while((write=pending.get(key)))await write;
   return parseWorkSessionRecord(await storage.getItemAsync(key),clock());
  },
  async saveWorkSession(subject:string,session:WorkSession|null):Promise<void>{
   const key=keyFor(subject);
   const value=session?JSON.stringify(session):null;
   if(value!==null)parseWorkSessionRecord(value,clock());
   const previous=pending.get(key)??Promise.resolve();
   const task=previous.catch(()=>{}).then(()=>value===null?storage.deleteItemAsync(key):storage.setItemAsync(key,value));
   pending.set(key,task);
   const clear=()=>{if(pending.get(key)===task)pending.delete(key);};
   void task.then(clear,clear);
   await task;
  }
 };
}
