export const escapeHTML = v => String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function taskDates(start,end){
 const parse=(v,isEnd)=>{if(!v)throw Error('Choose both dates.');const dateOnly=/^\d{4}-\d{2}-\d{2}$/.test(v);const d=new Date(dateOnly?v+'T00:00:00':v);if(dateOnly&&isEnd)d.setDate(d.getDate()+1);if(!Number.isFinite(+d))throw Error('Invalid date.');return d;};
 const a=parse(start,false),b=parse(end,true);if(b<=a)throw Error('End must be after start.');return[a.toISOString(),b.toISOString()];
}
export function validateImage(file){if(file&&(file.size>=3*1024*1024||!['image/png','image/jpeg','image/webp','image/gif'].includes(file.type)))throw Error('Choose a PNG, JPG, WebP or GIF smaller than 3 MB.');}
export function countdown(end){const h=Math.ceil((new Date(end)-Date.now())/3600000);return h<0?'Overdue':`${Math.floor(h/24)}d ${h%24}h`;}
export const NOTIFICATION_FILE_LIMIT = 5 * 1024 * 1024;
export function validateNotificationFiles(files) {
  const list = Array.from(files || []);
  if (list.length > 8) throw new Error('Choose at most eight attachments.');
  for (const file of list) {
    if (!Number.isFinite(file.size) || file.size <= 0 || file.size >= NOTIFICATION_FILE_LIMIT) throw new Error('Each notification attachment must be smaller than 5 MB and cannot be empty.');
  }
  return list;
}
export const isPreviewImage = type => ['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(type);
