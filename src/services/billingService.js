const db = require('../db/connection');
const config = require('../config');
const tenantService = require('./tenantService');

// --- Prepared statements ---

const insertPayment = db.prepare(`
  INSERT INTO tenant_payments (tenant_id, amount, currency, method, status, stripe_session_id, crypto_tx_hash, reference, plan_snapshot, period_start, period_end, notes)
  VALUES (@tenantId, @amount, @currency, @method, @status, @stripeSessionId, @cryptoTxHash, @reference, @planSnapshot, @periodStart, @periodEnd, @notes)
`);

const updatePaymentStatus = db.prepare(`
  UPDATE tenant_payments SET status = @status WHERE id = @id
`);

const findByStripeSession = db.prepare(`
  SELECT * FROM tenant_payments WHERE stripe_session_id = @sessionId
`);

const getPaymentsForTenant = db.prepare(`
  SELECT * FROM tenant_payments WHERE tenant_id = @tenantId ORDER BY created_at DESC
`);

// --- Stripe integration ---

let stripe = null;
function getStripe() {
  if (!stripe && config.stripe.secretKey) {
    stripe = require('stripe')(config.stripe.secretKey);
  }
  return stripe;
}

async function createCheckoutSession(tenantId, planName) {
  const s = getStripe();
  if (!s) throw new Error('Stripe is not configured.');

  const tenant = tenantService.getTenant(tenantId);
  if (!tenant) throw new Error('Tenant not found.');

  const plan = db.prepare('SELECT * FROM platform_plans WHERE name = @name').get({ name: planName });
  if (!plan) throw new Error(`Plan "${planName}" not found.`);

  const price = tenant.billing_cycle === 'yearly' ? plan.price_yearly : plan.price_monthly;
  const interval = tenant.billing_cycle === 'yearly' ? 'year' : 'month';

  const session = await s.checkout.sessions.create({
    payment_method_types: ['card'],
    line_items: [{
      price_data: {
        currency: 'usd',
        product_data: { name: `LineTrack ${plan.display_name} Plan` },
        unit_amount: Math.round(price * 100),
        recurring: { interval },
      },
      quantity: 1,
    }],
    mode: 'subscription',
    success_url: `${process.env.APP_URL || 'http://localhost:3000'}/settings?billing=success`,
    cancel_url: `${process.env.APP_URL || 'http://localhost:3000'}/settings?billing=cancelled`,
    metadata: { tenantId: String(tenantId), planName },
  });

  // Record pending payment
  const now = new Date();
  const periodEnd = new Date(now);
  if (interval === 'year') {
    periodEnd.setFullYear(periodEnd.getFullYear() + 1);
  } else {
    periodEnd.setMonth(periodEnd.getMonth() + 1);
  }

  insertPayment.run({
    tenantId,
    amount: price,
    currency: 'USD',
    method: 'stripe',
    status: 'pending',
    stripeSessionId: session.id,
    cryptoTxHash: null,
    reference: null,
    planSnapshot: planName,
    periodStart: now.toISOString().split('T')[0],
    periodEnd: periodEnd.toISOString().split('T')[0],
    notes: null,
  });

  return { url: session.url, sessionId: session.id };
}

async function handleStripeWebhook(event) {
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const payment = findByStripeSession.get({ sessionId: session.id });
    if (payment) {
      updatePaymentStatus.run({ id: payment.id, status: 'completed' });

      // Activate tenant
      const tenantId = parseInt(session.metadata.tenantId, 10);
      tenantService.activateTenant(tenantId);

      // Update plan if changed
      const planName = session.metadata.planName;
      if (planName) {
        const plan = db.prepare('SELECT * FROM platform_plans WHERE name = @name').get({ name: planName });
        if (plan) {
          tenantService.updateTenant(tenantId, {
            plan: planName,
            maxSubscribers: plan.max_subscribers,
            maxPanels: plan.max_panels,
          });
        }
      }

      // Set next billing date
      const nextBilling = new Date();
      const tenant = tenantService.getTenant(tenantId);
      if (tenant.billing_cycle === 'yearly') {
        nextBilling.setFullYear(nextBilling.getFullYear() + 1);
      } else {
        nextBilling.setMonth(nextBilling.getMonth() + 1);
      }
      db.prepare('UPDATE tenants SET next_billing_at = @date WHERE id = @id').run({
        id: tenantId,
        date: nextBilling.toISOString().split('T')[0],
      });
    }
  }
}

// --- Manual / Crypto payments ---

function recordManualPayment(tenantId, { amount, currency = 'USD', reference, notes }) {
  return insertPayment.run({
    tenantId,
    amount: parseFloat(amount),
    currency,
    method: 'manual',
    status: 'completed',
    stripeSessionId: null,
    cryptoTxHash: null,
    reference: reference || null,
    planSnapshot: null,
    periodStart: null,
    periodEnd: null,
    notes: notes || null,
  });
}

function recordCryptoPayment(tenantId, { amount, currency = 'USDT', txHash, notes }) {
  return insertPayment.run({
    tenantId,
    amount: parseFloat(amount),
    currency,
    method: 'crypto',
    status: 'pending',
    stripeSessionId: null,
    cryptoTxHash: txHash || null,
    reference: null,
    planSnapshot: null,
    periodStart: null,
    periodEnd: null,
    notes: notes || null,
  });
}

function confirmCryptoPayment(paymentId) {
  updatePaymentStatus.run({ id: paymentId, status: 'completed' });
}

// --- Queries ---

function getPaymentHistory(tenantId) {
  return getPaymentsForTenant.all({ tenantId });
}

function checkSubscriptionStatus(tenantId) {
  const tenant = tenantService.getTenant(tenantId);
  if (!tenant) return 'unknown';
  return tenant.status;
}

function runBillingMaintenance() {
  // Suspend tenants past due
  const overdue = db.prepare(`
    SELECT * FROM tenants
    WHERE status = 'active' AND next_billing_at IS NOT NULL AND date(next_billing_at) < date('now')
  `).all();

  let suspended = 0;
  for (const tenant of overdue) {
    tenantService.suspendTenant(tenant.id);
    suspended++;
    console.log(`[Billing] Suspended tenant ${tenant.id} (${tenant.company_name}) — payment overdue.`);
  }

  // Expire trials
  const expiredTrials = db.prepare(`
    SELECT * FROM tenants
    WHERE status = 'trial' AND trial_ends_at IS NOT NULL AND date(trial_ends_at) < date('now')
  `).all();

  for (const tenant of expiredTrials) {
    tenantService.suspendTenant(tenant.id);
    suspended++;
    console.log(`[Billing] Suspended tenant ${tenant.id} (${tenant.company_name}) — trial expired.`);
  }

  return { suspended };
}

module.exports = {
  createCheckoutSession,
  handleStripeWebhook,
  recordManualPayment,
  recordCryptoPayment,
  confirmCryptoPayment,
  getPaymentHistory,
  checkSubscriptionStatus,
  runBillingMaintenance,
};
