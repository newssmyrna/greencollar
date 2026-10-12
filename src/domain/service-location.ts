export type ServiceLocationInput={address:string;preferences?:string;lat?:number;lon?:number};
export type SavedServiceLocation={id:string;customer_id:string;address:string;preferences:string|null;lat:number|null;lon:number|null};
export const validRecordId=(value:string)=>/^[a-zA-Z0-9_-]{1,100}$/.test(value);
export function serviceLocationInput(value:unknown):ServiceLocationInput{
  if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Enter a service address');
  const input=value as Record<string,unknown>;
  if(typeof input.address!=='string'||!input.address.trim()||input.address.length>500)
    throw new Error('Service address is required and must be at most 500 characters');
  if(input.preferences!==undefined&&input.preferences!==null&&
    (typeof input.preferences!=='string'||input.preferences.length>2000))
    throw new Error('Access preferences must be at most 2000 characters');
  const hasLat=input.lat!==undefined&&input.lat!==null;
  const hasLon=input.lon!==undefined&&input.lon!==null;
  if(hasLat!==hasLon)throw new Error('Enter both latitude and longitude');
  if(hasLat&&(!Number.isFinite(input.lat)||Math.abs(input.lat as number)>90||
    !Number.isFinite(input.lon)||Math.abs(input.lon as number)>180))
    throw new Error('Coordinates are invalid');
  return {
    address:input.address.trim(),
    preferences:typeof input.preferences==='string'?input.preferences.trim():undefined,
    ...(hasLat?{lat:input.lat as number,lon:input.lon as number}:{})
  };
}
