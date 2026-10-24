import { createClient } from 'npm:@supabase/supabase-js@2.118.0';

// Keep this file self-contained for the Supabase Dashboard editor.
export function createPortalAdminHandler(makeClient = createClient, env = Deno.env) {
  const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization,apikey,content-type,x-client-info', 'Access-Control-Allow-Methods': 'POST,OPTIONS', 'Cache-Control': 'no-store' };
  const clean = value => String(value || '').trim().replace(/^(['"])(.*)\1$/, '$2');
  const secret = (...names) => names.map(n => clean(env.get(n))).find(Boolean) || '';
  const fail = (code, message, status = 503) => Object.assign(new Error(message), { code, status });
  function orchestraKey() {
    const legacy = secret('SUPABASE_SERVICE_ROLE_KEY');
    if (legacy) return legacy;
    try { const keys = JSON.parse(env.get('SUPABASE_SECRET_KEYS') || '{}'); return clean(keys.default || Object.values(keys)[0]); } catch { return ''; }
  }
  const respond = (body, status = 200) => Response.json(body, { status, headers: cors });
  function clubClient() {
    const url = secret('CLUB_SUPABASE_URL');
    const key = secret('CLUB_SERVICE_ROLE_KEY', 'CLUB_SUPABASE_SECRET_KEY', 'CLUB_SECRET_KEY');
    if (!url) throw fail('CLUB_URL_MISSING', 'Add CLUB_SUPABASE_URL to the Orchestra project’s Edge Function Secrets. Use the separate Club project URL.');
    try { if (new URL(url).protocol !== 'https:') throw Error(); } catch { throw fail('CLUB_URL_INVALID', 'CLUB_SUPABASE_URL must be the Club HTTPS project URL, without extra spaces or text.'); }
    if (url.replace(/\/$/, '') === secret('SUPABASE_URL').replace(/\/$/, '')) throw fail('CLUB_PROJECT_MISMATCH', 'CLUB_SUPABASE_URL points to the Orchestra project. Set it to the separate Club project URL.');
    if (!key || /^sb_publishable_/i.test(key)) throw fail('CLUB_KEY_MISSING', 'Set CLUB_SERVICE_ROLE_KEY in the Orchestra project’s Edge Function Secrets to the Club secret key or legacy service_role key.');
    if (key.startsWith('eyJ')) {
      try { if (JSON.parse(atob(key.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).role !== 'service_role') throw Error(); }
      catch { throw fail('CLUB_KEY_INVALID', 'CLUB_SERVICE_ROLE_KEY must be a Club secret key or service_role key. The Club publishable/anon key cannot review applications.'); }
    }
    return makeClient(url.replace(/\/$/, ''), key, { auth: { persistSession: false, autoRefreshToken: false } });
  }
  function clubReadError(error) {
    if (/approval_status|42703|PGRST204/.test(String(error?.code) + ' ' + error?.message)) return fail('CLUB_APPROVAL_SCHEMA', 'The Club database is missing approval_status. Run supabase/club/migrations/202610230003_club_approval_repair.sql in the Club project, then retry.');
    if (/club_profiles|42P01/.test(String(error?.code) + ' ' + error?.message)) return fail('CLUB_PROFILE_SCHEMA', 'The connected project does not have club_profiles. Check CLUB_SUPABASE_URL and run the Club base migration in the Club project.');
    if (/invalid.*key|invalid.*jwt|unauthorized|permission denied/i.test(error?.message || '') || ['401','403'].includes(String(error?.status))) return fail('CLUB_AUTH_FAILED', 'The Club project rejected its server key. Check that CLUB_SERVICE_ROLE_KEY belongs to the same project as CLUB_SUPABASE_URL.');
    return fail('CLUB_READ_FAILED', 'Could not read Club applications. Check the Club URL/server key and the latest portal-admin function log.');
  }
  return async req => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
    try {
      if (req.method !== 'POST') return respond({ error: 'POST required.', code: 'METHOD' }, 405);
      const key = orchestraKey();
      if (!key) throw fail('ORCHESTRA_KEY_MISSING', 'The Orchestra function has no server key. Check its built-in Supabase environment keys.');
      const db = makeClient(secret('SUPABASE_URL'), key, { auth: { persistSession: false, autoRefreshToken: false } });
      const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') || '';
      const auth = await db.auth.getUser(token);
      if (auth.error || !auth.data?.user) throw fail('SESSION_EXPIRED', 'Your Orchestra session could not be verified. Sign out and sign in again.', 401);
      const { data: me, error: profileError } = await db.from('profiles').select('role').eq('user_id', auth.data.user.id).single();
      if (profileError || me?.role !== 'admin') throw fail('ADMIN_REQUIRED', 'Your Orchestra profile must have the admin role to review Club registrations.', 403);
      let body; try { body = await req.json(); } catch { throw fail('BAD_REQUEST', 'Invalid request.', 400); }
      if (body.action === 'shop_orders') {
        const { data: orders, error } = await db.from('shop_orders').select('*').order('created_at', { ascending: false }).limit(200);
        if (error) throw fail('SHOP_SCHEMA', 'Shop orders are unavailable. Run supabase/shop/01_shop_orders.sql in the Orchestra project.');
        const pending=await db.from('shop_refund_requests').select('order_id').eq('state','processing');
        if(pending.error)throw fail('SHOP_REFUND_SCHEMA','Shop refunds are unavailable. Run supabase/shop/02_shop_refunds_v125.sql.');
        return respond({ orders:orders.map(o=>({...o,refund_processing:pending.data.some(r=>r.order_id===o.id)})) });
      }
      if(body.action==='shop_order') {
        if(!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(body.order_id||''))throw fail('BAD_ORDER','Invalid order.',400);
        const {data:order,error}=await db.from('shop_orders').select('*').eq('id',body.order_id).maybeSingle();
        if(error)throw fail('SHOP_ORDER_READ','This order could not be loaded.');
        if(!order)throw fail('ORDER_NOT_FOUND','Order not found.',404);
        const refunds=await db.from('shop_refunds').select('*').eq('order_id',order.id).order('created_at',{ascending:false});
        const pending=await db.from('shop_refund_requests').select('request_id').eq('order_id',order.id).eq('state','processing');
        if(refunds.error||pending.error)throw fail('SHOP_ORDER_READ','The refund history could not be loaded.');
        return respond({order:{...order,refund_processing:Boolean(pending.data.length)},refunds:refunds.data});
      }
      if (body.action === 'fulfill_order') {
        const {data,error}=await db.rpc('shop_mark_delivered',{p_order:body.order_id,p_actor:auth.data.user.id});
        if(error)throw fail('SHOP_FULFILL_FAILED','This order could not be marked delivered.');
        if(!data)throw fail('ORDER_NOT_READY','This order is unpaid, refunded, awaiting a refund, missing or already delivered.',409);
        return respond({ ok: true });
      }
      const uuid=value=>/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value||'');
      const offset=Number(body.offset||0);
      if(!Number.isInteger(offset)||offset<0||offset>1000000)throw fail('BAD_PAGE','Invalid page.',400);
      if(body.action==='orchestra_applications') {
        if(!['all','pending','reviewing','accepted','rejected'].includes(body.status||'all'))throw fail('BAD_STATUS','Invalid application status.',400);
        let query=db.from('orchestra_applications').select('id,application_no,full_name,email,institution,sections,review_status,created_at',{count:'exact'}).order('created_at',{ascending:false}).range(offset,offset+49);
        if(body.status&&body.status!=='all')query=query.eq('review_status',body.status);
        const {data:applications,error,count}=await query;
        if(error)throw fail('APPLICATION_READ_FAILED','Orchestra applications could not be loaded.');
        return respond({applications,total:count,offset,page_size:50});
      }
      if(body.action==='orchestra_application') {
        if(!uuid(body.application_id))throw fail('BAD_APPLICATION','Invalid application.',400);
        const {data:application,error}=await db.from('orchestra_applications').select('*').eq('id',body.application_id).maybeSingle();
        if(error)throw fail('APPLICATION_READ_FAILED','This application could not be loaded.');
        if(!application)throw fail('APPLICATION_NOT_FOUND','Application not found.',404);
        return respond({application});
      }
      if(body.action==='review_orchestra_application') {
        if(!uuid(body.application_id)||!['pending','reviewing','accepted','rejected'].includes(body.status)||!['pending','reviewing','accepted','rejected'].includes(body.expected_status)||typeof body.admin_notes!=='string'||body.admin_notes.length>4000)throw fail('BAD_APPLICATION','Check the application status and notes.',400);
        if(body.expected_reviewed_at!==null&&!Number.isFinite(Date.parse(body.expected_reviewed_at)))throw fail('BAD_APPLICATION','Refresh this application before saving.',400);
        let query=db.from('orchestra_applications').update({review_status:body.status,admin_notes:body.admin_notes.trim(),reviewed_by:auth.data.user.id,reviewed_at:new Date().toISOString()}).eq('id',body.application_id).eq('review_status',body.expected_status);
        query=body.expected_reviewed_at===null?query.is('reviewed_at',null):query.eq('reviewed_at',body.expected_reviewed_at);
        const {data,error}=await query.select('id').maybeSingle();
        if(error)throw fail('APPLICATION_SAVE_FAILED','The review could not be saved.');
        if(!data)throw fail('APPLICATION_CHANGED','Another administrator changed this application. Refresh before saving.',409);
        return respond({ok:true});
      }
      const club = clubClient();
      if (body.action === 'list' || body.action === 'diagnose') {
        if(!['all','pending','approved','rejected','suspended','revoked'].includes(body.status||'all'))throw fail('BAD_STATUS','Invalid registration status.',400);
        let query=club.from('club_profiles').select('user_id,full_name,email,approval_status,membership_tier,membership_status,registration_status_at,created_at',{count:'exact'}).order('created_at',{ascending:false}).range(offset,offset+49);
        if(body.status&&body.status!=='all')query=query.eq('approval_status',body.status);
        const { data: profiles, error, count } = await query;
        if (error) throw clubReadError(error);
        const warnings = [], verifiedProfiles = [];
        for (const p of profiles || []) {
          let email_verified;
          if (p.approval_status === 'pending') {
            const check = await club.auth.admin.getUserById(p.user_id);
            if (!check.error) email_verified = Boolean(check.data.user?.email_confirmed_at);
            const event = await db.rpc('portal_admin_event', { p_key: 'club:' + p.user_id, p_title: 'Club registration approval: ' + p.full_name, p_text: 'Review ' + p.email + ' in Club approvals. Email verification is required before access.' });
            if (event.error && !warnings.length) warnings.push('Applications are available, but admin task reminders could not be created. Check the portal database setup.');
          }
          if (['approved','rejected'].includes(p.approval_status)) {
            const resolved = await db.rpc('portal_resolve_club_task', {p_user:p.user_id,p_decision:p.approval_status,p_email:p.email});
            if(resolved.error&&!warnings.length)warnings.push('A decision is saved, but its task could not synchronize.');
          }
          verifiedProfiles.push({ ...p, ...(email_verified === undefined ? {} : { email_verified }) });
        }
        return respond({ profiles: verifiedProfiles, warnings, total:count,offset,page_size:50,connection:{ok:true} });
      }
      if(body.action==='club_registration_history') {
        if(!uuid(body.user_id))throw fail('BAD_REGISTRATION','Invalid registration.',400);
        const {data:events,error}=await club.from('club_registration_events').select('previous_status,status,created_at').eq('user_id',body.user_id).order('created_at',{ascending:false}).limit(200);
        if(error)throw fail('CLUB_HISTORY_READ','Registration history could not be loaded.');
        return respond({events});
      }
      const action=body.action==='decide'?body.decision:body.operation;
      if(!['decide','manage_registration'].includes(body.action)||!['approved','rejected','suspend','resume','revoke'].includes(action)||!uuid(body.user_id))throw fail('BAD_ACTION','Invalid registration action.',400);
      if(body.action==='decide'&&!['approved','rejected'].includes(action))throw fail('BAD_ACTION','An approval decision is required.',400);
      if(body.action==='manage_registration'&&!['suspend','resume','revoke'].includes(action))throw fail('BAD_ACTION','Invalid registration action.',400);
      const { data: profile, error: readError } = await club.from('club_profiles').select('approval_status,email').eq('user_id', body.user_id).maybeSingle();
      if (readError) throw clubReadError(readError);
      if(!profile)throw fail('REGISTRATION_NOT_FOUND','Registration not found.',404);
      const expected=body.action==='decide'?'pending':body.expected_status;
      if(!expected||profile.approval_status!==expected)throw fail('REGISTRATION_CHANGED','This registration changed. Refresh the list.',409);
      const {data:updated,error:updateError}=await club.rpc('club_change_registration',{p_user:body.user_id,p_action:action,p_actor:auth.data.user.id,p_expected:expected});
      if(updateError) {
        if(/Email confirmation/.test(updateError.message||''))throw fail('EMAIL_UNVERIFIED','Email confirmation is required before approval or resumption.',409);
        throw fail('CLUB_TRANSITION_FAILED','This action is no longer available. Refresh the registration list.',409);
      }
      const resolution = (body.action==='decide'||profile.approval_status==='pending')?await db.rpc('portal_resolve_club_task', {p_user:body.user_id,p_decision:updated.approval_status==='approved'?'approved':'rejected',p_email:profile.email}):{};
      return respond({ ok: true, registration:updated,...(resolution.error?{warnings:['The decision was saved. Refresh to synchronize its task.']}:{}) });
    } catch (error) {
      console.error('portal-admin', error.code || 'UNKNOWN', error.message);
      return respond({ error: error.message || 'The request failed.', code: error.code || 'PORTAL_ADMIN_ERROR' }, error.status || 503);
    }
  };
}
Deno.serve(createPortalAdminHandler());
