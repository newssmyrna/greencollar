import type {TravelMatrix} from './types';
export type RoadPoint={id:string;lat:number;lon:number};
export type RoadMatrixResponse={durations:(number|null)[][]};
/** Convert real road-matrix durations (seconds) into the planner's travel minutes.
 * Missing/unreachable journeys remain absent: never substitute straight-line travel.
 */
export function roadTravelMinutes(points:RoadPoint[],payload:RoadMatrixResponse):TravelMatrix{
 if(!points.length || points.length>100)throw new Error('Expected 1–100 locations');
 if(new Set(points.map(p=>p.id)).size!==points.length)throw new Error('Duplicate location identifiers');
 if(points.some(p=>!p.id||!Number.isFinite(p.lat)||!Number.isFinite(p.lon)||Math.abs(p.lat)>90||Math.abs(p.lon)>180))
   throw new Error('Invalid geographic coordinates');
 if(!Array.isArray(payload.durations)||payload.durations.length!==points.length||
    payload.durations.some(row=>!Array.isArray(row)||row.length!==points.length))
   throw new Error('Road matrix dimensions do not match locations');
 const matrix:TravelMatrix={};
 for(let i=0;i<points.length;i++){
   const from=points[i].id;
   matrix[from]={};
   for(let j=0;j<points.length;j++){
     const value=payload.durations[i][j];
     if(value===null)continue;
     if(!Number.isFinite(value)||typeof value!=='number'||value<0)throw new Error('Invalid road duration');
     matrix[from][points[j].id]=Math.ceil(value/60);
   }
 }
 return matrix;
}
/** Create a standard OSRM-compatible table request; only caller-approved HTTPS servers.
 * Road matrix providers are configured server-side, not with customer-visible API keys.
 */
export function osrmTableRequest(baseUrl:string,points:RoadPoint[]):string{
 const base=new URL(baseUrl);
 if(base.protocol!=='https:')throw new Error('HTTPS routing provider required');
 if(!points.length||points.length>100)throw new Error('Expected 1–100 locations');
 if(points.some(p=>!Number.isFinite(p.lat)||!Number.isFinite(p.lon)||Math.abs(p.lat)>90||Math.abs(p.lon)>180))
   throw new Error('Invalid geographic coordinates');
 const coords=points.map(p=>p.lon+','+p.lat).join(';');
 const root=base.href.replace(/\/$/,'');
 return root+'/table/v1/driving/'+coords+'?annotations=duration';
}
