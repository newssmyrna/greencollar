import type {WorkSession} from './work-session';
/** Save before exposing a transition; block repeated taps in this app instance. */
export function createDurableTimerTransition(){
 let busy=false;
 return {
  get busy(){return busy;},
  async run(next:WorkSession,save:(snapshot:WorkSession)=>Promise<void>,isCurrent:()=>boolean,apply:(snapshot:WorkSession)=>void):Promise<boolean>{
   if(busy)return false;
   busy=true;
   const snapshot={...next};
   try{
    await save(snapshot);
    if(!isCurrent())return false;
    apply(snapshot);
    return true;
   }finally{busy=false;}
  }
 };
}
