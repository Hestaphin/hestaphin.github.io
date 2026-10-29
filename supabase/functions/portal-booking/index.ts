import { createClient } from 'npm:@supabase/supabase-js@2.118.0';
import { BOOKING_CATEGORIES,validateClearance,normalizeBookingSlots } from './booking-model.mjs';
import { validateResourceMedia } from './resource-media.mjs';

export function createBookingHandler(makeClient=createClient,env=Deno.env) {
 const get=name=>String(env.get(name)||'').trim();
 const key=()=>{if(get('SUPABASE_SERVICE_ROLE_KEY'))return get('SUPABASE_SERVICE_ROLE_KEY');try{const keys=JSON.parse(get('SUPABASE_SECRET_KEYS')||'{}');return keys.default||Object.values(keys)[0]||'';}catch{return '';}};
 const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info','Access-Control-Allow-Methods':'POST,OPTIONS','Cache-Control':'no-store'};
 const respond=(data,status=200)=>Response.json(data,{status,headers});
 const uuid=value=>typeof value==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value);
 return async req=>{
  if(req.method==='OPTIONS')return new Response('ok',{headers});if(req.method!=='POST')return respond({error:'POST required.'},405);
  try{
   const secret=key();if(!secret)return respond({error:'Booking is temporarily unavailable.'},503);
   const db=makeClient(get('SUPABASE_URL'),secret,{auth:{persistSession:false,autoRefreshToken:false}});
   const {data:auth,error:authError}=await db.auth.getUser(req.headers.get('authorization')?.replace(/^Bearer\s+/i,'')||'');
   if(authError||!auth?.user)return respond({error:'Sign in to your orchestra account again.'},401);
   const {data:member,error:profileError}=await db.from('profiles').select('role').eq('user_id',auth.user.id).maybeSingle();
   if(profileError||!['admin','internal'].includes(member?.role))return respond({error:'An orchestra member account is required.'},403);
   const raw=await req.text();if(new TextEncoder().encode(raw).length>65536)return respond({error:'Request is too large.'},413);
   let body;try{body=JSON.parse(raw);}catch{return respond({error:'Invalid request.'},400);}
   if(body.action==='snapshot'){
    if(!BOOKING_CATEGORIES.includes(body.category))return respond({error:'Choose a booking category.'},400);
    const {data,error}=await db.rpc('portal_booking_snapshot',{p_actor:auth.user.id,p_category:body.category});
    if(error)throw error;return respond(data);
   }
   if(body.action==='save_resource'){
    if(member.role!=='admin')return respond({error:'Administrator required.'},403);
    if((body.resource_id!=null&&!uuid(body.resource_id))||!BOOKING_CATEGORIES.includes(body.category)||typeof body.name!=='string'||!body.name.trim()||body.name.length>120||typeof body.description!=='string'||body.description.length>2000)return respond({error:'Check the resource name and details.'},400);
    let clearance;try{clearance=validateClearance(body.clearance);}catch(error){return respond({error:error.message},400);}
    if(body.resource_id&&!Number.isFinite(Date.parse(body.expected_updated_at)))return respond({error:'Reload the resource settings before saving.'},400);
    const enhanced=Object.hasOwn(body,'resource_code')||Object.hasOwn(body,'images')||Object.hasOwn(body,'attachments');
    let media={};
    if(enhanced){
     if(typeof body.resource_code!=='string'||!body.resource_code.trim()||body.resource_code.trim().length>64)return respond({error:'Enter a resource ID of up to 64 characters.'},400);
     try{media={p_resource_code:body.resource_code.trim(),p_images:validateResourceMedia(body.images||[],true),p_attachments:validateResourceMedia(body.attachments||[])};}catch(error){return respond({error:error.message},400);}
    }
    const {data,error}=await db.rpc(enhanced?'portal_booking_save_resource_v135':'portal_booking_save_resource',{p_actor:auth.user.id,p_id:body.resource_id||null,p_name:body.name.trim(),p_category:body.category,p_description:body.description.trim(),p_clearance:clearance,p_expected_updated_at:body.expected_updated_at||null,...media});
    if(error)throw error;return respond({resource:data});
   }
   if(body.action==='resource_media'){
    if(!uuid(body.resource_id))return respond({error:'Choose a resource.'},400);
    const {data:resource,error}=await db.from('portal_booking_resources').select('images,attachments').eq('id',body.resource_id).maybeSingle();
    if(error)throw error;if(!resource)return respond({error:'The resource is no longer available.'},404);
    const signed=async(file,image)=>{const {data,error}=await db.storage.from('portal-resource-files').createSignedUrl(file.path,300,image?undefined:{download:file.name});if(error)throw error;return {name:file.name,size:file.size,url:data.signedUrl};};
    return respond({images:await Promise.all((resource.images||[]).map(file=>signed(file,true))),attachments:await Promise.all((resource.attachments||[]).map(file=>signed(file,false)))});
   }
   if(body.action==='change_slots'){
    if(!uuid(body.resource_id)||!/^\d{4}-\d{2}-\d{2}$/.test(body.day||'')||!['book','cancel','warning','clear_warning'].includes(body.operation))return respond({error:'Select a resource and times for today.'},400);
    if(['warning','clear_warning'].includes(body.operation)&&member.role!=='admin')return respond({error:'Administrator required.'},403);
    let slots;try{slots=normalizeBookingSlots(body.slots);}catch(error){return respond({error:error.message},400);}
    const {data,error}=await db.rpc('portal_booking_change_slots',{p_actor:auth.user.id,p_resource:body.resource_id,p_day:body.day,p_slots:slots,p_action:body.operation});
    if(error)throw error;return respond(data);
   }
   return respond({error:'Invalid booking action.'},400);
  }catch(error){
   const messages={BOOKING_MEMBER_REQUIRED:'An orchestra member account is required.',BOOKING_ADMIN_REQUIRED:'Administrator required.',BOOKING_TODAY_ONLY:'Only today can be booked. Refresh the schedule.',BOOKING_ELAPSED:'Elapsed time cells cannot be booked.',BOOKING_CLEARANCE:'You do not have clearance to book this resource.',BOOKING_CONFLICT:'Some selected cells were booked by another member. Refresh and choose free cells.',BOOKING_WARNING:'Warning periods cannot be booked.',BOOKING_OWN_ONLY:'You can cancel only cells that you booked.',BOOKING_WARNING_ONLY:'Select warning cells to clear.',BOOKING_RESOURCE_CHANGED:'This resource was changed by another administrator. Reload its settings.',BOOKING_RESOURCE_MISSING:'The resource is no longer available.',BOOKING_BAD_CLEARANCE:'Check the booking clearance settings.'};
   for(const [code,message]of Object.entries(messages))if(String(error.message||'').includes(code))return respond({error:message,code},code.includes('REQUIRED')||code==='BOOKING_CLEARANCE'?403:409);
   if(String(error.message||'').includes('BOOKING_BAD_MEDIA'))return respond({error:'Check the resource files. New files must be your own uploads, no larger than 10 MB each.'},400);
   if(error.code==='23505')return respond({error:String(error.message||'').includes('resource_code')?'This resource ID is already used.':'A resource with this name already exists in this category.'},409);
   console.error('portal-booking',error.code||'DATABASE');return respond({error:'Booking could not be updated. Please refresh and try again.'},503);
  }
 };
}
Deno.serve(createBookingHandler());
