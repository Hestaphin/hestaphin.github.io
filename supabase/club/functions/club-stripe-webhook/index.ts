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

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return new Response('Use POST.', { status: 405 });
  const stripe = stripeClient();
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(
      await req.text(), req.headers.get('stripe-signature') ?? '',
      Deno.env.get('STRIPE_WEBHOOK_SIGNING_SECRET') ?? '', undefined,
      Stripe.createSubtleCryptoProvider(),
    );
  } catch { return new Response('Invalid Stripe signature.', { status: 400 }); }
  const supported = ['checkout.session.completed', 'checkout.session.async_payment_succeeded', 'checkout.session.expired', 'checkout.session.async_payment_failed'];
  if (!supported.includes(event.type)) return Response.json({ received: true });
  const original = event.data.object as Stripe.Checkout.Session;
  if (original.metadata?.system !== 'copku-club-v1') return Response.json({ received: true, ignored: true });
  const supabase = adminClient();
  try {
    const { data: request, error } = await supabase.from('club_checkout_requests').select('*').eq('id', original.metadata.checkout_request_id).single();
    if (error) throw error;
    if (request.user_id !== original.metadata.club_user_id || original.client_reference_id !== request.user_id || (request.stripe_checkout_session_id && request.stripe_checkout_session_id !== original.id)) {
      throw new Error('Club checkout identity does not match.');
    }
    if (event.type === 'checkout.session.expired' || event.type === 'checkout.session.async_payment_failed') {
      const { error: updateError } = await supabase.from('club_checkout_requests')
        .update({ payment_status: event.type.endsWith('expired') ? 'cancelled' : 'failed' })
        .eq('id', request.id).eq('payment_status', 'pending');
      if (updateError) throw updateError;
      return Response.json({ received: true });
    }
    const session = await stripe.checkout.sessions.retrieve(original.id, { expand: ['line_items'] });
    // A browser success redirect or an unpaid 'completed' event cannot upgrade anyone.
    if (session.payment_status !== 'paid') return Response.json({ received: true, pending: true });
    const items = session.line_items?.data || [];
    if (session.mode !== 'payment' || session.status !== 'complete' || items.length !== 1 || items[0].quantity !== 1 || items[0].price?.id !== request.stripe_price_id) {
      throw new Error('Club checkout items do not match.');
    }
    const { data, error: fulfillError } = await supabase.rpc('fulfill_club_checkout', {
      p_request_id: request.id, p_session_id: session.id,
      p_payment_intent_id: typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id || null,
      p_amount_total: session.amount_total, p_currency: session.currency,
      p_paid_at: new Date(event.created * 1000).toISOString(),
    });
    if (fulfillError) throw fulfillError;
    return Response.json({ received: true, ...data });
  } catch (error) {
    console.error('Club fulfillment failed:', error instanceof Error ? error.message : 'unknown error');
    // A retryable error lets Stripe resend; never acknowledge an unfulfilled paid order.
    return new Response('Club payment could not be recorded. Please retry.', { status: 500 });
  }
});
