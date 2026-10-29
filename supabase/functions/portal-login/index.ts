import { createClient } from 'npm:@supabase/supabase-js@2.118.0';
export function createPortalLoginHandler(makeClient=createClient,env=Deno.env,{timeoutMs=15000,logger=console}={}) {
 const get=n=>String(env.get(n)||'').trim();
 const fromKeys=name=>{try{const k=JSON.parse(get(name)||'{}');return k.default||Object.values(k)[0]||'';}catch{return '';}};
 const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info','Access-Control-Allow-Methods':'POST,OPTIONS','Cache-Control':'no-store'};
 const respond=(body,status=200)=>Response.json(body,{status,headers});
 const denied=()=>respond({error:'Username/email or password is incorrect.'},401);
 const unavailable=code=>respond({error:'The login service is temporarily unavailable. Please try again shortly.',code},503);
 return async req=>{
  if(req.method==='OPTIONS')return new Response('ok',{headers});
  if(req.method!=='POST')return respond({error:'POST required.'},405);
  const controller=new AbortController();let stage='request',timer;
  // Bound the whole request and fail closed if the security check is unavailable.
  const login=async()=>{try {
   const raw=await req.text();if(raw.length>2048)return denied();
   let body;try{body=JSON.parse(raw);}catch{return denied();}
   const identifier=String(body?.identifier||'').trim().toLowerCase(),password=body?.password;
   if(!identifier||identifier.length>254||typeof password!=='string'||!password||password.length>128)return denied();
   stage='configuration';
   const db=makeClient(get('SUPABASE_URL'),get('SUPABASE_SERVICE_ROLE_KEY')||fromKeys('SUPABASE_SECRET_KEYS'),{auth:{persistSession:false,autoRefreshToken:false}});
   const ip=req.headers.get('x-forwarded-for')?.split(',')[0]||req.headers.get('cf-connecting-ip')||'unavailable';
   const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(ip+'|'+identifier));
   controller.signal.throwIfAborted();stage='rate_limit';
   const limit=await db.rpc('portal_login_attempt',{p_key:Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('')}).abortSignal(controller.signal);
   controller.signal.throwIfAborted();
   if(limit.error)return unavailable('LOGIN_RATE_LIMIT_UNAVAILABLE');
   if(!limit.data)return respond({error:'Too many attempts. Try again in ten minutes.'},429);
   stage='profile';
   const profile=await db.from('profiles').select('user_id,email').eq(identifier.includes('@')?'email':'username',identifier).in('role',['admin','internal']).abortSignal(controller.signal).maybeSingle();
   controller.signal.throwIfAborted();
   if(profile.error)return unavailable('LOGIN_PROFILE_UNAVAILABLE');
   stage='password';
   const client=makeClient(get('SUPABASE_URL'),get('SUPABASE_ANON_KEY')||fromKeys('SUPABASE_PUBLISHABLE_KEYS'),{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:(input,init)=>fetch(input,{...init,signal:controller.signal})}});
   const signed=await client.auth.signInWithPassword({email:profile.data?.email||'unknown@invalid.example',password});
   controller.signal.throwIfAborted();
   if(signed.error?.status===429)return respond({error:'Too many attempts. Please try again shortly.'},429);
   if(signed.error&&(signed.error.status>=500||signed.error.name==='AuthRetryableFetchError'))return unavailable('LOGIN_AUTH_UNAVAILABLE');
   if(!profile.data||signed.error||signed.data?.user?.id!==profile.data.user_id||!signed.data?.session)return denied();
   return respond({session:signed.data.session});
  }catch{
   if(!controller.signal.aborted)logger.warn?.('portal-login unavailable',{stage});
   return unavailable(controller.signal.aborted?'LOGIN_TIMEOUT':'LOGIN_SERVICE_UNAVAILABLE');
  }};
  const expired=new Promise(resolve=>{timer=setTimeout(()=>{
   controller.abort();
   // Log fixed stage names only, never identifiers, passwords or session tokens.
   logger.warn?.('portal-login timeout',{stage});
   resolve(unavailable('LOGIN_TIMEOUT'));
  },timeoutMs);});
  try{return await Promise.race([login(),expired]);}finally{clearTimeout(timer);}
 };
}
Deno.serve(createPortalLoginHandler());
