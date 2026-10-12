export type VisitCompletionInput={businessId:string;agreementId:string;date:string;actualMinutes:number};
export type VisitCompletion={agreementId:string;date:string;status:'completed';actualMinutes:number};
/** Explicit user-triggered write. Never retry automatically, to avoid duplicate completion. */
export async function saveVisitCompletion(apiUrl:string,token:string,input:VisitCompletionInput):Promise<VisitCompletion>{
 if(!apiUrl.startsWith('https://'))throw new Error('An HTTPS API URL is required');
 if(!token)throw new Error('Sign in first');
 if(!input.businessId||!input.agreementId||!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(input.date)||
    !Number.isInteger(input.actualMinutes)||input.actualMinutes<1||input.actualMinutes>1440)
   throw new Error('Invalid visit completion');
 const response=await fetch(new URL('/v1/visits/complete',apiUrl).toString(),{
   method:'POST',
   headers:{Authorization:'Bearer '+token,'content-type':'application/json'},
   body:JSON.stringify(input)
 });
 if(!response.ok)throw new Error('Saving completed visit failed ('+response.status+')');
 return await response.json() as VisitCompletion;
}
