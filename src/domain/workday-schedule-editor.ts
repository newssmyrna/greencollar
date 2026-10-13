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

function safeId(value:unknown):value is string{
  return typeof value==='string'&&/^[a-zA-Z0-9_-]{1,100}$/.test(value);
}

function safeSubject(value:unknown):value is string{
  return typeof value==='string'&&value.length>0&&value.length<=160&&!/[\u0000-\u001f]/.test(value);
}

function hydrateOneRouteDraft(
  route:WorkdaySchedule['routes'][number],
  workDate:string,
  activeAgreementIds:readonly string[]
):SingleRouteScheduleDraft{
  if(!route||!safeId(route.routeId)||!safeId(route.truckId))throw new Error('The saved route is incomplete and remains read-only.');
  if(!validMinute(route.startMinute)||!validMinute(route.endMinute)||route.startMinute>=route.endMinute)
    throw new Error('The saved route hours cannot be represented in this editor; the draft remains read-only.');
  if(!Array.isArray(route.workers)||route.workers.length===0||route.workers.length>12)
    throw new Error('The saved route has an invalid crew and remains read-only.');
  if(!Array.isArray(route.stops)||route.stops.length===0||route.stops.length>100)
    throw new Error('The saved route has an unsupported stop list and remains read-only.');

  const workerSubjects:string[]=[];
  const workerSet=new Set<string>();
  const lunchBlocks:Record<string,LunchBlockDraft[]>={};
  for(const worker of route.workers){
    if(!worker||!safeSubject(worker.subject)||workerSet.has(worker.subject))
      throw new Error('The saved route has an invalid or duplicate worker and remains read-only.');
    if(worker.startMinute!==route.startMinute||worker.endMinute!==route.endMinute)
      throw new Error('This editor cannot change drafts with different shift hours per worker; the draft remains read-only.');
    workerSet.add(worker.subject);
    workerSubjects.push(worker.subject);
    const rawBreaks=worker.breaks??[];
    if(!Array.isArray(rawBreaks)||rawBreaks.length>3)
      throw new Error('The saved route has more than three lunch blocks for a worker and remains read-only.');
    if(rawBreaks.some(block=>!block||!validMinute(block.startMinute)||!validMinute(block.endMinute)))
      throw new Error('The saved route has invalid or overlapping lunch blocks and remains read-only.');
    const breaks=[...rawBreaks].sort((a,b)=>a.startMinute-b.startMinute);
    let previousEnd=route.startMinute;
    for(const block of breaks){
      if(!block||!validMinute(block.startMinute)||!validMinute(block.endMinute)||block.startMinute>=block.endMinute||
        block.startMinute<route.startMinute||block.endMinute>route.endMinute||block.startMinute<previousEnd)
        throw new Error('The saved route has invalid or overlapping lunch blocks and remains read-only.');
      previousEnd=block.endMinute;
    }
    lunchBlocks[worker.subject]=breaks.map(block=>({start:clock(block.startMinute),end:clock(block.endMinute)}));
  }

  const allowed=new Set(activeAgreementIds);
  const seen=new Set<string>();
  const seenOrders=new Set<number>();
  const agreementIds:string[]=[];
  const tasksByAgreement:Record<string,ScheduledTask[]>={};
  const suffix=':'+workDate;
  const stops=[...route.stops].sort((a,b)=>a.order-b.order);
  for(const stop of stops){
    if(!stop||typeof stop.visitId!=='string'||!/^([a-zA-Z0-9_-]{1,100}):(\d{4}-\d{2}-\d{2})$/.test(stop.visitId)||!stop.visitId.endsWith(suffix))
      throw new Error('A saved stop belongs to a different workday or has an invalid ID; the draft remains read-only.');
    if(!Number.isInteger(stop.order)||stop.order<1||stop.order>1000||seenOrders.has(stop.order))
      throw new Error('The saved route has an invalid or duplicate stop order and remains read-only.');
    seenOrders.add(stop.order);
    const agreementId=stop.visitId.slice(0,-suffix.length);
    if(!agreementId||!allowed.has(agreementId))throw new Error('A saved stop is no longer available in the loaded workday; the draft remains read-only.');
    if(seen.has(agreementId))throw new Error('The saved route contains a duplicate stop and remains read-only.');
    if(!Array.isArray(stop.tasks)||stop.tasks.length>20)throw new Error('A saved stop has invalid task data and remains read-only.');
    const seenTaskIds=new Set<string>();
    for(const task of stop.tasks){
      if(!task||!safeId(task.taskId)||seenTaskIds.has(task.taskId)||
        typeof task.label!=='string'||!task.label.trim()||task.label.length>80||
        !Number.isInteger(task.estimatedMinutes)||task.estimatedMinutes<1||task.estimatedMinutes>1440||
        !Array.isArray(task.assignedSubjects)||task.assignedSubjects.length===0||
        task.assignedSubjects.some(subject=>!safeSubject(subject)||!workerSet.has(subject))||
        new Set(task.assignedSubjects).size!==task.assignedSubjects.length)
        throw new Error('A saved task has invalid data or an assignment outside this route crew; the draft remains read-only.');
      seenTaskIds.add(task.taskId);
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

function validateScheduleScope(schedule:WorkdaySchedule,businessId:string,workDate:string):void{
  if(schedule.businessId!==businessId)throw new Error('The saved draft belongs to a different business.');
  if(schedule.workDate!==workDate)throw new Error('The saved draft belongs to a different workday.');
}

function validateRouteSet(schedule:WorkdaySchedule):void{
  if(!Array.isArray(schedule.routes)||schedule.routes.length<1||schedule.routes.length>20)
    throw new Error('The saved draft has an unsupported route count and remains read-only.');
  const routeIds=new Set<string>();
  const visits=new Set<string>();
  const truckIntervals=new Map<string,Array<{start:number;end:number}>>();
  const workerIntervals=new Map<string,Array<{start:number;end:number}>>();
  for(const route of schedule.routes){
    if(!route||!safeId(route.routeId)||routeIds.has(route.routeId)||!safeId(route.truckId)||
      !validMinute(route.startMinute)||!validMinute(route.endMinute)||route.startMinute>=route.endMinute||
      !Array.isArray(route.workers)||route.workers.length===0||route.workers.length>12||
      !Array.isArray(route.stops)||route.stops.length===0||route.stops.length>100)
      throw new Error('The saved draft has an invalid or duplicate route and remains read-only.');
    routeIds.add(route.routeId);
    const interval={start:route.startMinute,end:route.endMinute};
    const truckList=truckIntervals.get(route.truckId)??[];
    if(truckList.some(existing=>interval.start<existing.end&&existing.start<interval.end))
      throw new Error('Saved routes overlap for the same truck; the draft remains read-only.');
    truckList.push(interval);
    truckIntervals.set(route.truckId,truckList);
    for(const worker of route.workers){
      if(!worker||!safeSubject(worker.subject)||!validMinute(worker.startMinute)||!validMinute(worker.endMinute)||
        worker.startMinute>=worker.endMinute)
        throw new Error('The saved draft has an invalid worker assignment and remains read-only.');
      const workerInterval={start:worker.startMinute,end:worker.endMinute};
      const workerList=workerIntervals.get(worker.subject)??[];
      if(workerList.some(existing=>workerInterval.start<existing.end&&existing.start<workerInterval.end))
        throw new Error('A worker is assigned to overlapping saved routes; the draft remains read-only.');
      workerList.push(workerInterval);
      workerIntervals.set(worker.subject,workerList);
    }
    for(const stop of route.stops){
      if(!stop||typeof stop.visitId!=='string')
        throw new Error('The saved draft has an invalid visit assignment and remains read-only.');
      if(visits.has(stop.visitId))throw new Error('A visit is assigned to more than one saved route; the draft remains read-only.');
      visits.add(stop.visitId);
    }
  }
}

/** Hydrates every route only when the complete saved schedule can be preserved by the editor. */
export function hydrateScheduleRouteDrafts(
  schedule:WorkdaySchedule,
  businessId:string,
  workDate:string,
  activeAgreementIds:readonly string[]
):SingleRouteScheduleDraft[]{
  validateScheduleScope(schedule,businessId,workDate);
  validateRouteSet(schedule);
  return schedule.routes.map(route=>hydrateOneRouteDraft(route,workDate,activeAgreementIds));
}

/** Returns a schedule with one route replaced and every other saved route preserved verbatim. */
export function replaceScheduleRouteAtIndex(
  schedule:WorkdaySchedule,
  routeIndex:number,
  replacement:WorkdaySchedule['routes'][number]
):WorkdaySchedule{
  if(!Array.isArray(schedule.routes)||!Number.isInteger(routeIndex)||routeIndex<0||routeIndex>=schedule.routes.length)
    throw new Error('Select a saved route before updating the draft.');
  return{...schedule,routes:schedule.routes.map((route,index)=>index===routeIndex?replacement:route)};
}

/** Hydrates only the complete single-route shape supported by the existing editor entry point. */
export function hydrateSingleRouteDraft(
  schedule:WorkdaySchedule,
  businessId:string,
  workDate:string,
  activeAgreementIds:readonly string[]
):SingleRouteScheduleDraft{
  validateScheduleScope(schedule,businessId,workDate);
  if(!Array.isArray(schedule.routes)||schedule.routes.length!==1)throw new Error('This editor can only edit a single-route draft. Other drafts remain read-only.');
  validateRouteSet(schedule);
  return hydrateOneRouteDraft(schedule.routes[0],workDate,activeAgreementIds);
}

/** Returns an actionable error when task drafts do not match the selected route crew. */
export function validateScheduleTasksForCrew(
  agreementIds:readonly string[],
  tasksByAgreement:Readonly<Record<string,readonly ScheduledTask[]>>,
  workerSubjects:readonly string[]
):string|null{
  const crew=new Set(workerSubjects);
  for(const agreementId of agreementIds){
    const tasks=tasksByAgreement[agreementId]??[];
    if(tasks.length===0)return 'Add at least one task to every selected stop.';
    if(tasks.length>20)return 'Each stop can have no more than 20 tasks.';
    const taskIds=new Set<string>();
    for(const task of tasks){
      if(typeof task.taskId!=='string'||!/^[a-zA-Z0-9_-]{1,100}$/.test(task.taskId)||taskIds.has(task.taskId))
        return 'A task has an invalid or duplicate ID. Reload the draft before updating it.';
      taskIds.add(task.taskId);
      if(typeof task.label!=='string'||!task.label.trim())return 'Give every task a name before updating the draft.';
      if(task.label.length>80)return 'Task names must be 80 characters or fewer.';
      if(!Number.isInteger(task.estimatedMinutes)||task.estimatedMinutes<1||task.estimatedMinutes>1440)
        return 'Task estimates must be whole minutes from 1 to 1440.';
      if(!Array.isArray(task.assignedSubjects)||task.assignedSubjects.length===0)
        return 'Assign every task to at least one route crew member.';
      if(new Set(task.assignedSubjects).size!==task.assignedSubjects.length)
        return 'Remove duplicate worker assignments from each task.';
      if(task.assignedSubjects.some(subject=>!crew.has(subject)))
        return 'Reassign tasks to members of the current route crew before updating the draft.';
    }
  }
  return null;
}
