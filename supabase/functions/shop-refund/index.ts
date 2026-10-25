import { createClient } from 'npm:@supabase/supabase-js@2.118.0';

// Self-contained for deployment through Supabase Dashboard. Secrets stay server-side.
export function createShopRefundHandler(makeClient=createClient,env=Deno.env,requestFetch=fetch) {
 const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info','Access-Control-Allow-Methods':'POST,OPTIONS','Cache-Control':'no-store'};
 const get=n=>String(env.get(n)||'').trim();
 const fail=(code,message,status=400)=>Object.assign(Error(message),{code,status});
 const send=(body,status=200)=>Response.json(body,{status,headers:cors});
 const uuid=value=>/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(value||'');
 async function stripe(path,options={}) {
  const key=get('SHOP_STRIPE_SECRET_KEY')||get('STRIPE_SECRET_KEY');
  if(!key)throw fail('STRIPE_NOT_CONFIGURED','Stripe is not configured on the server.',503);
  let response;try{response=await requestFetch('https://api.stripe.com/v1/'+path,{...options,headers:{Authorization:`Bearer ${key}`,'Stripe-Version':'2026-09-30.endive',...options.headers},signal:AbortSignal.timeout(20000)});}catch{throw fail('REFUND_UNCERTAIN','Stripe did not respond. Refresh and retry the same request; do not create a second refund.',503);}
  const data=await response.json();
  if(!response.ok)throw fail('STRIPE_REFUND_ERROR',data.error?.message||'Stripe could not process the refund.',response.status===409||response.status===429||response.status>=500?503:409);
  return data;
 }
 async function checked(query){const r=await query;if(r.error)throw r.error;return r.data;}
 async function sync(db,order) {
  if(!order.stripe_payment_intent_id)return;
  let after='';
  for(let page=0;page<100;page++){
   const list=await stripe('refunds?'+new URLSearchParams({payment_intent:order.stripe_payment_intent_id,limit:'100',...(after?{starting_after:after}:{})}));
   for(const refund of list.data||[])await checked(db.rpc('shop_apply_refund',{p_refund:refund}));
   if(!list.has_more)return;
   after=list.data?.at(-1)?.id;if(!after)break;
  }
  throw fail('REFUND_HISTORY_LIMIT','Review this payment in Stripe before proceeding.',409);
 }
 return async req=>{
  if(req.method==='OPTIONS')return new Response('ok',{headers:cors});
  try{
   if(req.method!=='POST')return send({error:'POST required.'},405);
   let key=get('SUPABASE_SERVICE_ROLE_KEY');if(!key){const keys=JSON.parse(get('SUPABASE_SECRET_KEYS')||'{}');key=keys.default||Object.values(keys)[0];}
   const db=makeClient(get('SUPABASE_URL'),key,{auth:{persistSession:false,autoRefreshToken:false}});
   const token=req.headers.get('authorization')?.replace(/^Bearer\s+/i,'')||'';
   if(!token)throw fail('SESSION_REQUIRED','Please sign in.',401);
   const auth=await db.auth.getUser(token);
   if(auth.error||!auth.data?.user)throw fail('SESSION_REQUIRED','Please sign in again.',401);
   const actor=auth.data.user.id,me=await checked(db.from('profiles').select('role').eq('user_id',actor).single());
   if(me?.role!=='admin')throw fail('ADMIN_REQUIRED','Administrator required.',403);
   let body;try{body=await req.json();}catch{throw fail('BAD_REQUEST','Invalid request.');}
   if(!['review','refund'].includes(body.action)||!uuid(body.order_id))throw fail('BAD_REQUEST','Invalid order or action.');
   let order=await checked(db.from('shop_orders').select('*').eq('id',body.order_id).maybeSingle());
   if(!order||order.payment_status!=='paid'||!order.stripe_payment_intent_id)throw fail('ORDER_NOT_PAID','Only paid orders can be refunded.',409);
   await sync(db,order);
   order=await checked(db.from('shop_orders').select('*').eq('id',body.order_id).single());
   if(body.action==='review'){
    const refunds=await checked(db.from('shop_refunds').select('*').eq('order_id',order.id).order('created_at',{ascending:false}));
    const pending=await checked(db.from('shop_refund_requests').select('*').eq('order_id',order.id).eq('state','processing').maybeSingle());
    return send({order,refunds,request:pending?{...pending,needs_review:Date.now()-new Date(pending.created_at).getTime()>23*3600000}:null});
   }
   if(!uuid(body.request_id)||!Number.isInteger(body.amount)||body.amount<=0||!['requested_by_customer','duplicate','other'].includes(body.reason))throw fail('BAD_REQUEST','Enter a valid refund amount and reason.');
   const reservation=await db.rpc('shop_prepare_refund',{p_order:order.id,p_request:body.request_id,p_amount:body.amount,p_reason:body.reason,p_actor:actor});
   if(reservation.error)throw fail('REFUND_CONFLICT',reservation.error.message,409);
   const saved=reservation.data;
   if(saved.state==='submitted')return send({refund:await checked(db.from('shop_refunds').select('*').eq('stripe_refund_id',saved.stripe_refund_id).single())});
   if(Date.now()-new Date(saved.created_at).getTime()>23*3600000)throw fail('REFUND_NEEDS_REVIEW','Check this unresolved request in Stripe before issuing another refund.',409);
   const form=new URLSearchParams({payment_intent:order.stripe_payment_intent_id,amount:String(saved.amount),'metadata[copku_order_id]':order.id,'metadata[copku_refund_request]':saved.request_id});
   if(saved.reason!=='other')form.set('reason',saved.reason);
   let refund;
   try{refund=await stripe('refunds',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded','Idempotency-Key':'copku-refund-'+saved.request_id},body:form});}
   catch(error){
    // Keep ambiguous/5xx/network outcomes locked for a safe retry. A definitive
    // Stripe rejection does not move money and can release the reservation.
    if(error.code==='STRIPE_REFUND_ERROR'&&error.status===409)await checked(db.from('shop_refund_requests').update({state:'failed'}).eq('request_id',saved.request_id));
    throw error;
   }
   await checked(db.rpc('shop_apply_refund',{p_refund:refund}));
   return send({refund});
  }catch(error){console.error('shop-refund',error.code||'UNKNOWN');return send({error:error.code?error.message:'Refund could not synchronize. Refresh the order before retrying.',code:error.code||'REFUND_SYNC_ERROR'},error.status||503);}
 };
}
Deno.serve(createShopRefundHandler());
