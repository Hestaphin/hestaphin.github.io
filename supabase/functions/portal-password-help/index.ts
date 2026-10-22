import {createClient} from 'npm:@supabase/supabase-js@2';
const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info','Access-Control-Allow-Methods':'POST,OPTIONS'};
Deno.serve(async req=>{if(req.method==='OPTIONS')return new Response('ok',{headers:cors});try{
 if(req.method!=='POST')throw Error('POST required');const b=await req.json();const email=String(b.email||'').trim().toLowerCase();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254)throw Error('Valid email required');
 const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
 const {data:p,error:profileError}=await db.from('profiles').select('user_id,full_name').eq('email',email).in('role',['admin','internal']).maybeSingle();if(profileError)throw profileError;
 if(p){const day=new Date().toISOString().slice(0,10);const {error}=await db.rpc('portal_admin_event',{p_key:'password:'+p.user_id+':'+day,p_title:'Orchestra password help: '+(p.full_name||email),p_text:'Password assistance was requested for '+email+'. Verify the member identity privately, then use Authentication > Users in Supabase to send a password reset email. This request is not proof of identity.'});if(error)throw error;}
 return Response.json({ok:true,message:'If this orchestra account exists, an urgent mandatory task has been sent to the administrator.'},{headers:cors});
 }catch(e){return Response.json({error:'Could not request assistance. Please try again later.'},{status:400,headers:cors});}});
