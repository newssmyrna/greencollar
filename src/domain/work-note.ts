import type {WorkSession} from './work-session';
export const MAX_WORK_NOTE_LENGTH=1000;
export function normalizeWorkNote(value:string):string{
 if(typeof value!=='string'||value.length>MAX_WORK_NOTE_LENGTH)throw new Error('Work note must be at most 1,000 characters');
 return value.trim();
}
/** Create a new timer snapshot; an empty value remains explicit so server sync can clear a note. */
export function withWorkNote(session:WorkSession,value:string):WorkSession{
 return {...session,note:normalizeWorkNote(value)};
}
