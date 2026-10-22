import {createClient} from 'npm:@supabase/supabase-js@2';
const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info','Access-Control-Allow-Methods':'POST,OPTIONS'};
Deno.serve(async req=>{if(req.method==='OPTIONS')return new Response('ok',{headers:cors});try{
 if(req.method!=='POST')throw Error('POST required');
 const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
 const token=req.headers.get('authorization')?.replace(/^Bearer\s+/i,'')||'';
 const {data:{user},error}=await db.auth.getUser(token);if(error||!user)throw Error('Sign in first');
 const {data:me}=await db.from('profiles').select('role').eq('user_id',user.id).single();if(me?.role!=='admin')throw Error('Administrator required');
 const club=createClient(Deno.env.get('CLUB_SUPABASE_URL')!,Deno.env.get('CLUB_SERVICE_ROLE_KEY')!);const b=await req.json();
 if(b.action==='list'){
  const {data:profiles,error}=await club.from('club_profiles').select('user_id,full_name,email,approval_status').order('created_at');if(error)throw error;
  for(const p of profiles.filter(p=>p.approval_status==='pending')){const {error}=await db.rpc('portal_admin_event',{p_key:'club:'+p.user_id,p_title:'Club registration approval: '+p.full_name,p_text:'Review '+p.email+' in Club approvals. Email confirmation is required before Club access.'});if(error)throw error;}
  return Response.json({profiles},{headers:cors});
 }
 if(b.action!=='decide'||!['approved','rejected'].includes(b.decision))throw Error('Invalid action');
 const {data:p,error:readError}=await club.from('club_profiles').select('approval_status').eq('user_id',b.user_id).single();if(readError||p?.approval_status!=='pending')throw Error('Registration is no longer pending');
 const {error:updateError}=await club.from('club_profiles').update({approval_status:b.decision}).eq('user_id',b.user_id).eq('approval_status','pending');if(updateError)throw updateError;
 return Response.json({ok:true},{headers:cors});
 }catch(e){return Response.json({error:e instanceof Error?e.message:'Request failed'},{status:400,headers:cors});}});
