import type {ServerLocationConfirmation} from '../data/location-confirmation-api';

const headers=[
  'event_id','service_date','agreement_id','kind','confirmed_at','server_recorded_at',
  'source','proximity','operator_subject','manual_reason'
] as const;

function csvCell(value:string|number|null):string{
  let text=value===null?'':String(value);
  if(typeof value==='string'&&/^[\\u0000-\\u0020]*[=+\\-@]/.test(text))text="'"+text;
  return '"'+text.replace(/"/g,'""')+'"';
}

/** Serialize only the audit events supplied by the caller; no network or file writes occur here. */
export function locationConfirmationsCsv(events:ServerLocationConfirmation[]):string{
  const rows=events.map(event=>[
    event.id,event.service_date,event.agreement_id,event.kind,new Date(event.confirmed_at).toISOString(),
    event.created_at,event.source,event.proximity,event.operator_subject,event.manual_reason
  ]);
  return [headers,...rows].map(row=>row.map(csvCell).join(',')).join('\\r\\n')+'\\r\\n';
}
