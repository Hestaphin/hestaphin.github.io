const unavailable='The login service is temporarily unavailable. Please try again shortly.';
const timedOut='Login timed out. Please try again shortly.';

export async function withLoginDeadline(operation,timeoutMs=35000){
 let timer;
 const expired=new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error(timedOut)),timeoutMs);});
 try{return await Promise.race([Promise.resolve().then(operation),expired]);}
 finally{clearTimeout(timer);}
}

export async function requestOrchestraSession({supabaseUrl,publishableKey,identifier,password,fetcher=fetch,timeoutMs=20000}){
 const controller=new AbortController();let timer;
 const expired=new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(new Error(timedOut));},timeoutMs);});
 const request=async()=>{
  let response;
  try{
   // A new sign-in must not wait for a previous session's token refresh.
   response=await fetcher(new URL('/functions/v1/portal-login',supabaseUrl),{method:'POST',headers:{apikey:publishableKey,'Content-Type':'application/json'},body:JSON.stringify({identifier,password}),signal:controller.signal,cache:'no-store'});
  }catch{throw new Error(controller.signal.aborted?timedOut:'The login service could not be reached. Please try again shortly.');}
  let data;try{data=await response.json();}catch{data={};}
  if(!response.ok){
   const fallback=response.status===401?'Username/email or password is incorrect.':response.status===429?'Too many attempts. Please try again shortly.':unavailable;
   throw Object.assign(new Error(data.error||fallback),{code:data.code||'',status:response.status});
  }
  if(!data.session?.access_token||!data.session.refresh_token)throw new Error('The login session could not be created. Please try again.');
  return data.session;
 };
 try{return await Promise.race([request(),expired]);}finally{clearTimeout(timer);}
}
