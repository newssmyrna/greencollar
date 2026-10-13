export type BusinessRole='owner'|'admin'|'worker';
export type BusinessRoleCapabilities={manageSchedule:boolean;recordFieldWork:boolean};
/** Owner/operator intentionally receives both capabilities; admin and worker remain distinct. */
export function businessRoleCapabilities(role:BusinessRole):BusinessRoleCapabilities{
 if(role==='owner')return {manageSchedule:true,recordFieldWork:true};
 if(role==='admin')return {manageSchedule:true,recordFieldWork:false};
 return {manageSchedule:false,recordFieldWork:true};
}
export type RainoutVisit={id:string;estimatedMinutes:number;rateCents:number};
export type TruckDayCapacity={date:string;truckId:string;availableServiceMinutes:number;availableStops:number};
export type ReplanAssignment={visitId:string;date:string;truckId:string;serviceMinutes:number;revenueCents:number;daysDelayed:number};
export type ReplanDayMetric={date:string;stopCount:number;serviceMinutes:number;capacityMinutes:number;utilizationPercent:number;revenueCents:number};
export type ReplanOption={
 id:'next_day'|'spread';
 status:'draft';
 assignments:ReplanAssignment[];
 unchangedCompletedVisitIds:string[];
 unplacedVisitIds:string[];
 movedVisitCount:number;
 projectedRevenueCents:number;
 totalDaysDelayed:number;
 maxDaysDelayed:number;
 days:ReplanDayMetric[];
 warnings:string[];
};
export type RainoutReplan={interruptedDate:string;remainingVisitIds:string[];options:{nextDay:ReplanOption;spread:ReplanOption}};
function validDate(value:string):boolean{
 if(!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
 const date=new Date(value+'T00:00:00.000Z');
 return !Number.isNaN(date.getTime())&&date.toISOString().slice(0,10)===value;
}
function nextDate(date:string):string{
 const d=new Date(date+'T00:00:00.000Z');d.setUTCDate(d.getUTCDate()+1);return d.toISOString().slice(0,10);
}
function validate(visits:readonly RainoutVisit[],completed:readonly string[],interruptedDate:string,capacities:readonly TruckDayCapacity[]):void{
 if(!validDate(interruptedDate))throw new Error('A valid local interruption date is required');
 const ids=new Set<string>();
 for(const visit of visits){
  if(!visit.id||ids.has(visit.id))throw new Error('Rainout visit IDs must be present and unique');
  ids.add(visit.id);
  if(!Number.isSafeInteger(visit.estimatedMinutes)||visit.estimatedMinutes<0||
   !Number.isSafeInteger(visit.rateCents)||visit.rateCents<0)throw new Error('Rainout visit estimates must be valid');
 }
 if(new Set(completed).size!==completed.length||completed.some(id=>!ids.has(id)))
  throw new Error('Completed visits must be unique members of the interrupted work order');
 const slots=new Set<string>();
 for(const slot of capacities){
  if(!validDate(slot.date)||slot.date<nextDate(interruptedDate)||!slot.truckId.trim()||
   !Number.isSafeInteger(slot.availableServiceMinutes)||slot.availableServiceMinutes<0||
   !Number.isSafeInteger(slot.availableStops)||slot.availableStops<0)
   throw new Error('Replan capacity must be valid and start on the next day');
  const key=JSON.stringify([slot.date,slot.truckId]);
  if(slots.has(key))throw new Error('Replan capacity contains a duplicate truck/day');
  slots.add(key);
 }
}
function option(
 id:'next_day'|'spread',remaining:readonly RainoutVisit[],completed:string[],interruptedDate:string,
 capacities:readonly TruckDayCapacity[]
):ReplanOption{
 const tomorrow=nextDate(interruptedDate);
 const slots=capacities.filter(c=>id==='spread'||c.date===tomorrow).slice().sort((a,b)=>a.date.localeCompare(b.date)||a.truckId.localeCompare(b.truckId));
 const used=new Map<string,{minutes:number;stops:number}>();
 const assignments:ReplanAssignment[]=[];
 let visitIndex=0;
 for(const slot of slots){
  let load={minutes:0,stops:0};used.set(JSON.stringify([slot.date,slot.truckId]),load);
  while(visitIndex<remaining.length){
   const visit=remaining[visitIndex];
   if(load.stops+1>slot.availableStops||load.minutes+visit.estimatedMinutes>slot.availableServiceMinutes)break;
   const daysDelayed=Math.round((Date.parse(slot.date+'T00:00:00Z')-Date.parse(interruptedDate+'T00:00:00Z'))/86400000);
   assignments.push({visitId:visit.id,date:slot.date,truckId:slot.truckId,serviceMinutes:visit.estimatedMinutes,revenueCents:visit.rateCents,daysDelayed});
   load={minutes:load.minutes+visit.estimatedMinutes,stops:load.stops+1};used.set(JSON.stringify([slot.date,slot.truckId]),load);visitIndex++;
  }
 }
 const assigned=new Set(assignments.map(a=>a.visitId));
 const dayMap=new Map<string,ReplanDayMetric>();
 for(const slot of slots){
  let day=dayMap.get(slot.date);
  if(!day){day={date:slot.date,stopCount:0,serviceMinutes:0,capacityMinutes:0,utilizationPercent:0,revenueCents:0};dayMap.set(slot.date,day);}
  const load=used.get(JSON.stringify([slot.date,slot.truckId]))??{minutes:0,stops:0};
  day.stopCount+=load.stops;day.serviceMinutes+=load.minutes;day.capacityMinutes+=slot.availableServiceMinutes;
  day.revenueCents+=assignments.filter(a=>a.date===slot.date&&a.truckId===slot.truckId).reduce((sum,a)=>sum+a.revenueCents,0);
 }
 const days=[...dayMap.values()].map(day=>({...day,utilizationPercent:day.capacityMinutes?Math.round(day.serviceMinutes/day.capacityMinutes*1000)/10:0}));
 return {
  id,status:'draft',assignments,unchangedCompletedVisitIds:[...completed],unplacedVisitIds:remaining.filter(v=>!assigned.has(v.id)).map(v=>v.id),
  movedVisitCount:assignments.length,projectedRevenueCents:assignments.reduce((sum,a)=>sum+a.revenueCents,0),
  totalDaysDelayed:assignments.reduce((sum,a)=>sum+a.daysDelayed,0),maxDaysDelayed:assignments.reduce((max,a)=>Math.max(max,a.daysDelayed),0),
  days,warnings:['Service-time capacity only; drive time, service windows, breaks, and route feasibility are not evaluated.','Draft only; no visit, agreement, approval, or customer notification is changed.']
 };
}
/** Creates alternatives for manager review. It never writes or mutates the input schedule. */
export function buildRainoutReplan(
 visits:readonly RainoutVisit[],completedVisitIds:readonly string[],interruptedDate:string,capacities:readonly TruckDayCapacity[]
):RainoutReplan{
 validate(visits,completedVisitIds,interruptedDate,capacities);
 const completed=new Set(completedVisitIds);
 const remaining=visits.filter(v=>!completed.has(v.id));
 return {
  interruptedDate,remainingVisitIds:remaining.map(v=>v.id),
  options:{
   nextDay:option('next_day',remaining,[...completedVisitIds],interruptedDate,capacities),
   spread:option('spread',remaining,[...completedVisitIds],interruptedDate,capacities)
  }
 };
}
