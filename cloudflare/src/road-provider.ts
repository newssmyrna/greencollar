/** Optional server-side OSRM-compatible road table provider.
 * No routing service is selected or deployed. Caller must authenticate/authorize the
 * business and obtain consent before submitting customer coordinates to a third party.
 */
export type RoadCoordinate={id:string;lat:number;lon:number};
export type RoadTable={durations:(number|null)[][];distances:(number|null)[][]};
function parseMatrix(value:unknown,size:number,label:string):(number|null)[][]{
 if(!Array.isArray(value)||value.length!==size)throw new Error('Routing provider returned an invalid '+label+' matrix');
 return value.map(row=>{
  if(!Array.isArray(row)||row.length!==size)throw new Error('Road matrix shape mismatch');
  return row.map(cell=>{
   if(cell===null)return null;
   if(typeof cell!=='number'||!Number.isFinite(cell)||cell<0)throw new Error('Invalid road '+label);
   return cell;
  });
 });
}
export async function requestRoadTable(baseUrl:string,points:RoadCoordinate[],fetcher:typeof fetch=fetch):Promise<RoadTable>{
 const base=new URL(baseUrl);
 if(base.protocol!=='https:'||base.username||base.password||base.search||base.hash||!base.hostname||base.pathname!=='/')
  throw new Error('Invalid routing server origin');
 if(points.length<2||points.length>25)throw new Error('Routing requires 2–25 points');
 if(new Set(points.map(p=>p.id)).size!==points.length)throw new Error('Duplicate node id');
 if(points.some(p=>!p.id||!Number.isFinite(p.lat)||!Number.isFinite(p.lon)||Math.abs(p.lat)>90||Math.abs(p.lon)>180))
  throw new Error('Invalid coordinates');
 const coords=points.map(p=>p.lon+','+p.lat).join(';');
 const url=new URL('/table/v1/driving/'+coords+'?annotations=duration,distance',base);
 const response=await fetcher(url.toString(),{method:'GET',headers:{accept:'application/json'},signal:AbortSignal.timeout(8000)});
 if(!response.ok)throw new Error('Routing provider unavailable');
 const raw:unknown=await response.json();
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new Error('Invalid routing response');
 const obj=raw as Record<string,unknown>;
 if(obj.code!=='Ok')throw new Error('Routing provider returned an invalid matrix');
 return {durations:parseMatrix(obj.durations,points.length,'duration'),distances:parseMatrix(obj.distances,points.length,'distance')};
}
