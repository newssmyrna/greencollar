export type PreviewTruck='truck-1'|'truck-2'|'truck-3';
export type PreviewVisit={id:string;lat:number|null;lon:number|null};
export type TruckPreviewStop={visitId:string;lat:number;lon:number};
export type TruckPreviewRoute={truck:PreviewTruck;stops:TruckPreviewStop[];elementCount:number};
export type TruckPreviewPlan=
 |{status:'ready';routes:TruckPreviewRoute[]}
 |{status:'missing_assignment';unassignedVisitIds:string[]}
 |{status:'missing_coordinates';visitIds:string[]}
 |{status:'too_many_points';truck:PreviewTruck;count:number};
const trucks:PreviewTruck[]=['truck-1','truck-2','truck-3'];
/** Build a temporary route grouping in the operator's current queue order. */
export function prepareTruckPreview<T extends PreviewVisit>(
 visits:readonly T[],assignments:Readonly<Record<string,PreviewTruck>>
):TruckPreviewPlan{
 const unassigned=visits.filter(v=>!trucks.includes(assignments[v.id])).map(v=>v.id);
 if(unassigned.length)return {status:'missing_assignment',unassignedVisitIds:unassigned};
 const missing=visits.filter(v=>!Number.isFinite(v.lat)||!Number.isFinite(v.lon)||
   (v.lat as number)<-90||(v.lat as number)>90||(v.lon as number)<-180||(v.lon as number)>180).map(v=>v.id);
 if(missing.length)return {status:'missing_coordinates',visitIds:missing};
 const routes=trucks.map(truck=>{
  const stops=visits.filter(v=>assignments[v.id]===truck).map(v=>({visitId:v.id,lat:v.lat as number,lon:v.lon as number}));
  return {truck,stops,elementCount:stops.length>1?stops.length*stops.length:0};
 });
 const oversized=routes.find(r=>r.stops.length>25);
 if(oversized)return {status:'too_many_points',truck:oversized.truck,count:oversized.stops.length};
 return {status:'ready',routes};
}
