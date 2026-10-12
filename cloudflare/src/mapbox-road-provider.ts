/** Server-side Mapbox Matrix adapter. Never expose the token to the mobile client. */
export type MapboxRoadPoint={id:string;lat:number;lon:number};
export type MapboxRoadTable={durations:(number|null)[][];distances:(number|null)[][]};
function parseMatrix(value:unknown,size:number,label:string):(number|null)[][]{
 if(!Array.isArray(value)||value.length!==size)throw new Error('Mapbox returned an invalid '+label+' matrix');
 return value.map(row=>{
  if(!Array.isArray(row)||row.length!==size)throw new Error('Mapbox matrix shape mismatch');
  return row.map(cell=>{
   if(cell===null)return null;
   if(typeof cell!=='number'||!Number.isFinite(cell)||cell<0)throw new Error('Invalid Mapbox '+label);
   return cell;
  });
 });
}
export async function requestMapboxRoadTable(
 accessToken:string,points:MapboxRoadPoint[],fetcher:typeof fetch=fetch
):Promise<MapboxRoadTable>{
 if(!accessToken.trim())throw new Error('Mapbox access token is required');
 if(points.length<2||points.length>25)throw new Error('Mapbox Matrix requires 2–25 points');
 if(new Set(points.map(p=>p.id)).size!==points.length)throw new Error('Duplicate node id');
 if(points.some(p=>!p.id||!Number.isFinite(p.lat)||!Number.isFinite(p.lon)||Math.abs(p.lat)>90||Math.abs(p.lon)>180))
  throw new Error('Invalid coordinates');
 const coords=points.map(p=>p.lon+','+p.lat).join(';');
 const url=new URL('https://api.mapbox.com/directions-matrix/v1/mapbox/driving/'+coords);
 url.searchParams.set('annotations','duration,distance');
 url.searchParams.set('access_token',accessToken);
 const response=await fetcher(url.toString(),{method:'GET',headers:{accept:'application/json'},signal:AbortSignal.timeout(8000)});
 if(!response.ok)throw new Error('Mapbox routing provider unavailable');
 const raw:unknown=await response.json();
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new Error('Invalid Mapbox response');
 const obj=raw as Record<string,unknown>;
 if(obj.code!=='Ok')throw new Error('Mapbox returned an invalid matrix');
 return {durations:parseMatrix(obj.durations,points.length,'duration'),distances:parseMatrix(obj.distances,points.length,'distance')};
}
