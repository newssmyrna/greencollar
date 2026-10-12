import {authenticatedSubject,businessAccess,type Env} from './auth';
import {boundedJson} from './request-json';
import {createInvoiceDraft} from '../../src/domain/invoice';

const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{
 'content-type':'application/json','cache-control':'no-store','x-content-type-options':'nosniff'
}});
const validId=(v:string)=>/^[a-zA-Z0-9_-]{1,100}$/.test(v);
const validDate=(v:string)=>/^\d{4}-\d{2}-\d{2}$/.test(v)&&!Number.isNaN(Date.parse(v))&&new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v;
type DraftRow={id:string;business_id:string;service_visit_id:string;customer_id:string;customer_name:string;issued_on:string;due_on:string;service_description:string;quantity:number;unit_price_cents:number;tax_basis_points:number;status:'draft';notes:string};
function present(r:DraftRow){return {id:r.id,businessId:r.business_id,serviceVisitId:r.service_visit_id,customerId:r.customer_id,customerName:r.customer_name,issuedOn:r.issued_on,dueOn:r.due_on,status:r.status,lines:[{description:r.service_description,quantity:r.quantity,unitPriceCents:r.unit_price_cents}],taxBasisPoints:r.tax_basis_points,notes:r.notes};}
function validDraftRow(v:unknown):v is DraftRow{return !!v&&typeof v==='object'&&typeof (v as DraftRow).id==='string'&&typeof (v as DraftRow).business_id==='string'&&typeof (v as DraftRow).service_visit_id==='string'&&typeof (v as DraftRow).customer_id==='string'&&typeof (v as DraftRow).customer_name==='string'&&typeof (v as DraftRow).issued_on==='string'&&typeof (v as DraftRow).due_on==='string'&&typeof (v as DraftRow).service_description==='string'&&Number.isInteger((v as DraftRow).quantity)&&Number.isInteger((v as DraftRow).unit_price_cents)&&Number.isInteger((v as DraftRow).tax_basis_points)&&(v as DraftRow).status==='draft'&&typeof (v as DraftRow).notes==='string';}
function fromDraftRow(r:DraftRow){return present(r);}
export function createInvoiceDraftApi(authenticate:typeof authenticatedSubject=authenticatedSubject){
 return async(request:Request,env:Env,url=new URL(request.url)):Promise<Response>=>{
  if(!['GET','POST','PATCH'].includes(request.method))return json({error:'method_not_allowed'},405);
  if(!env.OIDC_ISSUER||!env.OIDC_AUDIENCE||!env.OIDC_JWKS_URL)return json({error:'authentication_unconfigured'},503);
  const subject=await authenticate(request,env);if(!subject)return json({error:'unauthorized'},401);
  const businessId=url.searchParams.get('business_id')??'';
  if(!validId(businessId))return json({error:'invalid_business'},400);
  try{
   const role=await businessAccess(env,subject,businessId);
   if(!role)return json({error:'forbidden'},403);
   if(request.method!=='GET'&&role==='worker')return json({error:'forbidden'},403);
   if(request.method==='GET'){
    const result=await env.DB.prepare('SELECT id,business_id,service_visit_id,customer_id,customer_name,issued_on,due_on,service_description,quantity,unit_price_cents,tax_basis_points,status,notes FROM invoice_drafts WHERE business_id=? ORDER BY issued_on DESC,id LIMIT 201').bind(businessId).all<DraftRow>();
    const rows=result.results.filter(validDraftRow);
    return json({invoiceDrafts:rows.slice(0,200).map(fromDraftRow),hasMore:rows.length>200});
   }
   let input:unknown;
   try{input=await boundedJson(request);}catch(e){
    const large=e instanceof Error&&e.message==='payload_too_large';return json({error:large?'payload_too_large':'invalid_json'},large?413:400);
   }
   if(!input||typeof input!=='object'||Array.isArray(input))return json({error:'invalid_input'},400);
   const body=input as Record<string,unknown>;
   if(request.method==='POST'){
    const visitId=body.serviceVisitId;
    const dueOn=body.dueOn;
    const tax=body.taxBasisPoints===undefined?0:body.taxBasisPoints;
    if(typeof visitId!=='string'||!validId(visitId)||typeof dueOn!=='string'||!validDate(dueOn)||typeof tax!=='number'||!Number.isInteger(tax)||tax<0||Number(tax)>10000)
     return json({error:'invalid_invoice_draft'},400);
    const visit=await env.DB.prepare('SELECT id,business_id,scheduled_date,status,completed_customer_id,completed_customer_name,completed_service_name,completed_rate_cents FROM service_visits WHERE business_id=? AND id=?').bind(businessId,visitId).first<{id:string;business_id:string;scheduled_date:string;status:string;completed_customer_id:string|null;completed_customer_name:string|null;completed_service_name:string|null;completed_rate_cents:number|null}>();
    if(!visit||visit.status!=='completed')return json({error:'completed_visit_not_found'},404);
    if(!visit.completed_customer_id||!visit.completed_customer_name?.trim()||!visit.completed_service_name?.trim()||typeof visit.completed_rate_cents!=='number'||!Number.isSafeInteger(visit.completed_rate_cents)||visit.completed_rate_cents<0||visit.completed_rate_cents>100000000||!validDate(visit.scheduled_date))
     return json({error:'billing_snapshot_unavailable'},409);
    if(dueOn<visit.scheduled_date)return json({error:'invalid_due_date'},400);
    const draftInput={id:crypto.randomUUID(),businessId,customerId:visit.completed_customer_id,customerName:visit.completed_customer_name,issuedOn:visit.scheduled_date,dueOn,lines:[{description:visit.completed_service_name,quantity:1,unitPriceCents:visit.completed_rate_cents}],taxBasisPoints:Number(tax),notes:'Service visit '+visit.id};
    try{createInvoiceDraft(draftInput);}catch{return json({error:'invalid_invoice_draft'},400);}
    const saved=await env.DB.prepare(`INSERT INTO invoice_drafts(id,business_id,service_visit_id,customer_id,customer_name,issued_on,due_on,service_description,quantity,unit_price_cents,tax_basis_points,status,notes)
     SELECT ?,v.business_id,v.id,v.completed_customer_id,v.completed_customer_name,v.scheduled_date,?,v.completed_service_name,1,v.completed_rate_cents,?,'draft',?
     FROM service_visits v WHERE v.business_id=? AND v.id=? AND v.status='completed' AND v.completed_customer_id IS NOT NULL AND v.completed_customer_name IS NOT NULL AND v.completed_service_name IS NOT NULL AND v.completed_rate_cents IS NOT NULL
     ON CONFLICT(business_id,service_visit_id) DO NOTHING
     RETURNING id,business_id,service_visit_id,customer_id,customer_name,issued_on,due_on,service_description,quantity,unit_price_cents,tax_basis_points,status,notes`).bind(draftInput.id,dueOn,Number(tax),draftInput.notes,businessId,visitId).first<DraftRow>();
    if(saved&&validDraftRow(saved))return json(fromDraftRow(saved),201);
    const prior=await env.DB.prepare('SELECT id,business_id,service_visit_id,customer_id,customer_name,issued_on,due_on,service_description,quantity,unit_price_cents,tax_basis_points,status,notes FROM invoice_drafts WHERE business_id=? AND service_visit_id=?').bind(businessId,visitId).first<DraftRow>();
    if(prior&&validDraftRow(prior))return json(fromDraftRow(prior),200);
    return json({error:'invoice_draft_storage_unavailable'},503);
   }
   const invoiceId=url.searchParams.get('invoice_id')??'';
   if(!validId(invoiceId))return json({error:'invalid_invoice_id'},400);
   const {dueOn,unitPriceCents,taxBasisPoints}=body;
   if(typeof dueOn!=='string'||!validDate(dueOn)||typeof unitPriceCents!=='number'||!Number.isSafeInteger(unitPriceCents)||unitPriceCents<0||unitPriceCents>100000000||typeof taxBasisPoints!=='number'||!Number.isInteger(taxBasisPoints)||taxBasisPoints<0||taxBasisPoints>10000)
    return json({error:'invalid_invoice_draft'},400);
   const current=await env.DB.prepare('SELECT id,business_id,service_visit_id,customer_id,customer_name,issued_on,due_on,service_description,quantity,unit_price_cents,tax_basis_points,status,notes FROM invoice_drafts WHERE business_id=? AND id=? AND status=\'draft\'').bind(businessId,invoiceId).first<DraftRow>();
   if(!current||!validDraftRow(current))return json({error:'invoice_draft_not_found'},404);
   if(dueOn<current.issued_on)return json({error:'invalid_due_date'},400);
   try{createInvoiceDraft({id:current.id,businessId:current.business_id,customerId:current.customer_id,customerName:current.customer_name,issuedOn:current.issued_on,dueOn,lines:[{description:current.service_description,quantity:current.quantity,unitPriceCents}],taxBasisPoints,notes:current.notes});}catch{return json({error:'invalid_invoice_draft'},400);}
   const updated=await env.DB.prepare(`UPDATE invoice_drafts SET due_on=?,unit_price_cents=?,tax_basis_points=?,updated_at=CURRENT_TIMESTAMP WHERE business_id=? AND id=? AND status='draft'
     RETURNING id,business_id,service_visit_id,customer_id,customer_name,issued_on,due_on,service_description,quantity,unit_price_cents,tax_basis_points,status,notes`).bind(dueOn,Number(unitPriceCents),Number(taxBasisPoints),businessId,invoiceId).first<DraftRow>();
   if(!updated||!validDraftRow(updated))return json({error:'invoice_draft_not_found'},404);
   try{createInvoiceDraft({id:updated.id,businessId:updated.business_id,customerId:updated.customer_id,customerName:updated.customer_name,issuedOn:updated.issued_on,dueOn:updated.due_on,lines:[{description:updated.service_description,quantity:updated.quantity,unitPriceCents:updated.unit_price_cents}],taxBasisPoints:updated.tax_basis_points,notes:updated.notes});}catch{return json({error:'invalid_stored_invoice_draft'},503);}
   return json(fromDraftRow(updated));
  }catch{return json({error:'invoice_draft_storage_unavailable'},503);}
 };
}

export const invoiceDraftApi=createInvoiceDraftApi();
