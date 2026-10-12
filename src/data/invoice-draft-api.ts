import {createInvoiceDraft,type InvoiceDraft} from '../domain/invoice';
export type PersistedInvoiceDraft=InvoiceDraft&{serviceVisitId:string};
export type InvoiceDraftList={invoiceDrafts:PersistedInvoiceDraft[];hasMore:boolean};
function mismatch(){return new Error('The server response could not be matched to this invoice draft. Reload drafts before retrying.');}
function parseDraft(value:unknown):PersistedInvoiceDraft{
 if(!value||typeof value!=='object'||Array.isArray(value))throw mismatch();
 const r=value as Record<string,unknown>,lines=r.lines;
 if(typeof r.id!=='string'||typeof r.businessId!=='string'||typeof r.serviceVisitId!=='string'||typeof r.customerId!=='string'||typeof r.customerName!=='string'||typeof r.issuedOn!=='string'||typeof r.dueOn!=='string'||r.status!=='draft'||!Array.isArray(lines)||lines.length!==1||!lines[0]||typeof lines[0]!=='object'||typeof r.taxBasisPoints!=='number'||typeof r.notes!=='string')throw mismatch();
 const line=lines[0] as Record<string,unknown>;
 if(typeof line.description!=='string'||typeof line.quantity!=='number'||typeof line.unitPriceCents!=='number')throw mismatch();
 try{
  const draft=createInvoiceDraft({id:r.id,businessId:r.businessId,customerId:r.customerId,customerName:r.customerName,issuedOn:r.issuedOn,dueOn:r.dueOn,lines:[{description:line.description,quantity:line.quantity,unitPriceCents:line.unitPriceCents}],taxBasisPoints:r.taxBasisPoints,notes:r.notes});
  return {...draft,serviceVisitId:r.serviceVisitId};
 }catch{throw mismatch();}
}
function endpoint(apiUrl:string,businessId:string){
 if(!apiUrl.startsWith('https://'))throw new Error('An HTTPS API URL is required');
 if(!businessId||!tokenSafe(businessId))throw new Error('A valid business is required');
 const u=new URL('/v1/invoice-drafts',apiUrl);u.searchParams.set('business_id',businessId);return u;
}
const tokenSafe=(v:string)=>/^[a-zA-Z0-9_-]{1,100}$/.test(v);
async function read(response:Response){
 if(!response.ok)throw new Error('Invoice draft request failed ('+response.status+')');
 try{return await response.json();}catch{throw mismatch();}
}
export async function listInvoiceDrafts(apiUrl:string,businessId:string,token:string,fetcher:typeof fetch=fetch):Promise<InvoiceDraftList>{
 if(!token)throw new Error('Sign in first');
 const response=await fetcher(endpoint(apiUrl,businessId).toString(),{headers:{Authorization:'Bearer '+token}});
 const body=await read(response);
 if(!body||typeof body!=='object'||!Array.isArray((body as Record<string,unknown>).invoiceDrafts)||typeof (body as Record<string,unknown>).hasMore!=='boolean')throw mismatch();
 return {invoiceDrafts:(body as {invoiceDrafts:unknown[]}).invoiceDrafts.map(parseDraft),hasMore:(body as {hasMore:boolean}).hasMore};
}
export async function createPersistedInvoiceDraft(apiUrl:string,token:string,businessId:string,serviceVisitId:string,dueOn:string,fetcher:typeof fetch=fetch):Promise<PersistedInvoiceDraft>{
 if(!token)throw new Error('Sign in first');
 if(!tokenSafe(serviceVisitId)||!/^\d{4}-\d{2}-\d{2}$/.test(dueOn))throw new Error('Invalid invoice draft source');
 const response=await fetcher(endpoint(apiUrl,businessId).toString(),{method:'POST',headers:{Authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify({serviceVisitId,dueOn,taxBasisPoints:0})});
 const saved=parseDraft(await read(response));
 if(saved.businessId!==businessId||saved.serviceVisitId!==serviceVisitId)throw mismatch();
 return saved;
}
export async function savePersistedInvoiceDraft(apiUrl:string,token:string,draft:PersistedInvoiceDraft,fetcher:typeof fetch=fetch):Promise<PersistedInvoiceDraft>{
 if(!token)throw new Error('Sign in first');
 const url=endpoint(apiUrl,draft.businessId);url.searchParams.set('invoice_id',draft.id);
 if(draft.lines.length!==1)throw new Error('Invalid invoice draft');
 const checked=createInvoiceDraft(draft);
 const response=await fetcher(url.toString(),{method:'PATCH',headers:{Authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify({dueOn:checked.dueOn,unitPriceCents:checked.lines[0].unitPriceCents,taxBasisPoints:checked.taxBasisPoints})});
 const saved=parseDraft(await read(response));
 if(saved.id!==draft.id||saved.businessId!==draft.businessId||saved.serviceVisitId!==draft.serviceVisitId)throw mismatch();
 return saved;
}
