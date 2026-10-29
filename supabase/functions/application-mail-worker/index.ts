import { createClient } from 'npm:@supabase/supabase-js@2.118.0';
import { processApplicationMailQueue } from './application-mail.mjs';
export function createApplicationMailWorker(makeClient=createClient,env=Deno.env,processQueue=processApplicationMailQueue) {
 const get=name=>String(env.get(name)||'').trim();
 const key=()=>{if(get('SUPABASE_SERVICE_ROLE_KEY'))return get('SUPABASE_SERVICE_ROLE_KEY');try{const keys=JSON.parse(get('SUPABASE_SECRET_KEYS')||'{}');return keys.default||Object.values(keys)[0]||'';}catch{return '';}};
 return async req=>{
  const headers={'Cache-Control':'no-store'};
  if(req.method!=='POST')return Response.json({error:'POST required.'},{status:405,headers});
  const supplied=req.headers.get('x-copku-mail-worker')||'';if(!/^[a-f0-9]{64}$/.test(supplied))return Response.json({error:'Unauthorized.'},{status:401,headers});
  try{
   const db=makeClient(get('SUPABASE_URL'),key(),{auth:{persistSession:false,autoRefreshToken:false}}),expected=await db.rpc('portal_application_mail_worker_token');
   if(expected.error||typeof expected.data!=='string'||expected.data.length!==supplied.length)return Response.json({error:'Unauthorized.'},{status:401,headers});
   let mismatch=0;for(let i=0;i<supplied.length;i++)mismatch|=supplied.charCodeAt(i)^expected.data.charCodeAt(i);if(mismatch)return Response.json({error:'Unauthorized.'},{status:401,headers});
   return Response.json(await processQueue(db,env),{headers});
  }catch{console.error('application-mail-worker','PROCESS_FAILED');return Response.json({error:'The confirmation queue could not be processed.'},{status:503,headers});}
 };
}
Deno.serve(createApplicationMailWorker());
