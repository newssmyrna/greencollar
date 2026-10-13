import {parseServiceClock,formatServiceClock} from './service-time';

export type WorkdayWindowInput={workdayStart?:string;workdayFinish?:string};
export type WorkdayWindowAssessment=
  |{status:'not_set'|'set';startMinute:number;finishMinute:number;error:''}
  |{status:'invalid';startMinute:null;finishMinute:null;error:string};

/** Planned remaining work in one local calendar day; never derived from the device clock. */
export function assessWorkdayWindow(input:WorkdayWindowInput):WorkdayWindowAssessment{
  try{
    for(const value of [input.workdayStart,input.workdayFinish])
      if(value!==undefined&&(typeof value!=='string'||value.length>32))
        throw new Error('Enter workday times as 24-hour HH:MM.');
    const startMinute=parseServiceClock(input.workdayStart??'');
    const finishMinute=parseServiceClock(input.workdayFinish??'',true);
    if(startMinute===undefined&&finishMinute===undefined)
      return {status:'not_set',startMinute:0,finishMinute:1440,error:''};
    if(startMinute===undefined||finishMinute===undefined)
      throw new Error('Enter both a workday start and finish, or leave both blank.');
    if(startMinute>=finishMinute)
      throw new Error('Workday finish must be after start on the same day. Overnight windows are not supported.');
    return {status:'set',startMinute,finishMinute,error:''};
  }catch(error){
    return {status:'invalid',startMinute:null,finishMinute:null,
      error:error instanceof Error?error.message:'Enter a valid workday window.'};
  }
}
export function normalizeWorkdayWindow(input:WorkdayWindowInput):WorkdayWindowInput{
  const window=assessWorkdayWindow(input);
  if(window.status==='invalid')throw new Error(window.error);
  return window.status==='not_set'?{}:{
    workdayStart:formatServiceClock(window.startMinute),workdayFinish:formatServiceClock(window.finishMinute)
  };
}
