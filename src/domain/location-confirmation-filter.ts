import type {ServerLocationConfirmation} from '../data/location-confirmation-api';

export type LocationConfirmationKindFilter='all'|'arrival'|'departure';
export type LocationConfirmationSourceFilter='all'|'manual'|'gps_suggestion';

export function filterLocationConfirmations(
  events:ServerLocationConfirmation[],
  kind:LocationConfirmationKindFilter,
  source:LocationConfirmationSourceFilter
):ServerLocationConfirmation[]{
  return events.filter(event=>(kind==='all'||event.kind===kind)&&(source==='all'||event.source===source));
}
