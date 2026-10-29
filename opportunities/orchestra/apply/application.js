import {APPLICATION_SECTIONS,validateApplication} from './application-model.mjs?v=1.30';
const form=document.querySelector('#orchestra-application-form');
if(form){
 let startedAt=Date.now(),submissionId=crypto.randomUUID();
 const field=name=>form.elements.namedItem(name);
 const error=document.querySelector('#application-error'),success=document.querySelector('#application-success');
 for(const key of APPLICATION_SECTIONS){const choice=field(key+'_apply'),fields=form.querySelector(`[data-group-fields="${key}"]`);const update=()=>{fields.hidden=!choice.checked;fields.disabled=!choice.checked;choice.setAttribute('aria-expanded',String(choice.checked));};choice.addEventListener('change',update);update();}
 form.addEventListener('submit',async event=>{
  event.preventDefault();error.hidden=true;
  if(!form.reportValidity())return;
  const button=form.querySelector('button[type="submit"]');button.disabled=true;
  try{
   const data=new FormData(form),sections={};
   for(const key of APPLICATION_SECTIONS){
    const apply=field(key+'_apply').checked;
    sections[key]={apply,instruments:key==='keyboard'?data.getAll('keyboard_instruments'):data.get(key+'_instruments'),voice_parts:data.getAll('choir_voice_parts'),notes:data.get(key+'_notes')||'',experience:data.get(key+'_experience')||'',accept_assignment:data.get(key+'_assignment')==='yes'?true:data.get(key+'_assignment')==='no'?false:null};
   }
   const payload=validateApplication({...Object.fromEntries(data),sections});
   const url=window.PUCO_SUPABASE_URL,key=window.PUCO_SUPABASE_ANON_KEY;
   if(!url||!key)throw Error('Applications are temporarily unavailable. Please try again later. / 申请暂不可用，请稍后重试。');
   const response=await fetch(url.replace(/\/$/,'')+'/functions/v1/submit-orchestra-application',{method:'POST',headers:{'Content-Type':'application/json',apikey:key},body:JSON.stringify({...payload,submission_id:submissionId,started_at:startedAt,website:data.get('website')||''})});
   const result=await response.json();
   if(!response.ok||!result.ok)throw Error(result.error||'The application could not be saved. Please try again.');
   document.querySelector('#application-reference').textContent=result.reference;
   success.replaceChildren();const reference=document.createElement('strong');reference.textContent=result.reference;const message=document.createElement('p');message.textContent='申请已提交，请保存编号。管理员会在审核后通过你填写的联系方式联系你。 / Application received. Keep this reference. The administrator will contact you after review.';success.append(reference,message);const receipt=document.createElement('p');receipt.textContent='确认邮件正在等待发送，请保存编号作为备份。 / Your confirmation email is pending. Keep this reference as your backup.';success.append(receipt);success.hidden=false;
   for(const control of form.querySelectorAll('input,select,textarea,button'))control.disabled=true;
   success.scrollIntoView({behavior:'smooth',block:'center'});
  }catch(err){error.textContent=err.message;error.hidden=false;error.scrollIntoView({behavior:'smooth',block:'nearest'});button.disabled=false;}
 });
}
