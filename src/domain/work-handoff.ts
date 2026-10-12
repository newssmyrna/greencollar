import {startWork,completionRecord,type WorkSession} from './work-session';
export type SavedCompletionEvidence={agreement_id:string;scheduled_date:string;status:string;actual_minutes:number|null;work_note?:string|null};
/** Only an exact saved visit, duration and note confirms the local completed record. */
export function hasSavedWorkCompletion(session:WorkSession|null,visits:readonly SavedCompletionEvidence[]):boolean{
 if(!session||session.status!=='completed'||session.jobId==='demo-job')return false;
 const minutes=completionRecord(session).actualMinutes;
 return visits.some(visit=>visit.status==='completed'&&session.jobId===visit.agreement_id+':'+visit.scheduled_date&&visit.actual_minutes===minutes&&(visit.work_note??'')===(session.note??''));
}
export function canStartNextWork(session:WorkSession|null,completionSaved:boolean):boolean{
 return !session||session.status==='completed'&&(session.jobId==='demo-job'||completionSaved);
}
/** Protect active work and unsaved completion from replacement, including demo starts. */
export function startNextWork(jobId:string,at:number,current:WorkSession|null,completionSaved:boolean):WorkSession{
 if(current&&current.status!=='completed')throw new Error('Finish the active job before starting another');
 if(!canStartNextWork(current,completionSaved))throw new Error('Save the completed visit before starting another job');
 return startWork(jobId,at);
}
/** Extract the scheduled date needed to recover a completion from an earlier workday. */
export function workSessionDate(session:WorkSession|null):string|null{
 if(!session||session.jobId==='demo-job')return null;
 const match=/:([0-9]{4}-[0-9]{2}-[0-9]{2})$/.exec(session.jobId);
 if(!match||!session.jobId.slice(0,-11))return null;
 const date=new Date(match[1]+'T00:00:00.000Z');
 return !Number.isNaN(date.getTime())&&date.toISOString().slice(0,10)===match[1]?match[1]:null;
}
