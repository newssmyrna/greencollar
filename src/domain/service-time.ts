export type ServiceTimeConstraints={
  preferredStartMinute?:number;
  preferredFinishMinute?:number;
  fixedStartMinute?:number;
};

/** Local service-day clock minutes, without timezone conversion or an overnight span. */
export function parseServiceClock(value:string,allowEndOfDay=false):number|undefined{
  const text=value.trim();
  if(!text)return undefined;
  if(!/^\d{1,2}:\d{2}$/.test(text))throw new Error('Enter appointment times as 24-hour HH:MM');
  const [hours,minutes]=text.split(':').map(Number);
  if(minutes>59||hours>23&&!(allowEndOfDay&&hours===24&&minutes===0))
    throw new Error('Use 00:00–23:59; only latest finish may be 24:00');
  return hours*60+minutes;
}
export function formatServiceClock(minute:number):string{
  if(!Number.isInteger(minute)||minute<0||minute>1440)return 'Invalid time';
  return String(Math.floor(minute/60)).padStart(2,'0')+':'+String(minute%60).padStart(2,'0');
}
export function serviceTimeConstraints(value:Record<string,unknown>,estimatedMinutes:number):ServiceTimeConstraints{
  const fields=[
    ['preferredStartMinute','Earliest start',0,1439],
    ['preferredFinishMinute','Latest finish',1,1440],
    ['fixedStartMinute','Fixed start',0,1439]
  ] as const;
  const result:ServiceTimeConstraints={};
  for(const [key,label,min,max] of fields){
    const minute=value[key];
    if(minute===undefined)continue;
    if(typeof minute!=='number'||!Number.isInteger(minute)||minute<min||minute>max)
      throw new Error(label+' must be a valid whole minute in the service day');
    result[key]=minute;
  }
  if(Object.keys(result).length){
    if(!Number.isInteger(estimatedMinutes)||estimatedMinutes<1||estimatedMinutes>1440)
      throw new Error('Enter a valid estimated service duration');
    const earliest=result.preferredStartMinute??0,latest=result.preferredFinishMinute??1440;
    if(earliest>=latest)throw new Error('Latest finish must be after earliest start on the same day');
    if(result.fixedStartMinute!==undefined&&result.fixedStartMinute<earliest)
      throw new Error('Fixed start cannot be before earliest start');
    if((result.fixedStartMinute??earliest)+estimatedMinutes>latest)
      throw new Error('Estimated service duration must fit before latest finish on the same day');
  }
  return result;
}
export function describeServiceTimeConstraints(times:ServiceTimeConstraints):string{
  const parts:string[]=[];
  if(times.fixedStartMinute!==undefined)parts.push('Fixed start '+formatServiceClock(times.fixedStartMinute));
  if(times.preferredStartMinute!==undefined)parts.push('Start no earlier than '+formatServiceClock(times.preferredStartMinute));
  if(times.preferredFinishMinute!==undefined)parts.push('Finish by '+formatServiceClock(times.preferredFinishMinute));
  return parts.length?parts.join(' · ')+' · service-local time':'Flexible timing · no appointment window saved';
}
