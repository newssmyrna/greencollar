export type VisitCompletionInput={businessId:string;agreementId:string;date:string;actualMinutes:number};
export type VisitCompletion={agreementId:string;date:string;status:'completed';actualMinutes:number};
const mismatch=()=>new Error('The server response could not be matched to this visit. Reload the saved workday before retrying.');
function parseCompletionResponse(value:unknown,input:VisitCompletionInput):VisitCompletion{
 if(!value||typeof value!=='object'||Array.isArray(value))throw mismatch();
 const saved=value as Record<string,unknown>;
 if(saved.agreementId!==input.agreementId||saved.date!==input.date||saved.status!=='completed'||saved.actualMinutes!==input.actualMinutes)
  throw mismatch();
 return {agreementId:input.agreementId,date:input.date,status:'completed',actualMinutes:input.actualMinutes};
}
/** Explicit user-triggered write. Never retry automatically, to avoid duplicate completion. */
export async function saveVisitCompletion(
 apiUrl:string,token:string,input:VisitCompletionInput,fetcher:typeof fetch=fetch
):Promise<VisitCompletion>{
 if(!apiUrl.startsWith('https://'))throw new Error('An HTTPS API URL is required');
 if(!token)throw new Error('Sign in first');
 if(!input.businessId||!input.agreementId||!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(input.date)||
    !Number.isInteger(input.actualMinutes)||input.actualMinutes<1||input.actualMinutes>1440)
   throw new Error('Invalid visit completion');
 const response=await fetcher(new URL('/v1/visits/complete',apiUrl).toString(),{
   method:'POST',
   headers:{Authorization:'Bearer '+token,'content-type':'application/json'},
   body:JSON.stringify(input)
 });
 if(!response.ok)throw new Error('Saving completed visit failed ('+response.status+')');
 let body:unknown;
 try{body=await response.json();}catch{throw mismatch();}
 return parseCompletionResponse(body,input);
}
