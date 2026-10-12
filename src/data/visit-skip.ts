export type VisitSkipInput={businessId:string;agreementId:string;date:string};
export type VisitSkip={businessId:string;agreementId:string;date:string;status:'skipped'};

/** Explicit, user-confirmed write; callers must not retry automatically. */
export async function saveVisitSkip(apiUrl:string,token:string,input:VisitSkipInput):Promise<VisitSkip>{
 if(!apiUrl.startsWith('https://'))throw new Error('An HTTPS API URL is required');
 if(!token)throw new Error('Sign in first');
 if(!/^[a-zA-Z0-9_-]{1,100}$/.test(input.businessId)||!/^[a-zA-Z0-9_-]{1,100}$/.test(input.agreementId)
    ||!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(input.date))
   throw new Error('Invalid visit skip');
 const response=await fetch(new URL('/v1/visits/skip',apiUrl).toString(),{
  method:'POST',headers:{Authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify(input)
 });
 if(!response.ok){
  const reason=await response.json().then(value=>(value as {error?:unknown}).error).catch(()=>undefined);
  throw new Error(reason==='visit_not_skippable'?'Completed or active visits cannot be skipped':'Saving skipped visit failed ('+response.status+')');
 }
 const result=await response.json() as Partial<VisitSkip>;
 if(result.businessId!==input.businessId||result.agreementId!==input.agreementId||result.date!==input.date||result.status!=='skipped')
  throw new Error('Invalid visit skip response');
 return {businessId:result.businessId,agreementId:result.agreementId,date:result.date,status:'skipped'};
}
