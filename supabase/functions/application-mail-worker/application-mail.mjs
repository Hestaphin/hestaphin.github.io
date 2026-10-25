const emailPattern=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const xml=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export async function getApplicationMailConfiguration(_db,env) {
 // Email configuration belongs to Supabase Edge Function Secrets, never the portal.
 const get=name=>String(env.get(name)||'').trim();
 return {api_key:get('BREVO_API_KEY'),sender_email:(get('APPLICATION_FROM_EMAIL')||get('BREVO_SENDER_EMAIL')).toLowerCase(),sender_name:get('APPLICATION_FROM_NAME')||'Peking Unnamed Chamber Orchestra'};
}
export async function applicationMailStatus(db,env) {
 const config=await getApplicationMailConfiguration(db,env);return {configured:config.api_key.length>=20&&emailPattern.test(config.sender_email)};
}
export function applicationReceipt(application) {
 const reference='OA-'+String(application.application_no).padStart(6,'0'),yesno=value=>value?'Yes / 是':'No / 否';
 const lines=['Peking Unnamed Chamber Orchestra / 北京未名室内管弦乐团','Orchestra application received / 乐队申请已收到',reference,'','This email confirms receipt of your application. It is not an admission decision.','此邮件确认已收到你的申请，不代表录取结果。请保存本邮件作为报名备份。','',`Submitted / 提交时间: ${new Date(application.created_at).toLocaleString('en-GB',{timeZone:'Asia/Shanghai',hour12:false})} (UTC+8)`,`Name / 姓名: ${application.full_name}`,`Email / 邮箱: ${application.email}`,`Institution / 单位: ${application.institution}`,`Tel. / WeChat / 电话微信: ${application.phone_wechat}`,`Gender / 性别: ${application.gender||'—'}`];
 const groups={orchestra:'Orchestra / 管弦乐队',keyboard:'Keyboard / 键盘队',windband:'Windband / 管乐队',choir:'Choir / 合唱队'};
 for(const [key,label]of Object.entries(groups)){const section=application.sections[key]||{apply:false};lines.push('',label,`Apply / 报名: ${yesno(section.apply)}`);if(!section.apply)continue;if(key==='choir')lines.push('Voice parts / 声部: '+section.voice_parts.join(', '));else lines.push('Instrument(s) / 乐器: '+(Array.isArray(section.instruments)?section.instruments.join(', '):section.instruments));if(key!=='keyboard')lines.push('Experience / 经历: '+section.experience,'Accept reassignment / 接受调剂: '+yesno(section.accept_assignment));lines.push('Notes / 备注: '+(section.notes||'—'));}
 lines.push('','The administrator will contact you using the details in your application.','管理员会通过你填写的联系方式联系你。');
 const text=lines.join('\n');return {subject:`${reference} · Orchestra application received / 乐队申请确认`,textContent:text,htmlContent:'<!doctype html><html><body><pre style="font:14px/1.65 Arial,sans-serif;white-space:pre-wrap">'+xml(text)+'</pre></body></html>'};
}
export async function processApplicationReceipt(db,env,{applicationId=null,fetcher=fetch}={}) {
 const config=await getApplicationMailConfiguration(db,env);if(config.api_key.length<20||!emailPattern.test(config.sender_email))return {status:'not_configured'};
 const claimed=await db.rpc('portal_application_mail_claim',{p_application:applicationId});if(claimed.error)throw Error('The confirmation queue could not be read.');if(!claimed.data)return {status:'idle'};
 const {application,token}=claimed.data;
 const finish=async(status,messageId=null,errorCode=null)=>{const response=await db.rpc('portal_application_mail_finish',{p_application:application.id,p_token:token,p_status:status,p_message_id:messageId,p_error_code:errorCode});if(response.error||response.data!==true)throw Error('The confirmation result could not be saved.');return {status};};
 let response;
 try{response=await fetcher('https://api.brevo.com/v3/smtp/email',{method:'POST',headers:{'Content-Type':'application/json',accept:'application/json','api-key':config.api_key},body:JSON.stringify({sender:{email:config.sender_email,name:config.sender_name},to:[{email:application.email,name:application.full_name}],...applicationReceipt(application),headers:{idempotencyKey:application.id},tags:['orchestra-application-confirmation']}),signal:AbortSignal.timeout(15000)});}
 catch{return finish('uncertain',null,'delivery_unknown');}
 let result;try{result=await response.json();}catch{result={};}
 if(response.ok&&typeof result.messageId==='string')return finish('sent',result.messageId);
 if(result.code==='duplicate_parameter')return finish('sent',null,'provider_duplicate_prevented');
 const errorCode=typeof result.code==='string'&&/^[a-z0-9_]{1,80}$/i.test(result.code)?result.code:'brevo_http_'+response.status;
 return finish(response.status>=500||response.ok?'uncertain':'failed',null,errorCode);
}
export async function processApplicationMailQueue(db,env,{fetcher=fetch,limit=5}={}) {
 let processed=0,sent=0;for(let i=0;i<limit;i++){const result=await processApplicationReceipt(db,env,{fetcher});if(['not_configured','idle'].includes(result.status))return {processed,sent,configured:result.status!=='not_configured'};processed++;if(result.status==='sent')sent++;}return {processed,sent,configured:true};
}
