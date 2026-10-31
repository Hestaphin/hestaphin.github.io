import {createClient} from 'npm:@supabase/supabase-js@2.118.0';
const emailPattern=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export async function activationCodeHash(user,salt,code){const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(user+'|'+salt+'|'+code));return Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');}
export function createOnboardingHandler(makeClient=createClient,env=Deno.env,fetcher=fetch){
 const get=n=>String(env.get(n)||'').trim();
 const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info','Access-Control-Allow-Methods':'POST,OPTIONS','Cache-Control':'no-store'};
 const respond=(data,status=200)=>Response.json(data,{status,headers});
 const key=()=>{if(get('SUPABASE_SERVICE_ROLE_KEY'))return get('SUPABASE_SERVICE_ROLE_KEY');try{const keys=JSON.parse(get('SUPABASE_SECRET_KEYS')||'{}');return keys.default||Object.values(keys)[0]||'';}catch{return '';}};
 const rpc=async(db,name,params)=>{const r=await db.rpc(name,params);if(r.error)throw r.error;return r.data;};
 return async req=>{
  if(req.method==='OPTIONS')return new Response('ok',{headers});if(req.method!=='POST')return respond({error:'POST required.'},405);
  try{
   const db=makeClient(get('SUPABASE_URL'),key(),{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:(input,init)=>fetch(input,{...init,signal:AbortSignal.timeout(15000)})}});
   const auth=await db.auth.getUser(req.headers.get('authorization')?.replace(/^Bearer\s+/i,'')||'');if(auth.error||!auth.data?.user)return respond({error:'Sign in again.'},401);
   const user=auth.data.user.id,profile=await db.from('profiles').select('user_id,role,email,full_name,activation_required,activation_password_set_at,activation_email_verified_at').eq('user_id',user).single();
   if(profile.error||profile.data?.role!=='internal')return respond({error:'An orchestra member account is required.'},403);
   const raw=await req.text();if(raw.length>2048)return respond({error:'Request is too large.'},400);const body=JSON.parse(raw),p=profile.data;
   const pending=await db.from('portal_activation_emails').select('request_id,email,code_salt,state,expires_at,last_sent_at').eq('user_id',user).maybeSingle();if(pending.error)throw pending.error;
   const state=()=>({activation_required:p.activation_required,password_set:Boolean(p.activation_password_set_at),email_verified:Boolean(p.activation_email_verified_at),email:p.email||'',pending_email:pending.data?.state!=='verified'?pending.data?.email||'':'',expires_at:pending.data?.expires_at||null,last_sent_at:pending.data?.last_sent_at||null});
   if(body.action==='status')return respond(state());
   if(!p.activation_required)return respond({error:'Your account is already activated.'},409);
   if(body.action==='send_code'){
    const email=String(body.email||'').trim().toLowerCase();if(!emailPattern.test(email)||email.length>254||email.endsWith('@accounts.pkuco.invalid'))return respond({error:'Enter a valid email address.'},400);
    const sender=(get('APPLICATION_FROM_EMAIL')||get('BREVO_SENDER_EMAIL')).toLowerCase(),apiKey=get('BREVO_API_KEY');if(apiKey.length<20||!emailPattern.test(sender))return respond({error:'Verification email is not configured. Contact the administrator.'},503);
    let value;do{value=crypto.getRandomValues(new Uint32Array(1))[0];}while(value>=4294000000);
    const code=String(value%1000000).padStart(6,'0'),salt=crypto.randomUUID(),hash=await activationCodeHash(user,salt,code);
    const reserved=await rpc(db,'portal_activation_begin_email',{p_user:user,p_email:email,p_hash:hash,p_salt:salt});
    let response;try{response=await fetcher('https://api.brevo.com/v3/smtp/email',{method:'POST',headers:{'Content-Type':'application/json',accept:'application/json','api-key':apiKey},body:JSON.stringify({sender:{email:sender,name:get('APPLICATION_FROM_NAME')||'Peking Unnamed Chamber Orchestra'},to:[{email}],subject:'Verify your Orchestra account email / 验证乐团账户邮箱',textContent:'Your verification code is '+code+'. It expires in 10 minutes. Enter it in your account activation task.\n\n你的验证码是 '+code+'，10 分钟内有效。请在账户激活任务中填写。\n\nIf you did not request this, ignore this email. / 如非本人操作，请忽略此邮件。',headers:{idempotencyKey:reserved.request_id},tags:['orchestra-account-verification']}),signal:AbortSignal.timeout(15000)});}catch{return respond({error:'The verification email could not be confirmed as sent. If it arrives, you can still use its code. Otherwise retry after one minute.'},503);}
    if(!response.ok)return respond({error:'The verification email could not be sent. Retry after one minute.'},503);
    return respond({ok:true,pending_email:email,expires_at:reserved.expires_at});
   }
   if(body.action==='verify_code'){
    const code=String(body.code||'').trim();if(!/^\d{6}$/.test(code)||!pending.data)return respond({error:'The verification code is invalid or expired.'},400);
    const hash=await activationCodeHash(user,pending.data.code_salt,code),checked=await rpc(db,'portal_activation_check_email',{p_user:user,p_request:pending.data.request_id,p_hash:hash});
    if(!checked?.ok)return respond({error:'The verification code is invalid or expired.'},400);
    const updated=await db.auth.admin.updateUserById(user,{email:checked.email,email_confirm:true});if(updated.error)return respond({error:'This email could not be added to your account. Retry verification or choose another email.'},409);
    if(await rpc(db,'portal_activation_finish_email',{p_user:user,p_request:checked.request_id})!==true)return respond({error:'Email verification could not be completed. Refresh and retry.'},409);
    return respond({ok:true,email_verified:true});
   }
   return respond({error:'Unknown activation action.'},400);
  }catch(error){
   const code=String(error?.message||'');const known={ACTIVATION_NOT_PENDING:'Your account is already activated.',ACTIVATION_BAD_EMAIL:'Enter a valid email address.',ACTIVATION_EMAIL_IN_USE:'This email is already used by another account.',ACTIVATION_BUSY:'Verification is being completed. Please wait and retry.',ACTIVATION_COOLDOWN:'Wait one minute before requesting another code.',ACTIVATION_SEND_LIMIT:'Too many verification requests. Try again in one hour.'};
   return respond({error:known[code]||'Account activation is temporarily unavailable. Please try again shortly.'},['ACTIVATION_BUSY','ACTIVATION_COOLDOWN','ACTIVATION_SEND_LIMIT'].includes(code)?429:known[code]?400:503);
  }
 };
}
Deno.serve(createOnboardingHandler());
