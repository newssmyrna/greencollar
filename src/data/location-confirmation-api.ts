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

function validDate(value:string):boolean{return /^\d{4}-\d{2}-\d{2}$/.test(value)&&!Number.isNaN(Date.parse(value))&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;}\n\nfunction endpoint(apiUrl:string,businessId:string):string{
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
