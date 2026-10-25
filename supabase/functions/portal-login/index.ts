import { createClient } from 'npm:@supabase/supabase-js@2.118.0';
export function createPortalLoginHandler(makeClient=createClient,env=Deno.env) {
 const get=n=>String(env.get(n)||'').trim();
 const fromKeys=name=>{try{const k=JSON.parse(get(name)||'{}');return k.default||Object.values(k)[0]||'';}catch{return '';}};
 const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info','Access-Control-Allow-Methods':'POST,OPTIONS','Cache-Control':'no-store'};
 const respond=(body,status=200)=>Response.json(body,{status,headers});
 const denied=()=>respond({error:'Username/email or password is incorrect.'},401);
 return async req=>{
  if(req.method==='OPTIONS')return new Response('ok',{headers});
  if(req.method!=='POST')return respond({error:'POST required.'},405);
  try {
   const raw=await req.text();if(raw.length>2048)return denied();
   const body=JSON.parse(raw),identifier=String(body.identifier||'').trim().toLowerCase(),password=body.password;
   if(!identifier||identifier.length>254||typeof password!=='string'||!password||password.length>128)return denied();
   const db=makeClient(get('SUPABASE_URL'),get('SUPABASE_SERVICE_ROLE_KEY')||fromKeys('SUPABASE_SECRET_KEYS'),{auth:{persistSession:false,autoRefreshToken:false}});
   const ip=req.headers.get('x-forwarded-for')?.split(',')[0]||req.headers.get('cf-connecting-ip')||'unavailable';
   const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(ip+'|'+identifier));
   const limit=await db.rpc('portal_login_attempt',{p_key:Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('')});
   if(limit.error)return respond({error:'Login is temporarily unavailable. Please try again.'},503);
   if(!limit.data)return respond({error:'Too many attempts. Try again in ten minutes.'},429);
   const profile=await db.from('profiles').select('user_id,email').eq(identifier.includes('@')?'email':'username',identifier).in('role',['admin','internal']).maybeSingle();
   if(profile.error)return respond({error:'Login is temporarily unavailable. Please try again.'},503);
   const client=makeClient(get('SUPABASE_URL'),get('SUPABASE_ANON_KEY')||fromKeys('SUPABASE_PUBLISHABLE_KEYS'),{auth:{persistSession:false,autoRefreshToken:false}});
   const signed=await client.auth.signInWithPassword({email:profile.data?.email||'unknown@invalid.example',password});
   if(!profile.data||signed.error||signed.data?.user?.id!==profile.data.user_id||!signed.data?.session)return denied();
   return respond({session:signed.data.session});
  }catch{return denied();}
 };
}
Deno.serve(createPortalLoginHandler());
