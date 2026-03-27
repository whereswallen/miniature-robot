const { Router } = require('express');
const tenantService = require('../../services/tenantService');
const authService = require('../../services/authService');
const botRegistry = require('../../services/botRegistry');
const db = require('../../db/connection');
const { requireAuthAPI, requireSuperAdmin } = require('../middleware/auth');

const router = Router();
router.use(requireAuthAPI);
router.use(requireSuperAdmin);

// --- Tenants ---

router.get('/tenants', (req, res) => {
  try {
    const { page, limit, status, search } = req.query;
    const result = tenantService.listTenants({
      page: parseInt(page, 10) || 1,
      limit: parseInt(limit, 10) || 25,
      status,
      search,
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/tenants/:id', (req, res) => {
  try {
    const tenant = tenantService.getTenant(parseInt(req.params.id, 10));
    if (!tenant) return res.status(404).json({ error: 'Tenant not found' });
    const usage = tenantService.getUsageStats(tenant.id);
    res.json({ ...tenant, usage });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/tenants', async (req, res) => {
  try {
    const { companyName, ownerName, ownerEmail, plan, adminUsername, adminPassword } = req.body;
    if (!companyName || !ownerName || !ownerEmail) {
      return res.status(400).json({ error: 'companyName, ownerName, and ownerEmail required' });
    }

    const tenant = tenantService.createTenant({ companyName, ownerName, ownerEmail, plan });

    // Create tenant admin account
    if (adminUsername && adminPassword) {
      await authService.createAdmin(adminUsername, adminPassword, ownerName, tenant.id, 'tenant_admin');
    }

    res.status(201).json(tenant);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.put('/tenants/:id', (req, res) => {
  try {
    tenantService.updateTenant(parseInt(req.params.id, 10), req.body);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/tenants/:id/suspend', (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    tenantService.suspendTenant(id);
    botRegistry.unregisterTenantBots(id);
    res.json({ ok: true, message: 'Tenant suspended' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/tenants/:id/activate', (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    tenantService.activateTenant(id);
    botRegistry.registerTenantBots(id);
    res.json({ ok: true, message: 'Tenant activated' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.put('/tenants/:id/bots', (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { adminBotToken, customerBotToken, adminChatIds } = req.body;
    tenantService.configureBots(id, { adminBotToken, customerBotToken, adminChatIds });

    // Restart bots with new tokens
    botRegistry.unregisterTenantBots(id);
    botRegistry.registerTenantBots(id);

    res.json({ ok: true, message: 'Bot configuration updated' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// --- Plans ---

router.get('/plans', (req, res) => {
  try {
    const plans = db.prepare('SELECT * FROM platform_plans WHERE is_active = 1 ORDER BY sort_order').all();
    res.json(plans);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/plans', (req, res) => {
  try {
    const { name, displayName, priceMonthly, priceYearly, maxSubscribers, maxPanels, features } = req.body;
    if (!name || !displayName) return res.status(400).json({ error: 'name and displayName required' });
    const result = db.prepare(`
      INSERT INTO platform_plans (name, display_name, price_monthly, price_yearly, max_subscribers, max_panels, features)
      VALUES (@name, @displayName, @priceMonthly, @priceYearly, @maxSubscribers, @maxPanels, @features)
    `).run({
      name,
      displayName,
      priceMonthly: priceMonthly || 0,
      priceYearly: priceYearly || 0,
      maxSubscribers: maxSubscribers || 50,
      maxPanels: maxPanels || 2,
      features: features ? JSON.stringify(features) : null,
    });
    res.status(201).json({ id: result.lastInsertRowid });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// --- Platform stats ---

router.get('/stats', (req, res) => {
  try {
    const totalTenants = tenantService.getTenantCount();
    const activeTenants = tenantService.listActiveTenants().length;
    const totalSubs = db.prepare('SELECT COUNT(*) as count FROM subscribers').get().count;
    const totalRevenue = db.prepare("SELECT COALESCE(SUM(amount), 0) as total FROM tenant_payments WHERE status = 'completed'").get().total;

    res.json({
      tenants: { total: totalTenants, active: activeTenants },
      subscribers: totalSubs,
      revenue: totalRevenue,
      activeBots: botRegistry.getTenantCount(),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Billing (tenant payments to platform) ---

router.get('/billing', (req, res) => {
  try {
    const { page, limit } = req.query;
    const offset = ((parseInt(page, 10) || 1) - 1) * (parseInt(limit, 10) || 25);
    const lim = parseInt(limit, 10) || 25;

    const total = db.prepare('SELECT COUNT(*) as count FROM tenant_payments').get().count;
    const data = db.prepare(`
      SELECT tp.*, t.company_name, t.slug
      FROM tenant_payments tp JOIN tenants t ON tp.tenant_id = t.id
      ORDER BY tp.created_at DESC LIMIT ? OFFSET ?
    `).all(lim, offset);

    res.json({ data, total, page: parseInt(page, 10) || 1, limit: lim, totalPages: Math.ceil(total / lim) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/billing/manual', (req, res) => {
  try {
    const { tenantId, amount, currency, reference, notes, periodStart, periodEnd } = req.body;
    if (!tenantId || !amount) return res.status(400).json({ error: 'tenantId and amount required' });

    const result = db.prepare(`
      INSERT INTO tenant_payments (tenant_id, amount, currency, method, status, reference, notes, period_start, period_end)
      VALUES (@tenantId, @amount, @currency, 'manual', 'completed', @reference, @notes, @periodStart, @periodEnd)
    `).run({
      tenantId,
      amount: parseFloat(amount),
      currency: currency || 'USD',
      reference: reference || null,
      notes: notes || null,
      periodStart: periodStart || null,
      periodEnd: periodEnd || null,
    });

    // Activate tenant if suspended
    const tenant = tenantService.getTenant(tenantId);
    if (tenant && (tenant.status === 'suspended' || tenant.status === 'trial')) {
      tenantService.activateTenant(tenantId);
      botRegistry.registerTenantBots(tenantId);
    }

    res.status(201).json({ id: result.lastInsertRowid });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// --- PDF Queue monitoring ---

router.get('/pdf-queue', (req, res) => {
  const pdfQueue = require('../../services/pdfQueue');
  res.json(pdfQueue.getStatus());
});

module.exports = router;
