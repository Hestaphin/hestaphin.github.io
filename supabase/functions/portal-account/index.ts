import { createClient } from 'npm:@supabase/supabase-js@2.118.0';
// Standalone Dashboard deployment; catalogue matches portal/member-fields.mjs.
const DEPARTMENTS = ['Orchestra','Windband','Choir','Keyboard','Transportation','Safety & Security','Internal affairs','Medic','Scientific research','Special operation','Investigation & Statistics','Intelligence','Editorial board','Logistics & support'];
const OCCUPATIONS = {Orchestra:['orchestra-strings','orchestra-woodwind','orchestra-brasswind','percussion'],Windband:['windband-woodwind','windband-brasswind','percussion'],Choir:['soprano','mezzo-soprano','alto','tenor','bass'],Keyboard:['none']};
const INSTRUMENTS = {
 'orchestra-strings':['Violin','Viola','Cello','Contrabass'],
 woodwind:['Flute','Clarinet','Oboe','English horn','Saxophone','Bassoon'],
 brasswind:['Trumpet','French horn','Trombone','Tenor horn','Baritone','Tuba'],
 percussion:['Timpani','Cymbals','Snare drum','Bass drum'],
 none:['Piano','Harpsichord','Accordion']
};
const CLASSIFICATIONS = ['enlist','officer','instructor','civilian'];
const RANKS = {
 enlist:['Trainee','Private','Private First Class','Corporal','Sergeant','Staff Sergeant','Third Sergeant Major','Second Sergeant Major','First Sergeant Major'],
 officer:['Cadet','Second Lieutenant','First Lieutenant','Captain','Major','Lieutenant Colonel','Colonel','Major General','Lieutenant General','General'],
 civilian:['Level 3 Junior Staff','Level 2 Junior Staff','Level 1 Junior Staff','Level 3 Intermediate Staff','Level 2 Intermediate Staff','Level 1 Intermediate Staff','Level 3 Senior Staff','Level 2 Senior Staff','Level 1 Senior Staff'],
 instructor:['Junior instructor','Intermediate instructor','Senior instructor']
};
const MEMBER_STATUSES=['active','reserve','probationary','retired'];
const occupationsFor=department=>OCCUPATIONS[department]||(DEPARTMENTS.includes(department)?['other']:[]);
const instrumentsFor=occupation=>INSTRUMENTS[occupation]||INSTRUMENTS[String(occupation).split('-').at(-1)]||[];
const titleCase=value=>value?value[0].toUpperCase()+value.slice(1):'Not assigned';
function validateMember(input,{creating=false}={}) {
 const text=n=>String(input[n]??'').trim();
 const member={full_name:text('full_name'),email:text('email').toLowerCase()||null,username:text('username').toLowerCase()||null,department:text('department')||null,occupation_type:text('occupation_type')||null,instrument:text('instrument')||null,classification:text('classification')||null,rank:text('rank')||null,member_status:text('member_status')||'active'};
 if(!member.full_name||member.full_name.length>120)throw Error('Enter a name of at most 120 characters.');
 if(member.email&&(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(member.email)||member.email.length>254||member.email.endsWith('@accounts.pkuco.invalid')))throw Error('Enter a valid email address.');
 if(!member.email&&!member.username)throw Error('A username is required when email is blank.');
 if((creating&&!member.username)||(member.username&&!/^[a-z0-9][a-z0-9._-]{2,39}$/.test(member.username)))throw Error('Username must have 3–40 letters, numbers, dots, underscores or hyphens, and start with a letter or number.');
 if(creating&&!member.department)throw Error('Choose a department.');
 if(member.department&&!DEPARTMENTS.includes(member.department))throw Error('Choose a listed department.');
 if(member.department){if(!occupationsFor(member.department).includes(member.occupation_type))throw Error('Choose an occupation for this department.');const allowed=instrumentsFor(member.occupation_type);if(allowed.length?!allowed.includes(member.instrument):member.instrument!==null)throw Error('Choose an instrument for this occupation, or None for other occupations.');}
 else if(member.occupation_type||member.instrument)throw Error('Choose the department before its occupation and instrument.');
 if((creating&&!member.classification)||(member.classification&&!CLASSIFICATIONS.includes(member.classification)))throw Error('Choose a classification.');
 if(member.classification?!RANKS[member.classification].includes(member.rank):Boolean(member.rank))throw Error('Choose a rank for this classification.');
 if(['Trainee','Cadet'].includes(member.rank))member.member_status='probationary';
 if(!MEMBER_STATUSES.includes(member.member_status))throw Error('Choose a listed member status.');
 return member;
}


export function createPortalAccountHandler(makeClient=createClient,env=Deno.env) {
 const get=n=>String(env.get(n)||'').trim();
 const key=()=>{if(get('SUPABASE_SERVICE_ROLE_KEY'))return get('SUPABASE_SERVICE_ROLE_KEY');try{const k=JSON.parse(get('SUPABASE_SECRET_KEYS')||'{}');return k.default||Object.values(k)[0];}catch{return '';}};
 const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info','Access-Control-Allow-Methods':'POST,OPTIONS','Cache-Control':'no-store'};
 const respond=(body,status=200)=>Response.json(body,{status,headers});
 return async req=>{
  if(req.method==='OPTIONS')return new Response('ok',{headers});
  if(req.method!=='POST')return respond({error:'POST required.'},405);
  try {
   const db=makeClient(get('SUPABASE_URL'),key(),{auth:{persistSession:false,autoRefreshToken:false}});
   const session=await db.auth.getUser(req.headers.get('authorization')?.replace(/^Bearer\s+/i,'')||'');
   if(session.error||!session.data?.user)return respond({error:'Sign in again.',code:'SESSION_EXPIRED'},401);
   const mine=await db.from('profiles').select('role').eq('user_id',session.data.user.id).single();
   if(mine.error||mine.data?.role!=='admin')return respond({error:'Administrator required.',code:'ADMIN_REQUIRED'},403);
   const raw=await req.text();if(raw.length>8192)return respond({error:'Request is too large.'},400);
   const body=JSON.parse(raw);
   if(body.action!=='update_member'||!/^[a-f0-9-]{36}$/i.test(body.user_id||''))return respond({error:'Invalid member update.'},400);
   const current=await db.from('profiles').select('*').eq('user_id',body.user_id).in('role',['admin','internal']).single();
   if(current.error||!current.data)return respond({error:'Orchestra member not found.'},404);
   const member=validateMember({...current.data,...body.member});
   if(member.username){const duplicate=await db.from('profiles').select('user_id').eq('username',member.username).neq('user_id',body.user_id).maybeSingle();if(duplicate.error)throw duplicate.error;if(duplicate.data)return respond({error:'This username is already in use.',code:'USERNAME_TAKEN'},409);}
   if(!member.email&&(current.data.email||current.data.role!=='internal'))throw Error('Enter a valid email address.');
   const emailChanged=member.email!==((current.data.email||'').toLowerCase()||null);
   if(emailChanged){const change=await db.auth.admin.updateUserById(body.user_id,{email:member.email,email_confirm:true});if(change.error)throw change.error;}
   const {email,...fields}=member;
   const saved=await db.from('profiles').update(fields).eq('user_id',body.user_id).select('*').single();
   if(saved.error){if(emailChanged)return respond({error:'The email was updated, but the other fields could not be saved. Refresh and retry those fields.',code:'PROFILE_PARTIAL'},409);throw saved.error;}
   return respond({ok:true,member:saved.data});
  }catch(error){const status=error.code==='23505'?409:400;return respond({error:error.code==='23505'?'This username or email is already in use.':error.message||'Member update failed.'},status);}
 };
}
Deno.serve(createPortalAccountHandler());
