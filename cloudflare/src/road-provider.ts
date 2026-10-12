/** An optional server-side OSRM-compatible road-duration provider.
 * No routing service is selected or deployed. Base URL is operator-configured.
 * Caller must authenticate, authorize the business and obtain consent before
 * submitting customer coordinates to a third-party routing provider.
 */
export type RoadCoordinate={id:string;lat:number;lon:number};
export type RoadTable={durations:(number|null)[][]};
export async function requestRoadTable(
 baseUrl:string,points:RoadCoordinate[],
 fetcher:typeof fetch=fetch
):Promise<RoadTable>{
 const base=new URL(baseUrl);
 if(base.protocol!=='https:' || base.username || base.password || base.search || base.hash
    || !base.hostname || base.pathname!=='/')
   throw new Error('Invalid routing server origin');
 if(points.length<2||points.length>25)throw new Error('Routing requires 2–25 points');
 if(new Set(points.map(p=>p.id)).size!==points.length)throw new Error('Duplicate node id');
 if(points.some(p=>!p.id||!Number.isFinite(p.lat)||!Number.isFinite(p.lon)||Math.abs(p.lat)>90||Math.abs(p.lon)>180))
   throw new Error('Invalid coordinates');
 const coords=points.map(p=>p.lon+','+p.lat).join(';');
 const url=new URL('/table/v1/driving/'+coords+'?annotations=duration',base);
 const response=await fetcher(url.toString(),{method:'GET',headers:{accept:'application/json'},signal:AbortSignal.timeout(8000)});
 if(!response.ok)throw new Error('Routing provider unavailable');
 const raw:unknown=await response.json();
 if(!raw || typeof raw!=='object'||Array.isArray(raw))throw new Error('Invalid routing response');
 const obj=raw as Record<string,unknown>;
 if(obj.code!=='Ok'||!Array.isArray(obj.durations)||obj.durations.length!==points.length)
   throw new Error('Routing provider returned an invalid matrix');
 const durations:(number|null)[][]=[];
 for(const row of obj.durations){
   if(!Array.isArray(row)||row.length!==points.length)throw new Error('Road matrix shape mismatch');
   const parsed:(number|null)[]=[];
   for(const value of row){
     if(value===null){parsed.push(null);continue;}
     if(typeof value!=='number'||!Number.isFinite(value)||value<0)throw new Error('Invalid road duration');
     parsed.push(value);
   }
   durations.push(parsed);
 }
 return {durations};
}
