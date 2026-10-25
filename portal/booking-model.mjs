export const BOOKING_CATEGORIES=['Room','Instrument','Equipment','Transportation'];
export const BOOKING_FILTER_FIELDS=['department','occupation_type','instrument','classification','rank','member_status'];
export const BOOKING_TIMEZONE='Asia/Shanghai';
export function bookingClock(value=new Date()) {
 const parts=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:BOOKING_TIMEZONE,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(value)).map(p=>[p.type,p.value]));
 return {day:`${parts.year}-${parts.month}-${parts.day}`,minute:Number(parts.hour)*60+Number(parts.minute)};
}
export const slotTime=index=>`${String(Math.floor(index/6)).padStart(2,'0')}:${String(index%6*10).padStart(2,'0')}`;
export const slotRangeText=range=>range?`${slotTime(range.start)}–${slotTime(range.end)}`:'—';
export function slotRanges(slots=[]) {
 const rows=[...slots].sort((a,b)=>a.slot_index-b.slot_index),ranges=[];
 for(const row of rows){const previous=ranges.at(-1);if(previous&&previous.end===row.slot_index&&previous.kind===row.kind&&previous.user_id===row.user_id)previous.end++;else ranges.push({start:row.slot_index,end:row.slot_index+1,kind:row.kind,user_id:row.user_id||null});}
 return ranges;
}
export function bookingSummary(slots,minute) {
 const ranges=slotRanges(slots),index=Math.floor(minute/10),current=ranges.find(r=>r.start<=index&&r.end>index);
 return {status:current?.kind==='warning'?'warning':current?'occupied':'clear',current:current?.kind==='booked'?current:null,next:ranges.find(r=>r.kind==='booked'&&r.start*10>minute)||null,user_id:current?.kind==='booked'?current.user_id:null};
}
export function validateClearance(input={mode:'all'}) {
 if(!['all','restricted','admin'].includes(input.mode))throw Error('Choose who can book this resource.');
 const clearance={mode:input.mode,filters:Object.fromEntries(BOOKING_FILTER_FIELDS.map(key=>[key,[]])),member_ids:[]};
 if(input.mode!=='restricted')return clearance;
 for(const key of BOOKING_FILTER_FIELDS){const values=input.filters?.[key]||[];if(!Array.isArray(values)||values.length>100||values.some(v=>typeof v!=='string'||v.length>120))throw Error('Invalid booking clearance.');clearance.filters[key]=[...new Set(values)];}
 if(!Array.isArray(input.member_ids||[])||(input.member_ids||[]).length>500||(input.member_ids||[]).some(v=>!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(v)))throw Error('Choose listed members for booking clearance.');
 clearance.member_ids=[...new Set(input.member_ids||[])];
 if(!clearance.member_ids.length&&!BOOKING_FILTER_FIELDS.some(key=>clearance.filters[key].length))throw Error('Choose at least one clearance filter, or allow all members.');
 return clearance;
}
export function canBookResource(resource,member) {
 if(member?.role==='admin')return true;if(member?.role!=='internal')return false;
 const clearance=resource.clearance||{mode:'all'};
 if(clearance.mode==='all')return true;if(clearance.mode!=='restricted')return false;
 return (!clearance.member_ids?.length||clearance.member_ids.includes(member.user_id))&&BOOKING_FILTER_FIELDS.every(key=>!clearance.filters?.[key]?.length||clearance.filters[key].includes(member[key]||''));
}
export function normalizeBookingSlots(input) {
 if(!Array.isArray(input)||!input.length||input.length>144||input.some(value=>!Number.isInteger(value)||value<0||value>143))throw Error('Select one or more 10-minute cells for today.');
 return [...new Set(input)].sort((a,b)=>a-b);
}
