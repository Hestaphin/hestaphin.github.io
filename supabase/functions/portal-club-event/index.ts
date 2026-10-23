import {createClient} from 'npm:@supabase/supabase-js@2';
Deno.serve(async req=>{try{
 const secret=Deno.env.get('PORTAL_BRIDGE_SECRET');if(req.method!=='POST'||!secret||req.headers.get('x-portal-secret')!==secret)return new Response('Unauthorized',{status:401});
 const b=await req.json();const id=b.record?.user_id;if(!id)throw Error('Missing user');
 const club=createClient(Deno.env.get('CLUB_SUPABASE_URL')!,Deno.env.get('CLUB_SERVICE_ROLE_KEY')!);
 const {data:p,error}=await club.from('club_profiles').select('*').eq('user_id',id).single();if(error)throw error;
 if(p.approval_status==='pending'){
 const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
 const {error}=await db.rpc('portal_admin_event',{p_key:'club:'+p.user_id,p_title:'Club registration approval: '+p.full_name,p_text:'Review '+p.email+' in Club approvals. Email verification is required before access.'});if(error)throw error;}
 return Response.json({ok:true});
 }catch(e){return Response.json({error:e instanceof Error?e.message:'Failed'},{status:400});}});
