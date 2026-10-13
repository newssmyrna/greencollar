import {parseServiceClock,formatServiceClock} from './service-time';
import {assessWorkdayWindow,type WorkdayWindowInput} from './workday-window';

export type WorkdayBreakInput={breaks?:string};
export type WorkdayTimingInput=WorkdayWindowInput&WorkdayBreakInput;
export type WorkdayBreakInterval={startMinute:number;finishMinute:number};
export type WorkdayBreakAssessment=
  |{status:'not_set';intervals:[];error:''}
  |{status:'set';intervals:WorkdayBreakInterval[];error:''}
  |{status:'invalid';intervals:[];error:string};
export const MAX_PLANNED_BREAKS=8;

/** A list of unavailable intervals in one shared local clock. One HH:MM-HH:MM pair per line. */
export function assessWorkdayBreak(input:WorkdayTimingInput):WorkdayBreakAssessment{
  try{
    const value=input.breaks;
    if(value!==undefined&&(typeof value!=='string'||value.length>128))
      throw new Error('Enter up to eight break intervals, one HH:MM-HH:MM pair per line.');
    const lines=(value??'').split(/\r?\n/).map(line=>line.trim()).filter(Boolean);
    if(!lines.length)return {status:'not_set',intervals:[],error:''};
    if(lines.length>MAX_PLANNED_BREAKS)
      throw new Error('Enter no more than eight planned breaks.');
    const intervals=lines.map((line,index)=>{
      const times=line.split('-');
      if(times.length!==2||times.some(time=>!time.trim()))
        throw new Error('Break '+(index+1)+': enter a start and finish as HH:MM-HH:MM.');
      const startMinute=parseServiceClock(times[0]);
      const finishMinute=parseServiceClock(times[1],true);
      if(startMinute===undefined||finishMinute===undefined||startMinute>=finishMinute)
        throw new Error('Break '+(index+1)+': finish must be later than start on the same day.');
      return {startMinute,finishMinute};
    }).sort((a,b)=>a.startMinute-b.startMinute||a.finishMinute-b.finishMinute);
    for(let index=1;index<intervals.length;index++)
      if(intervals[index].startMinute<intervals[index-1].finishMinute)
        throw new Error('Planned breaks cannot overlap.');
    const window=assessWorkdayWindow(input);
    if(window.status==='invalid')throw new Error('Correct the workday window before setting breaks.');
    if(intervals.some(interval=>interval.startMinute<window.startMinute||interval.finishMinute>window.finishMinute))
      throw new Error('Keep every planned break within the remaining work window, or clear the break list.');
    return {status:'set',intervals,error:''};
  }catch(error){
    return {status:'invalid',intervals:[],
      error:error instanceof Error?error.message:'Enter valid planned breaks.'};
  }
}
export function normalizeWorkdayBreak(input:WorkdayTimingInput):WorkdayBreakInput{
  const assessment=assessWorkdayBreak(input);
  if(assessment.status==='invalid')throw new Error(assessment.error);
  return assessment.status==='not_set'?{}:{
    breaks:assessment.intervals.map(interval=>
      formatServiceClock(interval.startMinute)+'-'+formatServiceClock(interval.finishMinute)
    ).join('\n')
  };
}
