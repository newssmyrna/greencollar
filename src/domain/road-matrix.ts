import type {TravelMatrix} from './types';
export type RoadPoint={id:string;lat:number;lon:number};
export type RoadMatrixResponse={durations:(number|null)[][];distances?:(number|null)[][]};
export type RoadDistanceMatrix=Record<string,Record<string,number>>;
const METERS_PER_MILE=1609.344;
function validatePoints(points:RoadPoint[]):void{
 if(!points.length||points.length>100)throw new Error('Expected 1–100 locations');
 if(new Set(points.map(p=>p.id)).size!==points.length)throw new Error('Duplicate location identifiers');
 if(points.some(p=>!p.id||!Number.isFinite(p.lat)||!Number.isFinite(p.lon)||Math.abs(p.lat)>90||Math.abs(p.lon)>180))
  throw new Error('Invalid geographic coordinates');
}
function validateMatrix(points:RoadPoint[],values:(number|null)[][],label:string):void{
 if(!Array.isArray(values)||values.length!==points.length||values.some(row=>!Array.isArray(row)||row.length!==points.length))
  throw new Error(label+' matrix dimensions do not match locations');
 for(const row of values)for(const value of row)
  if(value!==null&&(typeof value!=='number'||!Number.isFinite(value)||value<0))throw new Error('Invalid road '+label);
}
/** Convert real road durations (seconds) into planner minutes. Unreachable legs stay absent. */
export function roadTravelMinutes(points:RoadPoint[],payload:RoadMatrixResponse):TravelMatrix{
 validatePoints(points);validateMatrix(points,payload.durations,'duration');
 const matrix:TravelMatrix={};
 for(let i=0;i<points.length;i++){
  matrix[points[i].id]={};
  for(let j=0;j<points.length;j++){const value=payload.durations[i][j];if(value!==null)matrix[points[i].id][points[j].id]=Math.ceil(value/60);}
 }
 return matrix;
}
/** Convert provider distances in meters to miles without inventing unreachable legs. */
export function roadTravelDistancesMiles(points:RoadPoint[],payload:RoadMatrixResponse):RoadDistanceMatrix{
 validatePoints(points);
 if(!payload.distances)throw new Error('Road distances are not available');
 validateMatrix(points,payload.distances,'distance');
 const matrix:RoadDistanceMatrix={};
 for(let i=0;i<points.length;i++){
  matrix[points[i].id]={};
  for(let j=0;j<points.length;j++){const value=payload.distances[i][j];if(value!==null)matrix[points[i].id][points[j].id]=value/METERS_PER_MILE;}
 }
 return matrix;
}
/** Create an OSRM-compatible table request using only a caller-approved HTTPS server. */
export function osrmTableRequest(baseUrl:string,points:RoadPoint[]):string{
 const base=new URL(baseUrl);
 if(base.protocol!=='https:')throw new Error('HTTPS routing provider required');
 validatePoints(points);
 const coords=points.map(p=>p.lon+','+p.lat).join(';');
 return base.href.replace(/\/$/,'')+'/table/v1/driving/'+coords+'?annotations=duration,distance';
}
