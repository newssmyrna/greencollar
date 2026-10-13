import type {CrewAvailability} from '../data/availability';

export type LunchBlockDraft={start:string;end:string};

function clock(minute:number):string{
 return String(Math.floor(minute/60)).padStart(2,'0')+':'+String(minute%60).padStart(2,'0');
}

/** Converts reported break events to editable worker-scoped lunch intervals. */
export function reportedLunchBlocks(events:readonly CrewAvailability[]):Record<string,LunchBlockDraft[]>{
 const blocks:Record<string,LunchBlockDraft[]>={};
 for(const event of events){
  if(event.kind!=='break')continue;
  (blocks[event.memberSubject]??=[]).push({start:clock(event.startMinute),end:clock(event.endMinute)});
 }
 for(const worker of Object.keys(blocks))blocks[worker].sort((a,b)=>a.start.localeCompare(b.start));
 return blocks;
}
