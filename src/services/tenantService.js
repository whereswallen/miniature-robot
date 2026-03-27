const db = require('../db/connection');

// --- Prepared statements ---

const insertTenant = db.prepare(`
  INSERT INTO tenants (slug, company_name, owner_name, owner_email, plan, status, max_subscribers, max_panels, trial_ends_at)
  VALUES (@slug, @companyName, @ownerName, @ownerEmail, @plan, @status, @maxSubscribers, @maxPanels, @trialEndsAt)
`);

const updateTenantStmt = db.prepare(`
  UPDATE tenants SET company_name = @companyName, owner_name = @ownerName, owner_email = @ownerEmail,
    plan = @plan, max_subscribers = @maxSubscribers, max_panels = @maxPanels,
    admin_bot_token = @adminBotToken, customer_bot_token = @customerBotToken,
    admin_chat_ids = @adminChatIds, billing_cycle = @billingCycle,
    updated_at = datetime('now')
  WHERE id = @id
`);

const updateStatusStmt = db.prepare(`
  UPDATE tenants SET status = @status, updated_at = datetime('now') WHERE id = @id
`);

const updateBotTokens = db.prepare(`
  UPDATE tenants SET admin_bot_token = @adminBotToken, customer_bot_token = @customerBotToken,
    admin_chat_ids = @adminChatIds, updated_at = datetime('now')
  WHERE id = @id
`);

const updateBillingStmt = db.prepare(`
  UPDATE tenants SET next_billing_at = @nextBillingAt, updated_at = datetime('now') WHERE id = @id
`);

const findById = db.prepare('SELECT * FROM tenants WHERE id = @id');
const findBySlug = db.prepare('SELECT * FROM tenants WHERE slug = @slug');
const findByEmail = db.prepare('SELECT * FROM tenants WHERE owner_email = @email');
const getActiveTenants = db.prepare("SELECT * FROM tenants WHERE status IN ('active', 'trial') ORDER BY id");
const countTenants = db.prepare('SELECT COUNT(*) as count FROM tenants');

const countSubscribers = db.prepare('SELECT COUNT(*) as count FROM subscribers WHERE tenant_id = @tenantId');
const countPanels = db.prepare('SELECT COUNT(*) as count FROM panels WHERE tenant_id = @tenantId AND is_active = 1');

// --- Service methods ---

function createTenant({ companyName, ownerName, ownerEmail, plan = 'basic', maxSubscribers, maxPanels }) {
  const slug = companyName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

  // Check uniqueness
  if (findBySlug.get({ slug })) throw new Error(`Slug "${slug}" already taken.`);
  if (findByEmail.get({ email: ownerEmail })) throw new Error('Email already registered.');

  // Look up plan limits if not overridden
  const planRow = db.prepare('SELECT * FROM platform_plans WHERE name = @plan').get({ plan });
  const resolvedMaxSubs = maxSubscribers || (planRow ? planRow.max_subscribers : 50);
  const resolvedMaxPanels = maxPanels || (planRow ? planRow.max_panels : 2);

  // Trial ends in 14 days
  const trialEnd = new Date();
  trialEnd.setDate(trialEnd.getDate() + 14);

  const result = insertTenant.run({
    slug,
    companyName,
    ownerName,
    ownerEmail,
    plan,
    status: 'trial',
    maxSubscribers: resolvedMaxSubs,
    maxPanels: resolvedMaxPanels,
    trialEndsAt: trialEnd.toISOString().split('T')[0],
  });

  return { id: result.lastInsertRowid, slug };
}

function getTenant(id) {
  return findById.get({ id });
}

function getTenantBySlug(slug) {
  return findBySlug.get({ slug });
}

function getTenantByEmail(email) {
  return findByEmail.get({ email });
}

function updateTenant(id, fields) {
  const current = findById.get({ id });
  if (!current) throw new Error('Tenant not found.');

  updateTenantStmt.run({
    id,
    companyName: fields.companyName || current.company_name,
    ownerName: fields.ownerName || current.owner_name,
    ownerEmail: fields.ownerEmail || current.owner_email,
    plan: fields.plan || current.plan,
    maxSubscribers: fields.maxSubscribers ?? current.max_subscribers,
    maxPanels: fields.maxPanels ?? current.max_panels,
    adminBotToken: fields.adminBotToken ?? current.admin_bot_token,
    customerBotToken: fields.customerBotToken ?? current.customer_bot_token,
    adminChatIds: fields.adminChatIds ?? current.admin_chat_ids,
    billingCycle: fields.billingCycle || current.billing_cycle,
  });
}

function configureBots(tenantId, { adminBotToken, customerBotToken, adminChatIds }) {
  updateBotTokens.run({
    id: tenantId,
    adminBotToken: adminBotToken || null,
    customerBotToken: customerBotToken || null,
    adminChatIds: adminChatIds || null,
  });
}

function suspendTenant(id) {
  updateStatusStmt.run({ id, status: 'suspended' });
}

function activateTenant(id) {
  updateStatusStmt.run({ id, status: 'active' });
}

function cancelTenant(id) {
  updateStatusStmt.run({ id, status: 'cancelled' });
}

function listTenants({ page = 1, limit = 25, status, search } = {}) {
  let where = 'WHERE 1=1';
  const params = {};

  if (status && status !== 'all') {
    where += ' AND status = @status';
    params.status = status;
  }
  if (search) {
    where += ' AND (company_name LIKE @search OR owner_email LIKE @search OR slug LIKE @search)';
    params.search = `%${search}%`;
  }

  const total = db.prepare(`SELECT COUNT(*) as count FROM tenants ${where}`).get(params).count;
  const data = db.prepare(`SELECT * FROM tenants ${where} ORDER BY created_at DESC LIMIT @limit OFFSET @offset`).all({
    ...params, limit, offset: (page - 1) * limit,
  });

  return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
}

function listActiveTenants() {
  return getActiveTenants.all();
}

function getUsageStats(tenantId) {
  const tenant = findById.get({ id: tenantId });
  if (!tenant) throw new Error('Tenant not found.');

  const subCount = countSubscribers.get({ tenantId }).count;
  const panelCount = countPanels.get({ tenantId }).count;

  return {
    subscribers: { current: subCount, max: tenant.max_subscribers },
    panels: { current: panelCount, max: tenant.max_panels },
  };
}

function checkLimit(tenantId, resource) {
  const usage = getUsageStats(tenantId);
  const resourceUsage = usage[resource];
  if (!resourceUsage) return true;
  return resourceUsage.current < resourceUsage.max;
}

function getLimitError(tenantId, resource) {
  const usage = getUsageStats(tenantId);
  const resourceUsage = usage[resource];
  if (!resourceUsage) return null;
  if (resourceUsage.current >= resourceUsage.max) {
    return `Plan limit reached (${resourceUsage.current}/${resourceUsage.max} ${resource}). Upgrade to add more.`;
  }
  return null;
}

function getTenantCount() {
  return countTenants.get().count;
}

function getAuthorizedChatIds(tenantId) {
  const tenant = findById.get({ id: tenantId });
  if (!tenant || !tenant.admin_chat_ids) return [];
  return tenant.admin_chat_ids.split(',').map((id) => id.trim()).filter(Boolean);
}

module.exports = {
  createTenant,
  getTenant,
  getTenantBySlug,
  getTenantByEmail,
  updateTenant,
  configureBots,
  suspendTenant,
  activateTenant,
  cancelTenant,
  listTenants,
  listActiveTenants,
  getUsageStats,
  checkLimit,
  getLimitError,
  getTenantCount,
  getAuthorizedChatIds,
};
