import {notificationCategoryOptions,validateNotificationCategory} from './notification-categories.mjs?v=1.54';
import {escapeHTML as e,validateNotificationFiles} from './model.mjs?v=1.35';

export async function saveDiscussionEdit({kind,subject,category='other',body,existingFiles=[],files=[],upload,update,remove}) {
 const retained=validateNotificationFiles(existingFiles),chosen=validateNotificationFiles(files);
 validateNotificationFiles([...retained,...chosen]);
 const text=String(body||'').trim(),patch={body:text};
 if(kind==='notification'){
  patch.category=validateNotificationCategory(category);
  patch.subject=String(subject||'').trim();
  if(!patch.subject||patch.subject.length>200)throw Error('Use a subject between 1 and 200 characters.');
 }else if(kind!=='reply')throw Error('Invalid discussion item.');
 if(kind==='reply'&&text.length>10000)throw Error('Use at most 10000 characters for the reply.');
 if(!text&&!retained.length&&!chosen.length)throw Error('Write some text or attach a file.');
 const uploaded=[];
 try{
  for(const file of chosen)uploaded.push({path:await upload(file),name:file.name,type:file.type||'application/octet-stream',size:file.size});
  patch.attachments=[...retained,...uploaded];
  const saved=await update(patch);
  if(!saved)throw Error('This post or reply changed. Close the editor and open it again before saving.');
  return saved;
 }catch(error){
  // Only this attempt's uploads are eligible for cleanup. Storage refuses
  // deletion if an uncertain save actually committed a reference to them.
  if(uploaded.length&&remove)await Promise.resolve(remove(uploaded.map(file=>file.path))).catch(()=>{});
  throw error;
 }
}

export function openDiscussionEditor({record,kind,author,modal,bindFiles,upload,update,remove,onSaved}) {
 if(!record||record.author!==author)throw Error('You can edit only your own posts and replies.');
 let retained=[...(record.attachments||[])],selected,saving=false;
 const isPost=kind==='notification';
 const dialog=modal(isPost?'Edit notification':'Edit reply',`<form id="discussion-edit-form">${isPost?`<label>Category<select name="category" required>${notificationCategoryOptions(record.category)}</select></label><label>Subject<input name="subject" required maxlength="200"></label>`:''}<label>Content<textarea name="body" ${isPost?'':'maxlength="10000"'}></textarea></label><div><p>Current attachments</p><div id="discussion-existing-files" class="selected-files"></div></div><label>Attachments — up to 10 MB each, up to eight files<input id="discussion-edit-files" type="file" multiple></label><output id="discussion-edit-selected-files" class="selected-files attachment-caption"></output></form>`,[['Save',async d=>{
  if(saving)return;saving=true;
  const form=d.querySelector('#discussion-edit-form'),body=form.querySelector('[name="body"]').value,subject=isPost?form.querySelector('[name="subject"]').value:undefined,category=isPost?form.querySelector('[name="category"]').value:undefined;
  const controls=[...d.querySelectorAll('input,select,textarea,button')];controls.forEach(control=>control.disabled=true);
  try{
   await saveDiscussionEdit({kind,subject,category,body,existingFiles:retained,files:[...selected.files],upload,update,remove});
  }catch(error){saving=false;controls.forEach(control=>control.disabled=false);throw error;}
  // A successful write must close the editor even if refreshing the page fails.
  d.close();await onSaved?.();
 }]],{className:'portal-discussion-editor'});
 const form=dialog.querySelector('#discussion-edit-form');
 if(isPost){form.querySelector('[name="subject"]').value=record.subject||'';form.querySelector('[name="category"]').value=record.category||'other';}
 form.querySelector('[name="body"]').value=record.body||'';
 const output=dialog.querySelector('#discussion-existing-files');
 const draw=()=>{
  output.innerHTML=retained.map((file,index)=>`<span class="selected-file"><span data-user-content>${e(file.name)} · ${(file.size/1048576).toFixed(2)} MB</span><button type="button" data-remove-existing="${index}" aria-label="Remove ${e(file.name)}">Remove</button></span>`).join('')||'<span class="portal-detail-meta">No attachments.</span>';
  output.querySelectorAll('[data-remove-existing]').forEach(button=>button.onclick=()=>{if(saving)return;retained.splice(Number(button.dataset.removeExisting),1);draw();});
 };
 draw();
 selected=bindFiles(dialog.querySelector('#discussion-edit-files'),dialog.querySelector('#discussion-edit-selected-files'),true,{
  validate:files=>{validateNotificationFiles([...retained,...files]);return files;},
  onError:error=>{dialog.querySelector('.modal-error').textContent=error.message;}
 });
 form.onsubmit=event=>{event.preventDefault();if(!saving)dialog.querySelector('.dialog-actions button:last-child').click();};
 dialog.addEventListener('cancel',event=>{if(saving)event.preventDefault();});
 return dialog;
}
