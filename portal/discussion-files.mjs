import {escapeHTML as e,isPreviewImage,validateNotificationFiles} from './model.mjs?v=1.35';
export async function signDiscussionFiles(bucket,files){
 const paths=[...new Set(files.map(file=>file.path).filter(Boolean))],urls=new Map();
 if(typeof bucket.createSignedUrls==='function'){
  for(let start=0;start<paths.length;start+=64){const result=await bucket.createSignedUrls(paths.slice(start,start+64),300);if(!result.error)for(const row of result.data||[])if(row.signedUrl&&!row.error)urls.set(row.path,row.signedUrl);}
 }else await Promise.all(paths.map(async path=>{const result=await bucket.createSignedUrl(path,300);if(!result.error&&result.data?.signedUrl)urls.set(path,result.data.signedUrl);}));
 return urls;
}
export function discussionFilesHtml(files,urls,scorePreviewButton=()=> ''){
 return files.map(file=>{
  const url=urls.get(file.path);if(!url)return `<div class="notification-attachment"><span data-user-content>${e(file.name)}</span><span class="portal-detail-meta">Attachment unavailable.</span></div>`;
  const download=new URL(url,globalThis.location?.href||'https://example.invalid/');if(download.protocol==='https:')download.searchParams.set('download',file.name);
  return `<div class="notification-attachment">${isPreviewImage(file.type)?`<img src="${e(url)}" alt="${e(file.name)}" loading="lazy">`:''}<a class="portal-attachment" data-user-content href="${e(download.href)}" download="${e(file.name)}" target="_blank" rel="noopener">${e(file.name)} (${(file.size/1024).toFixed(0)} KB)</a>${scorePreviewButton(file.path,file.name,'portal-notification-files')}</div>`;
 }).join('');
}
export async function submitDiscussionReply({body,files,notificationId,author,parentReplyId=null,upload,insert,remove}){
 const chosen=validateNotificationFiles(files),text=String(body||'').trim();
 if(text.length>10000)throw Error('Use at most 10000 characters for the reply.');
 if(!text&&!chosen.length)throw Error('Write a reply or attach a file.');
 const attachments=[];
 try{
  for(const file of chosen){const path=await upload(file);attachments.push({path,name:file.name,type:file.type||'application/octet-stream',size:file.size});}
  await insert({notification_id:notificationId,author,body:text,parent_reply_id:parentReplyId,attachments});
 }catch(error){
  // Storage policy refuses to remove a file if an uncertain insert actually
  // committed and a post/reply now references it.
  if(attachments.length&&remove)await Promise.resolve(remove(attachments.map(file=>file.path))).catch(()=>{});
  throw error;
 }
}
