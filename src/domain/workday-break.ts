import {parseServiceClock,formatServiceClock} from './service-time';
import {assessWorkdayWindow,type WorkdayWindowInput} from './workday-window';

export type WorkdayBreakInput={breakStart?:string;breakFinish?:string};
export type WorkdayTimingInput=WorkdayWindowInput&WorkdayBreakInput;
export type WorkdayBreakAssessment=
  |{status:'not_set';startMinute:null;finishMinute:null;error:''}
  |{status:'set';startMinute:number;finishMinute:number;error:''}
  |{status:'invalid';startMinute:null;finishMinute:null;error:string};

/** One planned unavailable interval on the same shared local clock as the workday. */
export function assessWorkdayBreak(input:WorkdayTimingInput):WorkdayBreakAssessment{
  try{
    for(const value of [input.breakStart,input.breakFinish])
      if(value!==undefined&&(typeof value!=='string'||value.length>32))
        throw new Error('Enter break times as 24-hour HH:MM.');
    const startMinute=parseServiceClock(input.breakStart??'');
    const finishMinute=parseServiceClock(input.breakFinish??'',true);
    if(startMinute===undefined&&finishMinute===undefined)
      return {status:'not_set',startMinute:null,finishMinute:null,error:''};
    if(startMinute===undefined||finishMinute===undefined)
      throw new Error('Enter both a break start and finish, or leave both blank.');
    if(startMinute>=finishMinute)
      throw new Error('Break finish must be after start on the same day.');
    const window=assessWorkdayWindow(input);
    if(window.status==='invalid')throw new Error('Correct the workday window before setting a break.');
    if(startMinute<window.startMinute||finishMinute>window.finishMinute)
      throw new Error('Keep the planned break within the remaining work window, or clear both break times.');
    return {status:'set',startMinute,finishMinute,error:''};
  }catch(error){
    return {status:'invalid',startMinute:null,finishMinute:null,
      error:error instanceof Error?error.message:'Enter a valid planned break.'};
  }
}
export function normalizeWorkdayBreak(input:WorkdayTimingInput):WorkdayBreakInput{
  const plannedBreak=assessWorkdayBreak(input);
  if(plannedBreak.status==='invalid')throw new Error(plannedBreak.error);
  return plannedBreak.status==='not_set'?{}:{
    breakStart:formatServiceClock(plannedBreak.startMinute),breakFinish:formatServiceClock(plannedBreak.finishMinute)
  };
}
