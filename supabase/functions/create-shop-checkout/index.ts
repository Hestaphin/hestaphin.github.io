import { createClient } from 'npm:@supabase/supabase-js@2.118.0';

export function createShopHandler(makeClient = createClient, env = Deno.env, requestFetch = fetch) {
  const catalogue = new Map([['chopin-theme-textbook', { priceCents: 500, currency: 'usd', priceSecret: 'SHOP_CHOPIN_STRIPE_PRICE_ID' }]]);
  const requestPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
  const sessionPattern = /^cs_(?:test_|live_)?[A-Za-z0-9]+$/;
  const get = name => String(env.get(name) || '').trim();
  const supportedShippingCountries = new Set('AC,AD,AE,AF,AG,AI,AL,AM,AO,AQ,AR,AT,AU,AW,AX,AZ,BA,BB,BD,BE,BF,BG,BH,BI,BJ,BL,BM,BN,BO,BQ,BR,BS,BT,BV,BW,BY,BZ,CA,CD,CF,CG,CH,CI,CK,CL,CM,CN,CO,CR,CV,CW,CY,CZ,DE,DJ,DK,DM,DO,DZ,EC,EE,EG,EH,ER,ES,ET,FI,FJ,FK,FO,FR,GA,GB,GD,GE,GF,GG,GH,GI,GL,GM,GN,GP,GQ,GR,GS,GT,GU,GW,GY,HK,HN,HR,HT,HU,ID,IE,IL,IM,IN,IO,IQ,IS,IT,JE,JM,JO,JP,KE,KG,KH,KI,KM,KN,KR,KW,KY,KZ,LA,LB,LC,LI,LK,LR,LS,LT,LU,LV,LY,MA,MC,MD,ME,MF,MG,MK,ML,MM,MN,MO,MQ,MR,MS,MT,MU,MV,MW,MX,MY,MZ,NA,NC,NE,NG,NI,NL,NO,NP,NR,NU,NZ,OM,PA,PE,PF,PG,PH,PK,PL,PM,PN,PR,PS,PT,PY,QA,RE,RO,RS,RU,RW,SA,SB,SC,SD,SE,SG,SH,SI,SJ,SK,SL,SM,SN,SO,SR,SS,ST,SV,SX,SZ,TA,TC,TD,TF,TG,TH,TJ,TK,TL,TM,TN,TO,TR,TT,TV,TW,TZ,UA,UG,US,UY,UZ,VA,VC,VE,VG,VN,VU,WF,WS,XK,YE,YT,ZA,ZM,ZW'.split(','));
  const shippingCountries = () => { const configured=get('SHOP_SHIPPING_COUNTRIES'); const values=configured?configured.split(',').map(v=>v.trim().toUpperCase()).filter(Boolean):[...supportedShippingCountries]; if(!values.length||values.some(v=>!supportedShippingCountries.has(v)))throw Error('Invalid shipping countries'); return [...new Set(values)]; };
  function serverKey() { if (get('SUPABASE_SERVICE_ROLE_KEY')) return get('SUPABASE_SERVICE_ROLE_KEY'); try { const k = JSON.parse(get('SUPABASE_SECRET_KEYS') || '{}'); return k.default || Object.values(k)[0]; } catch { return ''; } }
  function itemsFrom(value) {
    if (!Array.isArray(value) || !value.length || value.length > 10) return null;
    const seen = new Set(); const items = [];
    for (const line of value) {
      if (!line || !catalogue.has(line.id) || seen.has(line.id) || !Number.isInteger(line.quantity) || line.quantity < 1 || line.quantity > 99) return null;
      seen.add(line.id); items.push({ id: line.id, quantity: line.quantity });
    }
    return items.sort((a,b) => a.id.localeCompare(b.id));
  }
  return async req => {
    const origins = (get('SHOP_SITE_ORIGINS') || 'https://www.pkuco.org,https://pkuco.org,https://hestaphin.github.io,https://copku-v120-portal-preview.neonlake16.chatgpt.site').split(',').map(x => x.trim()).filter(Boolean);
    const origin = req.headers.get('Origin') || '';
    const headers = { 'Content-Type':'application/json', 'Cache-Control':'no-store', Vary:'Origin', 'Access-Control-Allow-Origin': origins.includes(origin) ? origin : 'null', 'Access-Control-Allow-Headers':'apikey,authorization,content-type,x-client-info', 'Access-Control-Allow-Methods':'POST,OPTIONS' };
    const respond = (body, status=200) => Response.json(body, { status, headers });
    if (!origins.includes(origin)) return respond({ error:'This website is not enabled for checkout.', code:'SHOP_ORIGIN' },403);
    if (req.method === 'OPTIONS') return new Response(null,{status:204,headers});
    if (req.method !== 'POST') return respond({error:'POST required.'},405);
    const stripeKey = get('SHOP_STRIPE_SECRET_KEY') || get('STRIPE_SECRET_KEY');
    if (!stripeKey || !serverKey()) return respond({error:'Checkout is temporarily unavailable. Please contact the orchestra.',code:'SHOP_CONFIGURATION'},503);
    const db = makeClient(get('SUPABASE_URL'),serverKey(),{auth:{persistSession:false,autoRefreshToken:false}});
    async function stripe(path,options={}) {
      const response=await requestFetch('https://api.stripe.com/v1'+path,{...options,signal:AbortSignal.timeout(15000),headers:{Authorization:`Bearer ${stripeKey}`,'Stripe-Version':'2026-09-30.endive',...options.headers}});
      if(!response.ok) throw Error('Stripe request failed');
      return response.json();
    }
    try {
      const raw=await req.text();if(raw.length>4096)return respond({error:'Request is too large.'},400);
      let body;try{body=JSON.parse(raw);}catch{return respond({error:'Invalid request.'},400);}
      if(!body||(body.action!=='health'&&!requestPattern.test(body.request_id||'')))return respond({error:'Invalid request identifier.'},400);
      if(body.action==='status') {
        if(!sessionPattern.test(body.session_id||''))return respond({error:'Invalid checkout session.'},400);
        const {data:order,error}=await db.from('shop_orders').select('*').eq('request_id',body.request_id).eq('stripe_checkout_session_id',body.session_id).maybeSingle();
        if(error||!order||order.site_origin!==origin)return respond({error:'Payment could not be verified in this browser.',code:'ORDER_NOT_FOUND'},404);
        const session=await stripe('/checkout/sessions/'+encodeURIComponent(body.session_id));
        const applied=await db.rpc('shop_apply_checkout',{p_session:session,p_event_id:null,p_event_type:'status'});
        if(applied.error)throw applied.error;
        return respond(applied.data);
      }
      const items=body.action==='health'?[{id:'chopin-theme-textbook',quantity:1}]:itemsFrom(body.items);
      if(!['create','health'].includes(body.action)||!items||(body.action!=='health'&&!['cart','buy'].includes(body.source)))return respond({error:'Invalid cart.'},400);
      const currency=(get('SHOP_CURRENCY')||'usd').toLowerCase();
      if(items.some(line=>catalogue.get(line.id).currency!==currency))return respond({error:'The shop currency is not configured correctly.',code:'SHOP_CURRENCY'},503);
      const amount=items.reduce((sum,line)=>sum+catalogue.get(line.id).priceCents*line.quantity,0);
      const priceIds=[];
      for(const line of items) {
        const item=catalogue.get(line.id),id=get(item.priceSecret)||'price_1UTZupGdgIKGS7dTpEQZ5kaE';
        if(!/^price_[A-Za-z0-9]+$/.test(id))return respond({error:'This item is not ready for checkout. Please contact the orchestra.',code:'SHOP_PRICE_MISSING'},503);
        const price=await stripe('/prices/'+encodeURIComponent(id));
        if(!price.active||price.type!=='one_time'||price.currency!==currency||price.unit_amount!==item.priceCents)return respond({error:'This item’s Stripe price does not match the shop.',code:'SHOP_PRICE_MISMATCH'},503);
        priceIds.push(id);
      }
      if(body.action==='health'){const check=await db.from('shop_orders').select('id').limit(1);if(check.error)throw Error('Shop database unavailable');return respond({ready:true,currency,unit_amount:500,shipping_required:true,shipping_country_count:shippingCountries().length});}
      const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify({origin,items,currency,source:body.source,shipping_required:true})));
      const fingerprint=Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');
      let {data:order,error}=await db.from('shop_orders').insert({id:crypto.randomUUID(),request_id:body.request_id,fingerprint,site_origin:origin,items,amount_subtotal:amount,currency}).select('*').single();
      if(error?.code==='23505')({data:order,error}=await db.from('shop_orders').select('*').eq('request_id',body.request_id).single());
      if(error||!order)return respond({error:'Order storage is unavailable. Please contact the orchestra.',code:'SHOP_DATABASE'},503);
      if(order.fingerprint!==fingerprint)return respond({error:'Your checkout changed. Please try again.',code:'CHECKOUT_CHANGED'},409);
      if(order.stripe_checkout_session_id) {
        const existing=await stripe('/checkout/sessions/'+encodeURIComponent(order.stripe_checkout_session_id));
        if(existing.status==='open'&&existing.url&&existing.shipping_address_collection?.allowed_countries?.length)return respond({url:existing.url,session_id:existing.id,order_id:order.id});
        return respond({error:'This checkout has ended. Please start a new checkout.',code:'CHECKOUT_ENDED'},409);
      }
      const params=new URLSearchParams({mode:'payment',integration_identifier:'copku_shop_'+order.id.replace(/[^a-z]/gi,'').padEnd(8,'a').slice(0,8),customer_creation:'always',success_url:`${origin}/shop/?checkout=return&session_id={CHECKOUT_SESSION_ID}`,cancel_url:`${origin}/shop/?checkout=cancel`,'custom_text[submit][message]':'Enter your complete delivery address, including building or apartment details when needed. The orchestra will contact you to arrange delivery.','metadata[puco_shop]':'v2','metadata[order_id]':order.id,'metadata[request_id]':body.request_id,'metadata[site_origin]':origin,'metadata[source]':body.source,'metadata[items]':JSON.stringify(items)});
      items.forEach((line,index)=>{params.set(`line_items[${index}][price]`,priceIds[index]);params.set(`line_items[${index}][quantity]`,String(line.quantity));});
      shippingCountries().forEach((country,index)=>params.set(`shipping_address_collection[allowed_countries][${index}]`,country));
      const session=await stripe('/checkout/sessions',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded','Idempotency-Key':'copku-shop-'+body.request_id},body:params});
      if(!sessionPattern.test(session.id||'')||!session.url)throw Error('Invalid Stripe checkout response');
      const updated=await db.from('shop_orders').update({stripe_checkout_session_id:session.id}).eq('id',order.id);
      if(updated.error)throw updated.error;
      return respond({url:session.url,session_id:session.id,order_id:order.id});
    }catch(error){console.error('create-shop-checkout',error.message);return respond({error:'Payment is temporarily unavailable. Please try again.',code:'SHOP_UNAVAILABLE'},503);}
  };
}
Deno.serve(createShopHandler());
