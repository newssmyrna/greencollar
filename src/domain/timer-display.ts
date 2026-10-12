import {getElapsedMinutes,type WorkSession} from './work-session';
export type TimerDisplay={minutes:number|null;error:string|null};
/** Display is derived from recorded timestamps; it never changes timer or billing data. */
export function timerDisplay(session:WorkSession|null,now:number):TimerDisplay{
 if(!session)return {minutes:0,error:null};
 try{
  const at=session.status==='running'?now:session.completedAt??session.startedAt;
  const minutes=getElapsedMinutes(session,at);
  if(!Number.isSafeInteger(minutes)||minutes<0)throw new Error('Invalid elapsed value');
  return {minutes,error:null};
 }catch{
  return {minutes:null,error:'The device clock or timer data is inconsistent. Check the clock before changing the timer.'};
 }
}
export type TimerTickScheduler={every(callback:()=>void,milliseconds:number):()=>void};
/** UI-only foreground ticker, with explicit cleanup and no background polling. */
export function createForegroundTimerTicker(update:(now:number)=>void,clock:()=>number,scheduler:TimerTickScheduler){
 let cancel:(()=>void)|null=null,active=false,disposed=false;
 return {
  setActive(next:boolean){
   if(disposed||next===active)return;
   active=next;
   if(cancel){cancel();cancel=null;}
   if(active){
    update(clock());
    cancel=scheduler.every(()=>{if(active&&!disposed)update(clock());},1000);
   }
  },
  dispose(){disposed=true;active=false;if(cancel){cancel();cancel=null;}}
 };
}
