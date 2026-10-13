/** Server-side road-duration providers. The legacy OSRM-compatible adapter is
 * retained for tests and compatibility. The selected Google adapter is called
 * only by routing-api.ts after authorization, notice, policy and spend gates.
 */
export type RoadCoordinate={id:string;lat:number;lon:number};
export type RoadTable={durations:(number|null)[][]};

const GOOGLE_MATRIX_URL='https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix';
const GOOGLE_FIELD_MASK='originIndex,destinationIndex,duration,status,condition';
const MAX_GOOGLE_RESPONSE_BYTES=256*1024;

async function boundedResponseText(response:Response,maximum:number):Promise<string>{
 const declared=Number(response.headers.get('content-length'));
 if(Number.isFinite(declared)&&declared>maximum)throw new Error('Routing response too large');
 const reader=response.body?.getReader();
 if(!reader)throw new Error('Empty routing response');
 const chunks:Uint8Array[]=[];let size=0;
 try{
  while(true){
   const {done,value}=await reader.read();if(done)break;
   size+=value.byteLength;
   if(size>maximum){try{await reader.cancel();}catch{}throw new Error('Routing response too large');}
   chunks.push(value);
  }
 }finally{reader.releaseLock();}
 const bytes=new Uint8Array(size);let offset=0;
 for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
 return new TextDecoder().decode(bytes);
}

/** Compute an ephemeral Google Essentials duration matrix from coordinates only.
 * IDs are used solely for local validation and are never sent to Google.
 */
export async function requestGoogleRouteTable(
 points:RoadCoordinate[],apiKey:string,fetcher:typeof fetch=fetch
):Promise<RoadTable>{
 if(!Array.isArray(points)||points.length<2||points.length>25)throw new Error('Routing requires 2–25 points');
 if(points.some(point=>!point||typeof point!=='object'))throw new Error('Invalid coordinates');
 if(new Set(points.map(p=>p.id)).size!==points.length)throw new Error('Duplicate node id');
 if(points.some(p=>typeof p.id!=='string'||!p.id||!Number.isFinite(p.lat)||!Number.isFinite(p.lon)||Math.abs(p.lat)>90||Math.abs(p.lon)>180))
  throw new Error('Invalid coordinates');
 if(typeof apiKey!=='string'||apiKey.length<16||apiKey.length>256)throw new Error('Routing provider unavailable');
 const waypoints=points.map(point=>({waypoint:{location:{latLng:{latitude:point.lat,longitude:point.lon}}}}));
 const response=await fetcher(GOOGLE_MATRIX_URL,{
  method:'POST',
  headers:{'content-type':'application/json','accept':'application/json','X-Goog-Api-Key':apiKey,'X-Goog-FieldMask':GOOGLE_FIELD_MASK},
  body:JSON.stringify({origins:waypoints,destinations:waypoints,travelMode:'DRIVE',routingPreference:'TRAFFIC_UNAWARE'}),
  signal:AbortSignal.timeout(8000)
 });
 if(!response.ok)throw new Error('Routing provider unavailable');
 let raw:unknown;
 try{raw=JSON.parse(await boundedResponseText(response,MAX_GOOGLE_RESPONSE_BYTES));}
 catch{throw new Error('Invalid routing response');}
 if(!Array.isArray(raw)||raw.length!==points.length*points.length)throw new Error('Invalid routing matrix');
 const durations:(number|null)[][]=Array.from({length:points.length},()=>Array<number|null>(points.length).fill(null));
 const seen=new Set<string>();
 for(const item of raw){
  if(!item||typeof item!=='object'||Array.isArray(item))throw new Error('Invalid routing element');
  const row=item as Record<string,unknown>;
  const origin=row.originIndex,destination=row.destinationIndex;
  if(!Number.isInteger(origin)||!Number.isInteger(destination)||Number(origin)<0||Number(destination)<0||Number(origin)>=points.length||Number(destination)>=points.length)
   throw new Error('Invalid routing element index');
  const key=String(origin)+':'+String(destination);
  if(seen.has(key))throw new Error('Duplicate routing element');
  seen.add(key);
  const status=row.status;
  if(status!==undefined&&status!==null){
   if(typeof status!=='object'||Array.isArray(status))throw new Error('Invalid routing status');
   const code=(status as Record<string,unknown>).code;
   if(code!==undefined&&code!==0)throw new Error('Routing element failed');
  }
  if(row.condition==='ROUTE_NOT_FOUND'){
   durations[Number(origin)][Number(destination)]=null;
   continue;
  }
  if(row.condition!=='ROUTE_EXISTS'||typeof row.duration!=='string'||!/^\d+(?:\.\d+)?s$/.test(row.duration))
   throw new Error('Invalid routing duration');
  const seconds=Number(row.duration.slice(0,-1));
  if(!Number.isFinite(seconds)||seconds<0)throw new Error('Invalid routing duration');
  durations[Number(origin)][Number(destination)]=seconds;
 }
 if(seen.size!==points.length*points.length)throw new Error('Incomplete routing matrix');
 return {durations};
}

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
