import type {Frequency} from './recurrence';
import {validRecordId} from './service-location';
import {serviceTimeConstraints,type ServiceTimeConstraints} from './service-time';
export type ServiceAgreementInput=ServiceTimeConstraints&{
 locationId:string;serviceName:string;rateCents:number;estimatedMinutes:number;
 startsOn:string;endsOn?:string;frequency:Frequency;intervalDays?:number;
};
export const validCalendarDate=(value:string)=>{
 if(!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
 const d=new Date(value+'T00:00:00Z');
 return !Number.isNaN(d.valueOf())&&d.toISOString().slice(0,10)===value;
};
export function localCalendarDate(date=new Date()):string{
 return String(date.getFullYear()).padStart(4,'0')+'-'+String(date.getMonth()+1).padStart(2,'0')+'-'+String(date.getDate()).padStart(2,'0');
}
export function dollarsToCents(value:string):number{
 if(!/^\d{1,7}(\.\d{1,2})?$/.test(value.trim()))throw new Error('Enter a price with at most two decimal places');
 const [whole,fraction='']=value.trim().split('.');
 const cents=Number(whole)*100+Number(fraction.padEnd(2,'0'));
 if(!Number.isSafeInteger(cents)||cents>100000000)throw new Error('Service price is too large');
 return cents;
}
export function serviceAgreementInput(value:unknown):ServiceAgreementInput{
 if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Enter service details');
 const v=value as Record<string,unknown>;
 if(typeof v.locationId!=='string'||!validRecordId(v.locationId))throw new Error('Select a saved service address');
 if(typeof v.serviceName!=='string'||!v.serviceName.trim()||v.serviceName.length>160)throw new Error('Service name is required (up to 160 characters)');
 if(typeof v.rateCents!=='number'||!Number.isSafeInteger(v.rateCents)||v.rateCents<0||v.rateCents>100000000)throw new Error('Enter a valid service price');
 if(typeof v.estimatedMinutes!=='number'||!Number.isInteger(v.estimatedMinutes)||v.estimatedMinutes<1||v.estimatedMinutes>1440)throw new Error('Estimated duration must be 1–1440 whole minutes');
 if(typeof v.startsOn!=='string'||!validCalendarDate(v.startsOn))throw new Error('Start date must be YYYY-MM-DD');
 if(v.endsOn!==undefined&&v.endsOn!==''&&(typeof v.endsOn!=='string'||!validCalendarDate(v.endsOn)||v.endsOn<v.startsOn))throw new Error('End date must be on or after the start date');
 if(typeof v.frequency!=='string'||!['daily','weekly','biweekly','monthly','custom'].includes(v.frequency))throw new Error('Choose a supported schedule');
 if(v.frequency==='custom'&&(typeof v.intervalDays!=='number'||!Number.isInteger(v.intervalDays)||v.intervalDays<1||v.intervalDays>366))throw new Error('Custom interval must be 1–366 whole days');
 if(v.frequency!=='custom'&&v.intervalDays!==undefined)throw new Error('A custom interval requires the custom schedule');
 return {locationId:v.locationId,serviceName:v.serviceName.trim(),rateCents:v.rateCents,estimatedMinutes:v.estimatedMinutes,
 startsOn:v.startsOn,...(v.endsOn?{endsOn:v.endsOn as string}:{}),frequency:v.frequency as Frequency,
 ...(v.frequency==='custom'?{intervalDays:v.intervalDays as number}:{}),
 ...serviceTimeConstraints(v,v.estimatedMinutes)};
}
