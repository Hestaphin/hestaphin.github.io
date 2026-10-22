// Standalone file: paste this complete file into the Supabase Dashboard editor.
import { createClient } from 'npm:@supabase/supabase-js@2';
import Stripe from 'https://esm.sh/stripe@14?target=denonext';

function adminClient() {
  return createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function stripeClient() {
  return new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', {
    apiVersion: '2023-10-16',
    httpClient: Stripe.createFetchHttpClient(),
  });
}

function siteOrigin() {
  const url = new URL(Deno.env.get('SITE_URL') ?? '');
  if (url.protocol !== 'https:' || url.username || url.password) throw new Error('SITE_URL must be the HTTPS website origin.');
  return url.origin;
}

const ranks: Record<string, number> = { 'Membership Standard': 1, 'Membership Supporter': 2, 'Membership Patron': 3 };

Deno.serve(async (req: Request) => {
  let origin: string;
  try { origin = siteOrigin(); } catch { return Response.json({ error: 'Payment is not configured.' }, { status: 503 }); }
  const cors = {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  };
  const respond = (body: unknown, status = 200) => Response.json(body, { status, headers: cors });
  if (req.headers.get('origin') && req.headers.get('origin') !== origin) return respond({ error: 'Origin not allowed.' }, 403);
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return respond({ error: 'Use POST.' }, 405);
  const supabase = adminClient();
  const stripe = stripeClient();
  let newRequestId: string | null = null;
  let newSessionId: string | null = null;
  try {
    const token = req.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
    if (!token) return respond({ error: 'Sign in to your Club account first.' }, 401);
    // Validate against this Club project's Auth service, not an unverified JWT payload.
    const { data: auth, error: authError } = await supabase.auth.getUser(token);
    if (authError || !auth.user?.email || !auth.user.email_confirmed_at) return respond({ error: 'Please confirm your email and sign in to your Club account.' }, 401);
    const { data: profile, error: profileError } = await supabase.from('club_profiles').select('*').eq('user_id', auth.user.id).single();
    if (profileError || profile?.account_type !== 'club' || profile?.approval_status !== 'approved') return respond({ error: 'A Club account is required.' }, 403);
    const body = await req.json();
    const slug = String(body.plan_slug || '');
    // Email, user ID, amount and return URL supplied by a caller are never trusted.
    const { data: plan, error: planError } = await supabase.from('club_plans').select('*').eq('slug', slug).eq('active', true).single();
    if (planError || !plan?.stripe_price_id || !ranks[slug]) return respond({ error: 'Choose an available paid membership.' }, 400);
    if (profile.membership_status === 'active' && Date.parse(profile.paid_through) > Date.now() && ranks[slug] < (ranks[profile.membership_tier] || 0)) {
      return respond({ error: 'Choose your current membership to renew, or a higher membership to upgrade.' }, 400);
    }
    const price = await stripe.prices.retrieve(plan.stripe_price_id);
    if (!price.active || price.recurring || price.unit_amount !== plan.price_cents || price.currency !== plan.currency) {
      return respond({ error: 'This membership price is not available. Please contact the Club.' }, 503);
    }

    // Reuse an open checkout, or expire it before changing plans. This prevents two
    // outstanding payments from changing the same account in a different order.
    const { data: pending, error: pendingError } = await supabase.from('club_checkout_requests').select('*').eq('user_id', auth.user.id).eq('payment_status', 'pending').maybeSingle();
    if (pendingError) throw pendingError;
    if (pending) {
      if (!pending.stripe_checkout_session_id) return respond({ error: 'A payment is being prepared. Please try again in a moment.' }, 409);
      const previous = await stripe.checkout.sessions.retrieve(pending.stripe_checkout_session_id);
      if (previous.status === 'complete') return respond({ error: 'Your previous payment is being confirmed. Check payment status in your Club portal.' }, 409);
      if (previous.status === 'open' && pending.plan_id === plan.id && pending.amount_cents === plan.price_cents && pending.stripe_price_id === plan.stripe_price_id && previous.url) {
        return respond({ url: previous.url });
      }
      if (previous.status === 'open') await stripe.checkout.sessions.expire(previous.id);
      const { error } = await supabase.from('club_checkout_requests').update({ payment_status: 'cancelled' }).eq('id', pending.id).eq('payment_status', 'pending');
      if (error) throw error;
    }
    const { data: request, error: insertError } = await supabase.from('club_checkout_requests').insert({
      user_id: auth.user.id, plan_id: plan.id, plan_slug: plan.slug, plan_name: plan.name,
      plan_rank: plan.sort_order, duration_months: plan.duration_months, stripe_price_id: plan.stripe_price_id,
      amount_cents: plan.price_cents, currency: plan.currency,
    }).select('id').single();
    if (insertError?.code === '23505') return respond({ error: 'A payment is already being prepared. Please try again in a moment.' }, 409);
    if (insertError) throw insertError;
    newRequestId = request.id;
    const session = await stripe.checkout.sessions.create({
      mode: 'payment', customer_email: auth.user.email, client_reference_id: auth.user.id,
      success_url: `${origin}/portal/membership/?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/portal/membership/?checkout=cancel`,
      line_items: [{ price: plan.stripe_price_id, quantity: 1 }],
      metadata: { system: 'copku-club-v1', checkout_request_id: request.id, club_user_id: auth.user.id },
    }, { idempotencyKey: `club-checkout-${request.id}` });
    newSessionId = session.id;
    const { data: bound, error: bindError } = await supabase.from('club_checkout_requests').update({ stripe_checkout_session_id: session.id })
      .eq('id', request.id).select('id').single();
    if (bindError || !bound || !session.url) throw new Error('Could not save checkout.');
    return respond({ url: session.url });
  } catch (error) {
    // Do not leave an untracked live payment session after a database failure.
    let safelyClosed = !newSessionId;
    if (newSessionId) {
      try { await stripe.checkout.sessions.expire(newSessionId); safelyClosed = true; } catch { /* A completed session must still be fulfilled by its webhook. */ }
    }
    if (newRequestId && safelyClosed) await supabase.from('club_checkout_requests').update({ payment_status: 'failed' }).eq('id', newRequestId).eq('payment_status', 'pending');
    console.error('Club checkout failed:', error instanceof Error ? error.message : 'unknown error');
    return respond({ error: 'Could not prepare payment. Please try again.' }, 500);
  }
});
