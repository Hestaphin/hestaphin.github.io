import {createClient} from 'npm:@supabase/supabase-js@2.118.0';
import {validateUniformItem,validateUniformFilters} from './uniform-model.mjs';
export function createMaterialHandler(makeClient=createClient,env=Deno.env){
 const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info','Access-Control-Allow-Methods':'POST,OPTIONS','Cache-Control':'no-store'},respond=(data,status=200)=>Response.json(data,{status,headers}),uuid=v=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(v);
 return async req=>{
  if(req.method==='OPTIONS')return new Response('ok',{headers});if(req.method!=='POST')return respond({error:'POST required.'},405);
  try{
   const secret=env.get('SUPABASE_SERVICE_ROLE_KEY');if(!secret)return respond({error:'Uniform service is temporarily unavailable.'},503);
   const db=makeClient(env.get('SUPABASE_URL'),secret,{auth:{persistSession:false,autoRefreshToken:false}}),{data:auth,error:authError}=await db.auth.getUser(req.headers.get('authorization')?.replace(/^Bearer\s+/i,'')||'');
   if(authError||!auth?.user)return respond({error:'Sign in to your orchestra account again.'},401);
   const {data:member,error}=await db.from('profiles').select('role').eq('user_id',auth.user.id).maybeSingle();if(error||!['admin','internal'].includes(member?.role))return respond({error:'An orchestra member account is required.'},403);
   const raw=await req.text();if(new TextEncoder().encode(raw).length>131072)return respond({error:'Request is too large.'},413);
   let body;try{body=JSON.parse(raw);}catch{return respond({error:'Invalid request.'},400);}if(!body||Array.isArray(body)||typeof body!=='object')return respond({error:'Invalid request.'},400);
   const actor={p_actor:auth.user.id};let rpc,args;
   const adminActions=['save_category','save_item','save_template','archive','reviews','decide','ready','issue'];if(adminActions.includes(body.action)&&member.role!=='admin')return respond({error:'Administrator required.'},403);
   const expected=()=>{if(body.id&&!Number.isFinite(Date.parse(body.expected_updated_at)))throw Error('Reload the uniform data before saving.');};
   if(body.action==='snapshot'){rpc='portal_uniform_snapshot';args=actor;}
   else if(body.action==='save_category'){
    if(body.id!=null&&!uuid(body.id)||typeof body.name!=='string'||!body.name.trim()||body.name.trim().length>80)return respond({error:'Enter a uniform classification name.'},400);expected();rpc='portal_uniform_save_category';args={...actor,p_id:body.id||null,p_name:body.name.trim(),p_expected:body.expected_updated_at||null};
   }else if(body.action==='save_item'){
    if(body.id!=null&&!uuid(body.id)||!uuid(body.category_id))return respond({error:'Choose a uniform classification.'},400);
    const item=validateUniformItem(body);expected();const image=body.image||null;
    if(image&&(!uuid(String(image.path||'').split('/')[0])||!/^[-a-f0-9]{36}\/[-a-f0-9]{36}\/[\w.\-]+$/i.test(image.path)||!['image/png','image/jpeg','image/webp','image/gif'].includes(image.type)||!Number.isSafeInteger(image.size)||image.size<1||image.size>10485760||typeof image.name!=='string'||!image.name.trim()||image.name.length>255))return respond({error:'Choose one PNG, JPG, WebP or GIF image, up to 10 MB.'},400);
    rpc='portal_uniform_save_item';args={...actor,p_id:body.id||null,p_category:body.category_id,p_name:item.name,p_measurements:item.measurements,p_sizes:item.sizes,p_image:image,p_expected:body.expected_updated_at||null};
   }else if(body.action==='save_template'){
    if(body.id!=null&&!uuid(body.id)||typeof body.name!=='string'||!body.name.trim()||body.name.trim().length>100||!Number.isInteger(body.priority)||Math.abs(body.priority)>1000||!Array.isArray(body.item_ids)||!body.item_ids.length||body.item_ids.length>200||body.item_ids.some(id=>!uuid(id)))return respond({error:'Check the template name, priority and selected types.'},400);
    expected();rpc='portal_uniform_save_template';args={...actor,p_id:body.id||null,p_name:body.name.trim(),p_filters:validateUniformFilters(body.filters),p_priority:body.priority,p_items:[...new Set(body.item_ids)],p_expected:body.expected_updated_at||null};
   }else if(body.action==='archive'){
    if(!uuid(body.id)||!['category','item','template'].includes(body.kind))return respond({error:'Choose a uniform record.'},400);expected();rpc='portal_uniform_archive';args={...actor,p_kind:body.kind,p_id:body.id,p_expected:body.expected_updated_at};
   }else if(body.action==='submit'){
    if(!uuid(body.request_id)||!Array.isArray(body.lines)||!body.lines.length||body.lines.length>20||body.lines.some(l=>!l||!uuid(l.item_id)||!['new','exchange'].includes(l.mode)||typeof l.size!=='string'||!l.size.trim()||l.size.length>30||typeof l.reason!=='string'||!l.reason.trim()||l.reason.length>2000))return respond({error:'Complete every uniform application line and its reason.'},400);
    rpc='portal_uniform_submit';args={...actor,p_request:body.request_id,p_lines:body.lines.map(({item_id,mode,size,reason})=>({item_id,mode,size,reason:reason.trim()}))};
   }else if(body.action==='reviews'){
    if(body.request_id!=null&&!uuid(body.request_id))return respond({error:'Choose an application.'},400);rpc='portal_uniform_reviews';args={...actor,p_request:body.request_id||null};
   }else if(body.action==='decide'){
    if(!uuid(body.line_id)||!['approved','rejected'].includes(body.decision)||typeof body.note!=='string'||body.note.length>2000)return respond({error:'Choose an approval or rejection.'},400);rpc='portal_uniform_decide';args={...actor,p_line:body.line_id,p_decision:body.decision,p_note:body.note.trim()};
   }else if(body.action==='ready'){rpc='portal_uniform_ready';args=actor;}
   else if(body.action==='issue'){
    if(!uuid(body.user_id)||!uuid(body.category_id)||!Number.isFinite(Date.parse(body.expected_updated_at)))return respond({error:'Reload the ready-to-collect record.'},400);rpc='portal_uniform_issue';args={...actor,p_user:body.user_id,p_category:body.category_id,p_expected:body.expected_updated_at};
   }else return respond({error:'Invalid material action.'},400);
   const result=await db.rpc(rpc,args);if(result.error)throw result.error;
   // Sign only image paths retrieved from checked records, never a caller-supplied path.
   if(['snapshot','reviews','ready'].includes(body.action)){
    const cache=new Map();async function signed(v){if(!v||typeof v!=='object')return v;if(Array.isArray(v))return Promise.all(v.map(signed));const out={...v};if(v.image?.path){const path=v.image.path;if(!cache.has(path))cache.set(path,db.storage.from('portal-resource-files').createSignedUrl(path,300));const r=await cache.get(path);if(!r.error&&r.data?.signedUrl)out.image={...v.image,url:r.data.signedUrl};}
     for(const k of ['items','holdings','requests','lines','item_snapshot','previous_record'])if(out[k])out[k]=await signed(out[k]);return out;}
    return respond(await signed(result.data));
   }
   return respond(result.data||{ok:true});
  }catch(error){
   const messages={UNIFORM_MEMBER_REQUIRED:'An orchestra member account is required.',UNIFORM_ADMIN_REQUIRED:'Administrator required.',UNIFORM_CHANGED:'This record changed. Refresh it before saving.',UNIFORM_BAD_CATALOGUE:'Check the uniform classification or type.',UNIFORM_BAD_SIZES:'Fill every measurement for every size, using distinct size and measurement names.',UNIFORM_BAD_TEMPLATE:'Check the template groups and selected uniform types.',UNIFORM_NOT_ELIGIBLE:'This uniform type is not assigned to your current member group.',UNIFORM_BAD_SIZE:'Choose a listed size for this uniform type.',UNIFORM_PENDING:'An application for this classification is already pending.',UNIFORM_BAD_MODE:'New applications require no current record; exchanges require an issued uniform.',UNIFORM_BAD_APPLICATION:'Complete every application line and reason.',UNIFORM_NO_ADMIN:'No administrator is available to review applications.',UNIFORM_REQUEST_CHANGED:'This application request was already used. Start a new application.',UNIFORM_BAD_DECISION:'Choose an approval or rejection.',UNIFORM_MISSING:'The uniform record is no longer available.',UNIFORM_DECIDED:'Another administrator has already decided this line.',BOOKING_BAD_MEDIA:'The preview image must be an existing permitted upload, up to 10 MB.'};
   for(const [code,message]of Object.entries(messages))if(String(error.message||'').includes(code))return respond({error:message,code},code.includes('REQUIRED')||code==='UNIFORM_NOT_ELIGIBLE'?403:409);
   if(error.code==='23505')return respond({error:'This classification, type or pending application already exists. Refresh and try again.'},409);
   if(!error.code&&/^(Enter|Use|Add|Give|Fill|Check|Reload)/.test(error.message||''))return respond({error:error.message},400);
   console.error('portal-material',error.code||'DATABASE');return respond({error:'Uniform data could not be updated. Please refresh and try again.'},503);
  }
 };
}
Deno.serve(createMaterialHandler());
