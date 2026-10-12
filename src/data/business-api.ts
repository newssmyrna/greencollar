export type OwnedBusiness={id:string;name:string;role:'owner'|'admin'|'worker'};
function endpoint(apiUrl:string,path:string):string{
 if(!apiUrl.startsWith('https://'))throw new Error('An HTTPS API URL is required');
 return new URL(path,apiUrl).toString();
}
export async function getBusinesses(apiUrl:string,token:string):Promise<OwnedBusiness[]>{
 const r=await fetch(endpoint(apiUrl,'/v1/business'),{headers:{Authorization:'Bearer '+token}});
 if(!r.ok)throw new Error('Business lookup failed ('+r.status+')');
 return (await r.json() as {businesses:OwnedBusiness[]}).businesses;
}
export async function createBusiness(apiUrl:string,token:string,name:string):Promise<OwnedBusiness>{
 const r=await fetch(endpoint(apiUrl,'/v1/business'),{method:'POST',headers:{Authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify({name})});
 if(!r.ok)throw new Error('Business creation failed ('+r.status+')');
 return (await r.json() as {business:OwnedBusiness}).business;
}
