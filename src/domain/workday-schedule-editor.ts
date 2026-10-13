import type { ScheduledTask, WorkdaySchedule } from '../data/workday-schedules';

export type LunchBlockDraft={start:string;end:string};

export type SingleRouteScheduleDraft={
  routeId:string;
  truckId:string;
  start:string;
  end:string;
  workerSubjects:string[];
  lunchBlocks:Record<string,LunchBlockDraft[]>;
  agreementIds:string[];
  tasksByAgreement:Record<string,ScheduledTask[]>;
};

function validMinute(value:number):boolean{
  return Number.isInteger(value)&&value>=0&&value<1440;
}

function clock(value:number):string{
  return String(Math.floor(value/60)).padStart(2,'0')+':'+String(value%60).padStart(2,'0');
}

/** Hydrates only the complete single-route shape supported by the current editor. */
export function hydrateSingleRouteDraft(
  schedule:WorkdaySchedule,
  businessId:string,
  workDate:string,
  activeAgreementIds:readonly string[]
):SingleRouteScheduleDraft{
  if(schedule.businessId!==businessId)throw new Error('The saved draft belongs to a different business.');
  if(schedule.workDate!==workDate)throw new Error('The saved draft belongs to a different workday.');
  if(schedule.routes.length!==1)throw new Error('This editor can only edit a single-route draft. Other drafts remain read-only.');
  const route=schedule.routes[0];
  if(!route||!route.routeId.trim()||!route.truckId.trim())throw new Error('The saved route is incomplete and remains read-only.');
  if(!validMinute(route.startMinute)||!validMinute(route.endMinute)||route.startMinute>=route.endMinute)
    throw new Error('The saved route hours cannot be represented in this editor; the draft remains read-only.');
  if(!Array.isArray(route.workers)||route.workers.length===0)
    throw new Error('The saved route has no crew and remains read-only.');

  const workerSubjects:string[]=[];
  const workerSet=new Set<string>();
  const lunchBlocks:Record<string,LunchBlockDraft[]>={};
  for(const worker of route.workers){
    if(!worker.subject||workerSet.has(worker.subject))throw new Error('The saved route has an invalid or duplicate worker and remains read-only.');
    if(worker.startMinute!==route.startMinute||worker.endMinute!==route.endMinute)
      throw new Error('This editor cannot change drafts with different shift hours per worker; the draft remains read-only.');
    workerSet.add(worker.subject);
    workerSubjects.push(worker.subject);
    const breaks=[...(worker.breaks??[])].sort((a,b)=>a.startMinute-b.startMinute);
    if(breaks.length>3)throw new Error('The saved route has more than three lunch blocks for a worker and remains read-only.');
    let previousEnd=route.startMinute;
    for(const block of breaks){
      if(!validMinute(block.startMinute)||!validMinute(block.endMinute)||block.startMinute>=block.endMinute||
        block.startMinute<route.startMinute||block.endMinute>route.endMinute||block.startMinute<previousEnd)
        throw new Error('The saved route has invalid or overlapping lunch blocks and remains read-only.');
      previousEnd=block.endMinute;
    }
    lunchBlocks[worker.subject]=breaks.map(block=>({start:clock(block.startMinute),end:clock(block.endMinute)}));
  }

  const allowed=new Set(activeAgreementIds);
  const seen=new Set<string>();
  const agreementIds:string[]=[];
  const tasksByAgreement:Record<string,ScheduledTask[]>={};
  const suffix=':'+workDate;
  const stops=[...route.stops].sort((a,b)=>a.order-b.order);
  if(stops.length===0)throw new Error('The saved route has no stops and remains read-only.');
  for(const stop of stops){
    if(!stop.visitId.endsWith(suffix))throw new Error('A saved stop belongs to a different workday; the draft remains read-only.');
    const agreementId=stop.visitId.slice(0,-suffix.length);
    if(!agreementId||!allowed.has(agreementId))throw new Error('A saved stop is no longer available in the loaded workday; the draft remains read-only.');
    if(seen.has(agreementId))throw new Error('The saved route contains a duplicate stop and remains read-only.');
    if(!Array.isArray(stop.tasks))throw new Error('A saved stop has invalid task data and remains read-only.');
    for(const task of stop.tasks){
      if(!Array.isArray(task.assignedSubjects)||task.assignedSubjects.some(subject=>!workerSet.has(subject)))
        throw new Error('A saved task is assigned outside this route crew; the draft remains read-only.');
    }
    seen.add(agreementId);
    agreementIds.push(agreementId);
    tasksByAgreement[agreementId]=stop.tasks.map(task=>({...task,assignedSubjects:[...task.assignedSubjects]}));
  }

  return{
    routeId:route.routeId,
    truckId:route.truckId,
    start:clock(route.startMinute),
    end:clock(route.endMinute),
    workerSubjects,
    lunchBlocks,
    agreementIds,
    tasksByAgreement
  };
}
