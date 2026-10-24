import { createClient } from 'npm:@supabase/supabase-js@2.118.0';

export async function verifyStripeSignature(raw,header,secret,nowSeconds=Math.floor(Date.now()/1000)) {
  const fields=String(header||'').split(',').map(part=>part.trim().split('='));
  const timestamp=fields.find(([key])=>key==='t')?.[1];
  const signatures=fields.filter(([key])=>key==='v1').map(([,value])=>value);
  if(!secret||!/^\d+$/.test(timestamp||'')||Math.abs(nowSeconds-Number(timestamp))>300)return false;
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const bytes=await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(timestamp+'.'+raw));
  const expected=Array.from(new Uint8Array(bytes),byte=>byte.toString(16).padStart(2,'0')).join('');
  return signatures.some(signature=>{if(!/^[a-f0-9]{64}$/i.test(signature||''))return false;let difference=0;for(let i=0;i<64;i++)difference|=expected.charCodeAt(i)^signature.toLowerCase().charCodeAt(i);return difference===0;});
}
export function createShopWebhook(makeClient=createClient,env=Deno.env,requestFetch=fetch) {
  const get=name=>String(env.get(name)||'').trim();
  return async req=>{
    if(req.method!=='POST')return new Response('POST required',{status:405});
    const raw=await req.text();
    if(raw.length>1048576)return new Response('Too large',{status:413});
    try {
      let key=get('SUPABASE_SERVICE_ROLE_KEY');
      if(!key){const keys=JSON.parse(get('SUPABASE_SECRET_KEYS')||'{}');key=keys.default||Object.values(keys)[0];}
      const db=makeClient(get('SUPABASE_URL'),key,{auth:{persistSession:false,autoRefreshToken:false}});
      let signingSecret=get('SHOP_STRIPE_WEBHOOK_SECRET');
      if(!signingSecret){const saved=await db.rpc('shop_webhook_secret');if(saved.error)throw saved.error;signingSecret=saved.data;}
      if(!await verifyStripeSignature(raw,req.headers.get('stripe-signature'),signingSecret))return new Response('Invalid signature',{status:400});
      const event=JSON.parse(raw);
      const stripeKey=get('SHOP_STRIPE_SECRET_KEY')||get('STRIPE_SECRET_KEY');
      async function stripe(path) {
        const response=await requestFetch('https://api.stripe.com/v1/'+path,{headers:{Authorization:`Bearer ${stripeKey}`,'Stripe-Version':'2026-09-30.endive'},signal:AbortSignal.timeout(15000)});
        if(!response.ok)throw Error('Stripe lookup failed');return response.json();
      }
      if(['refund.created','refund.updated','refund.failed','charge.refund.updated'].includes(event.type)) {
        if(!/^re_[A-Za-z0-9]+$/.test(event.data?.object?.id||''))return new Response('Invalid refund',{status:400});
        const refund=await stripe('refunds/'+encodeURIComponent(event.data.object.id));
        const applied=await db.rpc('shop_apply_refund',{p_refund:refund,p_event_id:event.id});if(applied.error)throw applied.error;
        return Response.json({received:true,...(applied.data?.ignored?{ignored:true}:{})});
      }
      if(event.type==='charge.refunded') {
        if(!/^ch_[A-Za-z0-9]+$/.test(event.data?.object?.id||''))return new Response('Invalid charge',{status:400});
        let after='';
        for(let page=0;page<100;page++){
          const list=await stripe('refunds?'+new URLSearchParams({charge:event.data.object.id,limit:'100',...(after?{starting_after:after}:{})}));
          for(const refund of list.data||[]){const applied=await db.rpc('shop_apply_refund',{p_refund:refund,p_event_id:event.id+':'+refund.id});if(applied.error)throw applied.error;}
          if(!list.has_more)return Response.json({received:true});
          after=list.data?.at(-1)?.id;if(!after)break;
        }
        throw Error('Refund pagination incomplete');
      }
      const accepted=['checkout.session.completed','checkout.session.async_payment_succeeded','checkout.session.async_payment_failed','checkout.session.expired'];
      if(!accepted.includes(event.type)||event.data?.object?.metadata?.puco_shop!=='v2')return Response.json({received:true,ignored:true});
      if(!/^cs_(?:test_|live_)?[A-Za-z0-9]+$/.test(event.data.object.id||''))return new Response('Invalid session',{status:400});
      const response=await requestFetch('https://api.stripe.com/v1/checkout/sessions/'+encodeURIComponent(event.data.object.id),{headers:{Authorization:`Bearer ${stripeKey}`,'Stripe-Version':'2026-09-30.endive'},signal:AbortSignal.timeout(15000)});
      if(!response.ok)throw Error('Stripe session lookup failed');
      const session=await response.json();
      const {error}=await db.rpc('shop_apply_checkout',{p_session:session,p_event_id:event.id,p_event_type:event.type});
      if(error)throw error;
      return Response.json({received:true});
    }catch(error){console.error('shop-stripe-webhook',error.message);return new Response('Webhook processing failed',{status:500});}
  };
}
Deno.serve(createShopWebhook());
