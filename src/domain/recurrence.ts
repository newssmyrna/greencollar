/**
 * Recurring field service visit generation. Pure functions, no server or local time dependency.
 * Calendar dates are ISO YYYY-MM-DD; use local service-area dates, not UTC timestamps.
 */
export type Frequency = 'daily'|'weekly'|'biweekly'|'monthly'|'custom';
export type Agreement = {
  id:string; customerId:string; locationId:string; serviceName:string;
  rateCents:number; estimatedMinutes:number; startsOn:string;
  frequency:Frequency; intervalDays?:number; daysOfWeek?:number[];
  endsOn?:string; active:boolean; preferredStartMinute?:number;
  preferredFinishMinute?:number; fixedStartMinute?:number;
};
export type DueVisit = {
  id:string; agreementId:string; customerId:string; locationId:string;
  date:string; serviceName:string; rateCents:number; estimatedMinutes:number;
  earliestStartMinute?:number; latestFinishMinute?:number; fixedStartMinute?:number;
};
const iso=/^\d{4}-\d{2}-\d{2}$/;
function parse(value:string):Date {
  if(!iso.test(value))throw new Error('Invalid ISO date: '+value);
  const d=new Date(value+'T00:00:00Z');
  if(Number.isNaN(d.valueOf())||d.toISOString().slice(0,10)!==value)throw new Error('Invalid calendar date: '+value);
  return d;
}
function addDays(date:Date,days:number):Date{const copy=new Date(date);copy.setUTCDate(copy.getUTCDate()+days);return copy;}
function dayDiff(a:Date,b:Date):number{return Math.round((b.valueOf()-a.valueOf())/86400000);}
function sameMonthDay(start:Date,date:Date):boolean{
  // Last-day alignment for agreements starting 29th-31st in shorter months.
  const last=new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth()+1,0)).getUTCDate();
  return date.getUTCDate()===Math.min(start.getUTCDate(),last);
}
function dueOn(a:Agreement,start:Date,date:Date):boolean{
  const elapsed=dayDiff(start,date);
  if(elapsed<0)return false;
  switch(a.frequency){
    case 'daily': return true;
    case 'weekly':case 'biweekly': {
      const period=a.frequency==='weekly'?7:14;
      if(a.daysOfWeek?.length) {
        const weeks=Math.floor(elapsed/7);
        return weeks%(period/7)===0 && a.daysOfWeek.includes(date.getUTCDay());
      }
      return elapsed%period===0;
    }
    case 'custom':
      if(!Number.isInteger(a.intervalDays)||!a.intervalDays||a.intervalDays<1)throw new Error('Custom recurrence requires positive intervalDays');
      return elapsed%a.intervalDays===0;
    case 'monthly':return sameMonthDay(start,date);
  }
}
export function generateDueVisits(agreements:Agreement[],from:string,to:string,maximum=2000):DueVisit[]{
  const first=parse(from),last=parse(to);
  if(last<first)throw new Error('End before start');
  if(dayDiff(first,last)>366)throw new Error('Date range too large');
  const result:DueVisit[]=[];
  for(const a of agreements){
    if(!a.active)continue;
    const begins=parse(a.startsOn),ends=a.endsOn?parse(a.endsOn):null;
    for(let day=first;day<=last;day=addDays(day,1)){
      if(day<begins||(ends&&day>ends)||!dueOn(a,begins,day))continue;
      const date=day.toISOString().slice(0,10);
      result.push({id:a.id+':'+date,agreementId:a.id,customerId:a.customerId,
        locationId:a.locationId,date,serviceName:a.serviceName,rateCents:a.rateCents,
        estimatedMinutes:a.estimatedMinutes,
        earliestStartMinute:a.preferredStartMinute,latestFinishMinute:a.preferredFinishMinute,
        fixedStartMinute:a.fixedStartMinute});
      if(result.length>maximum)throw new Error('Too many recurring visits');
    }
  }
  return result.sort((a,b)=>a.date.localeCompare(b.date)||a.id.localeCompare(b.id));
}
