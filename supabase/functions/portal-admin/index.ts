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
      if (body.action === 'fulfill_order') {
        const {data,error}=await db.rpc('shop_mark_delivered',{p_order:body.order_id,p_actor:auth.data.user.id});
        if(error)throw fail('SHOP_FULFILL_FAILED','This order could not be marked delivered.');
        if(!data)throw fail('ORDER_NOT_READY','This order is unpaid, refunded, awaiting a refund, missing or already delivered.',409);
        return respond({ ok: true });
      }
      const club = clubClient();
      if (body.action === 'list' || body.action === 'diagnose') {
        const { data: profiles, error } = await club.from('club_profiles').select('user_id,full_name,email,approval_status,created_at').order('created_at');
        if (error) throw clubReadError(error);
        const warnings = [];
        const verifiedProfiles = [];
        for (const p of profiles || []) {
          let email_verified;
          if (p.approval_status === 'pending') {
            const check = await club.auth.admin.getUserById(p.user_id);
            if (!check.error) email_verified = Boolean(check.data.user?.email_confirmed_at);
            // A reminder failure must not hide readable applications.
            const event = await db.rpc('portal_admin_event', { p_key: 'club:' + p.user_id, p_title: 'Club registration approval: ' + p.full_name, p_text: 'Review ' + p.email + ' in Club approvals. Email verification is required before access.' });
            if (event.error && !warnings.length) warnings.push('Applications are available, but admin task reminders could not be created. Run supabase/portal/04_portal_v124.sql in the Orchestra project or check its function permissions.');
          }
          if (['approved','rejected'].includes(p.approval_status)) { const resolved = await db.rpc('portal_resolve_club_task', {p_user:p.user_id,p_decision:p.approval_status,p_email:p.email}); if(resolved.error&&!warnings.length) warnings.push('A decision is saved, but its task could not synchronize. Refresh after checking the v1.24 database update.'); }
          verifiedProfiles.push({ ...p, ...(email_verified === undefined ? {} : { email_verified }) });
        }
        return respond({ profiles: verifiedProfiles, warnings, connection: { club_project_url: secret('CLUB_SUPABASE_URL'), ok: true } });
      }
      if (body.action !== 'decide' || !['approved','rejected'].includes(body.decision)) throw fail('BAD_ACTION', 'Invalid action.', 400);
      const { data: profile, error: readError } = await club.from('club_profiles').select('approval_status,email').eq('user_id', body.user_id).single();
      if (readError) throw clubReadError(readError);
      if (profile?.approval_status !== 'pending') throw fail('ALREADY_REVIEWED', 'This registration is no longer pending. Refresh the list.', 409);
      const { data: updated, error: updateError } = await club.from('club_profiles').update({ approval_status: body.decision }).eq('user_id', body.user_id).eq('approval_status','pending').select('user_id').maybeSingle();
      if (updateError) throw clubReadError(updateError);
      if (!updated) throw fail('ALREADY_REVIEWED', 'Another administrator already reviewed this application. Refresh the list.', 409);
      const resolution = await db.rpc('portal_resolve_club_task', {p_user:body.user_id,p_decision:body.decision,p_email:profile.email});
      return respond({ ok: true, ...(resolution.error ? {warnings:['The decision was saved. Refresh to synchronize its task.']} : {}) });
    } catch (error) {
      console.error('portal-admin', error.code || 'UNKNOWN', error.message);
      return respond({ error: error.message || 'The request failed.', code: error.code || 'PORTAL_ADMIN_ERROR' }, error.status || 503);
    }
  };
}
Deno.serve(createPortalAdminHandler());
