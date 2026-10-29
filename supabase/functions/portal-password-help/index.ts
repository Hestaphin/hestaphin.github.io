import {createClient} from 'npm:@supabase/supabase-js@2.118.0';
export function createPasswordHelpHandler(makeClient=createClient,env=Deno.env) {
 const get=n=>String(env.get(n)||'').trim();
 const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info','Access-Control-Allow-Methods':'POST,OPTIONS','Cache-Control':'no-store'};
 const respond=(body,status=200)=>Response.json(body,{status,headers});
 const message='If this Orchestra account exists, activation instructions or an administrator assistance request will be prepared.';
 return async req=>{
  if(req.method==='OPTIONS')return new Response('ok',{headers});
  if(req.method!=='POST')return respond({error:'POST required.'},405);
  try{
   const raw=await req.text();if(raw.length>1024)return respond({ok:true,message});
   const b=JSON.parse(raw),identifier=String(b.identifier||b.email||'').trim().toLowerCase();
   if(!identifier||identifier.length>254)return respond({ok:true,message});
   let key=get('SUPABASE_SERVICE_ROLE_KEY');if(!key){const keys=JSON.parse(get('SUPABASE_SECRET_KEYS')||'{}');key=keys.default||Object.values(keys)[0];}
   const db=makeClient(get('SUPABASE_URL'),key,{auth:{persistSession:false,autoRefreshToken:false}});
   const ip=req.headers.get('x-forwarded-for')?.split(',')[0]||'unavailable';
   const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode('help|'+ip+'|'+identifier));
   const rate=await db.rpc('portal_login_attempt',{p_key:Array.from(new Uint8Array(digest),n=>n.toString(16).padStart(2,'0')).join('')});
   if(rate.error||!rate.data)return respond({ok:true,message});
   const profile=await db.from('profiles').select('user_id,email,full_name,activation_required').eq(identifier.includes('@')?'email':'username',identifier).in('role',['admin','internal']).maybeSingle();
   if(profile.error)throw profile.error;
   const p=profile.data;
   if(p?.activation_required){const sent=await db.auth.resetPasswordForEmail(p.email,{redirectTo:(get('SITE_URL')||'https://www.pkuco.org').replace(/\/$/,'')+'/portal/reset-password/'});if(sent.error)throw sent.error;}
   else if(p){const day=new Date().toISOString().slice(0,10);const event=await db.rpc('portal_admin_event',{p_key:'password:'+p.user_id+':'+day,p_title:'Orchestra password help: '+(p.full_name||p.email),p_text:'Password assistance was requested for '+p.email+'. Verify the member identity privately, then send a password reset email.'});if(event.error)throw event.error;}
   return respond({ok:true,message});
  }catch{return respond({error:'Could not request assistance. Please try again later.'},503);}
 };
}
Deno.serve(createPasswordHelpHandler());
