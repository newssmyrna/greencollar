export type LocationConfirmationSyncInput={
  eventId:string;
  businessId:string;
  agreementId:string;
  date:string;
  kind:'arrival'|'departure';
  source:'gps_suggestion'|'manual';
  proximity:'within_radius'|'outside_radius'|'uncertain'|'unavailable'|'manual';
  manualReason?:string;
  confirmedAt:number;
};
export type LocationConfirmationSyncResult={eventId:string;duplicate:boolean};

function validDate(value:string):boolean{return /^\d{4}-\d{2}-\d{2}$/.test(value)&&!Number.isNaN(Date.parse(value))&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;}

function endpoint(apiUrl:string,businessId:string):string{
  const base=new URL(apiUrl);
  if(base.protocol!=='https:'||base.username||base.password)throw new Error('An HTTPS API URL is required');
  if(!/^[a-zA-Z0-9_-]{1,100}$/.test(businessId))throw new Error('Select a valid business');
  const url=new URL('/v1/location-confirmations',base);
  url.searchParams.set('business_id',businessId);
  return url.toString();
}

export async function syncLocationConfirmation(
  apiUrl:string,
  token:string,
  input:LocationConfirmationSyncInput
):Promise<LocationConfirmationSyncResult>{
  if(!token)throw new Error('Sign in first');
  if(!/^[a-zA-Z0-9_-]{1,80}$/.test(input.eventId)||!input.agreementId
    ||!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(input.date)
    ||!Number.isSafeInteger(input.confirmedAt)||input.confirmedAt<0)
    throw new Error('Invalid location confirmation');
  if(input.source==='gps_suggestion'){
    const expected=input.kind==='arrival'?'within_radius':'outside_radius';
    if(input.proximity!==expected||input.manualReason!==undefined)throw new Error('Invalid GPS confirmation');
  }else if(input.proximity!=='manual'||!input.manualReason?.trim()||input.manualReason.trim().length>280){
    throw new Error('Manual confirmation needs a short reason');
  }
  const {businessId,...body}=input;
  const response=await fetch(endpoint(apiUrl,businessId),{
    method:'POST',
    headers:{Authorization:'Bearer '+token,'content-type':'application/json'},
    body:JSON.stringify({...body,businessId,...(input.manualReason===undefined?{}:{manualReason:input.manualReason.trim()})})
  });
  if(!response.ok){
    let reason='';
    try{reason=String((await response.json() as {error?:unknown}).error??'');}catch{}
    const message=reason==='event_id_conflict'?'This confirmation ID conflicts with an earlier event'
      :reason==='forbidden'?'You do not have access to sync confirmations for this business'
      :'Location confirmation sync failed ('+response.status+')';
    throw new Error(message);
  }
  const result=await response.json() as Partial<LocationConfirmationSyncResult>;
  if(result.eventId!==input.eventId||typeof result.duplicate!=='boolean')throw new Error('Invalid location confirmation response');
  return {eventId:result.eventId,duplicate:result.duplicate};
}

export type ServerLocationConfirmation={
  id:string;
  agreement_id:string;
  service_date:string;
  kind:'arrival'|'departure';
  operator_subject:string;
  confirmed_at:number;
  source:'gps_suggestion'|'manual';
  proximity:'within_radius'|'outside_radius'|'uncertain'|'unavailable'|'manual';
  manual_reason:string|null;
  created_at:string;
};
export type ServerLocationConfirmationList={events:ServerLocationConfirmation[];hasMore:boolean;nextCursor:string|null};

function isServerConfirmation(value:unknown,date:string):value is ServerLocationConfirmation{
  if(!value||typeof value!=='object')return false;
  const event=value as Partial<ServerLocationConfirmation>;
  return typeof event.id==='string'&&/^[a-zA-Z0-9_-]{1,80}$/.test(event.id)
    &&typeof event.agreement_id==='string'&&/^[a-zA-Z0-9_-]{1,100}$/.test(event.agreement_id)
    &&event.service_date===date
    &&(event.kind==='arrival'||event.kind==='departure')
    &&typeof event.operator_subject==='string'
    &&Number.isSafeInteger(event.confirmed_at)&&Number(event.confirmed_at)>=0
    &&(event.source==='gps_suggestion'||event.source==='manual')
    &&['within_radius','outside_radius','uncertain','unavailable','manual'].includes(String(event.proximity))
    &&(event.manual_reason===null||typeof event.manual_reason==='string')
    &&typeof event.created_at==='string';
}

export async function listLocationConfirmations(
  apiUrl:string,
  token:string,
  businessId:string,
  date:string,
  cursor?:string
):Promise<ServerLocationConfirmationList>{
  if(!token)throw new Error('Sign in first');
  if(!validDate(date))throw new Error('A valid service date is required');
  const url=new URL(endpoint(apiUrl,businessId));
  url.searchParams.set('date',date);
  if(cursor!==undefined){
    if(!/^[0-9]{1,16}[.][a-zA-Z0-9_-]{1,80}$/.test(cursor))throw new Error('Invalid location history cursor');
    url.searchParams.set('before',cursor);
  }
  const response=await fetch(url.toString(),{
    headers:{Authorization:'Bearer '+token}
  });
  if(!response.ok){
    let reason='';
    try{reason=String((await response.json() as {error?:unknown}).error??'');}catch{}
    throw new Error(reason==='forbidden'?'You do not have access to this business history'
      :'Unable to load location history ('+response.status+')');
  }
  const result=await response.json() as {events?:unknown;hasMore?:unknown;nextCursor?:unknown};
  if(!Array.isArray(result.events)||typeof result.hasMore!=='boolean'
    ||!(result.nextCursor===null||typeof result.nextCursor==='string')
    ||!result.events.every(event=>isServerConfirmation(event,date)))
    throw new Error('Invalid location history response');
  const last=result.events[result.events.length-1] as ServerLocationConfirmation|undefined;
  const expectedCursor=last?String(last.confirmed_at)+'.'+last.id:null;
  if((result.hasMore&&(!last||result.nextCursor!==expectedCursor))||(!result.hasMore&&result.nextCursor!==null))
    throw new Error('Invalid location history cursor response');
  return {events:result.events,hasMore:result.hasMore,nextCursor:result.nextCursor as string|null};
}
