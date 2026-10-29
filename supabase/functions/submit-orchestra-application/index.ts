import { createClient } from 'npm:@supabase/supabase-js@2.118.0';
import { validateApplication, applicationReference } from './application-model.mjs';
import { applicationMailStatus } from './application-mail.mjs';

export function createApplicationHandler(makeClient=createClient,env=Deno.env) {
 const get=name=>String(env.get(name)||'').trim();
 const key=()=>{if(get('SUPABASE_SERVICE_ROLE_KEY'))return get('SUPABASE_SERVICE_ROLE_KEY');try{const keys=JSON.parse(get('SUPABASE_SECRET_KEYS')||'{}');return keys.default||Object.values(keys)[0]||'';}catch{return '';}};
 const origins=new Set(['https://www.pkuco.org','https://pkuco.org','https://hestaphin.github.io','https://copku-v120-portal-preview.neonlake16.chatgpt.site',...get('APPLICATION_ALLOWED_ORIGINS').split(',').map(s=>s.trim()).filter(Boolean)]);
 return async req=>{
  const origin=req.headers.get('origin')||'';
  const headers={'Access-Control-Allow-Origin':origins.has(origin)?origin:'https://www.pkuco.org','Vary':'Origin','Access-Control-Allow-Headers':'content-type,apikey,authorization,x-client-info','Access-Control-Allow-Methods':'POST,OPTIONS','Cache-Control':'no-store'};
  const respond=(body,status=200)=>Response.json(body,{status,headers});
  if(!origins.has(origin))return respond({error:'This website origin cannot submit applications.'},403);
  if(req.method==='OPTIONS')return new Response('ok',{headers});
  if(req.method!=='POST')return respond({error:'POST required.'},405);
  try{
   if(!req.headers.get('content-type')?.includes('application/json'))return respond({error:'JSON required.'},415);
   if(Number(req.headers.get('content-length')||0)>24000)return respond({error:'Application is too large.'},413);
   const raw=await req.text();if(new TextEncoder().encode(raw).length>24000)return respond({error:'Application is too large.'},413);
   let body;try{body=JSON.parse(raw);}catch{return respond({error:'Invalid application.'},400);}
   if(body.action==='health'){
    const secret=key();if(!secret)return respond({error:'Applications are temporarily unavailable.'},503);
    const settings=await applicationMailStatus(null,env);
    return respond({ok:true,email_configured:settings.configured,admin_review_task:true});
   }
   if(body.website||!Number.isFinite(body.started_at)||Date.now()-body.started_at<2000||Date.now()-body.started_at>86400000)return respond({error:'Please refresh the form and try again.'},400);
   if(!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(body.submission_id||''))return respond({error:'Invalid application reference. Refresh the form.'},400);
   let payload;try{payload=validateApplication(body);}catch(error){return respond({error:error.message},400);}
   const secret=key();if(!secret)return respond({error:'Applications are temporarily unavailable.'},503);
   const db=makeClient(get('SUPABASE_URL'),secret,{auth:{persistSession:false,autoRefreshToken:false}});
   const address=req.headers.get('cf-connecting-ip')||req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()||'unknown';
   const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(secret+'|orchestra-application|'+address));
   const ipHash=Array.from(new Uint8Array(digest)).map(b=>b.toString(16).padStart(2,'0')).join('');
   const {data,error}=await db.rpc('orchestra_submit_application',{p_id:body.submission_id,p_payload:payload,p_ip_hash:ipHash});
   if(error){if(error.message?.includes('APPLICATION_RATE_LIMIT'))return respond({error:'Too many applications. Please try again tomorrow.'},429);console.error('orchestra-application',error.code||'DATABASE');return respond({error:'The application could not be saved. Please try again.'},503);}
   return respond({ok:true,reference:applicationReference(data.application_no),email_status:'queued'});
  }catch{return respond({error:'The application could not be sent. Please try again.'},500);}
 };
}
Deno.serve(createApplicationHandler());
