const db = require('../db/connection');
const panelService = require('./panelService');
const syncService = require('./syncService');
const tenantService = require('./tenantService');

// --- Prepared statements ---

const insertSubscriber = db.prepare(`
  INSERT INTO subscribers (tenant_id, customer_name, phone, telegram_user, xtream_username, package, start_date, expiry_date, status, notes, panel_id, cost_per_line)
  VALUES (@tenantId, @customerName, @phone, @telegramUser, @xtreamUsername, @package, @startDate, @expiryDate, @status, @notes, @panelId, @costPerLine)
`);

const updateSubscriber = db.prepare(`
  UPDATE subscribers SET customer_name = @customerName, phone = @phone, telegram_user = @telegramUser,
    package = @package, notes = @notes, cost_per_line = @costPerLine, updated_at = datetime('now')
  WHERE id = @id AND tenant_id = @tenantId
`);

const updateStatus = db.prepare(`
  UPDATE subscribers SET status = @status, updated_at = datetime('now')
  WHERE xtream_username = @xtreamUsername AND tenant_id = @tenantId
`);

const updateStatusById = db.prepare(`
  UPDATE subscribers SET status = @status, updated_at = datetime('now')
  WHERE id = @id AND tenant_id = @tenantId
`);

const updateExpiry = db.prepare(`
  UPDATE subscribers SET expiry_date = @expiryDate, status = 'active', updated_at = datetime('now')
  WHERE xtream_username = @xtreamUsername AND tenant_id = @tenantId
`);

const updateExpiryById = db.prepare(`
  UPDATE subscribers SET expiry_date = @expiryDate, status = 'active', updated_at = datetime('now')
  WHERE id = @id AND tenant_id = @tenantId
`);

const findByXtreamUsername = db.prepare(`
  SELECT s.*, p.name as panel_name FROM subscribers s LEFT JOIN panels p ON s.panel_id = p.id
  WHERE s.xtream_username = @xtreamUsername AND s.tenant_id = @tenantId
`);

const findById = db.prepare(`
  SELECT s.*, p.name as panel_name FROM subscribers s LEFT JOIN panels p ON s.panel_id = p.id
  WHERE s.id = @id AND s.tenant_id = @tenantId
`);

const searchByName = db.prepare(`
  SELECT s.*, p.name as panel_name FROM subscribers s LEFT JOIN panels p ON s.panel_id = p.id
  WHERE (s.customer_name LIKE @search OR s.xtream_username LIKE @search) AND s.tenant_id = @tenantId
`);

const listActive = db.prepare(`
  SELECT s.*, p.name as panel_name FROM subscribers s LEFT JOIN panels p ON s.panel_id = p.id
  WHERE s.status = 'active' AND s.tenant_id = @tenantId ORDER BY s.expiry_date ASC
`);

const findExpiring = db.prepare(`
  SELECT s.*, p.name as panel_name, julianday(s.expiry_date) - julianday('now') AS days_left
  FROM subscribers s LEFT JOIN panels p ON s.panel_id = p.id
  WHERE s.status = 'active' AND s.tenant_id = @tenantId
    AND julianday(s.expiry_date) - julianday('now') BETWEEN 0 AND @days
  ORDER BY s.expiry_date ASC
`);

const expireOverdue = db.prepare(`
  UPDATE subscribers SET status = 'expired', updated_at = datetime('now')
  WHERE status = 'active' AND date(expiry_date) < date('now') AND tenant_id = @tenantId
`);

const countByStatus = db.prepare(`
  SELECT status, COUNT(*) as count FROM subscribers WHERE tenant_id = @tenantId GROUP BY status
`);

const countExpiringSoon = db.prepare(`
  SELECT COUNT(*) as count FROM subscribers
  WHERE status = 'active' AND julianday(expiry_date) - julianday('now') BETWEEN 0 AND 7 AND tenant_id = @tenantId
`);

const totalRevenue = db.prepare(`
  SELECT COALESCE(SUM(amount), 0) as total FROM payment_history
  WHERE payment_type = 'payment' AND payment_date >= @startDate AND tenant_id = @tenantId
`);

const insertAudit = db.prepare(`
  INSERT INTO audit_log (tenant_id, action, subscriber_id, details) VALUES (@tenantId, @action, @subscriberId, @details)
`);

const getAuditForSubscriber = db.prepare(`
  SELECT * FROM audit_log WHERE subscriber_id = @subscriberId AND tenant_id = @tenantId ORDER BY performed_at DESC
`);

// --- Service methods ---

function logAudit(tenantId, action, subscriberId, details = {}) {
  insertAudit.run({
    tenantId,
    action,
    subscriberId: subscriberId || null,
    details: JSON.stringify(details),
  });
}

async function createUser(tenantId, { customerName, phone, telegramUser, xtreamUsername, xtreamPassword, pkg, maxConnections, bouquet, expDate, notes, panelId, costPerLine }) {
  if (!tenantService.checkLimit(tenantId, 'subscribers')) {
    throw new Error('Subscriber limit reached for your plan. Please upgrade to add more.');
  }

  const startDate = new Date().toISOString().split('T')[0];
  const expiryDate = expDate || startDate;

  // Resolve panel
  const resolvedPanelId = panelId || panelService.getDefault()?.id;
  if (!resolvedPanelId) throw new Error('No panel configured. Add a panel first.');

  const client = panelService.getClient(resolvedPanelId);
  const apiResult = await client.createUser({
    userUsername: xtreamUsername,
    userPassword: xtreamPassword,
    maxConnections: maxConnections || 1,
    expDate: expiryDate,
    bouquet,
  });

  const result = insertSubscriber.run({
    tenantId,
    customerName,
    phone: phone || null,
    telegramUser: telegramUser || null,
    xtreamUsername,
    package: pkg,
    startDate,
    expiryDate,
    status: 'active',
    notes: notes || null,
    panelId: resolvedPanelId,
    costPerLine: costPerLine || null,
  });

  logAudit(tenantId, 'create', result.lastInsertRowid, { xtreamUsername, pkg, panelId: resolvedPanelId });

  return { id: result.lastInsertRowid, apiResult };
}

async function disableUser(tenantId, xtreamUsername, { localOnly = false } = {}) {
  const sub = findByXtreamUsername.get({ xtreamUsername, tenantId });
  if (!sub) throw new Error(`Subscriber "${xtreamUsername}" not found.`);

  let pendingSync = false;

  if (localOnly) {
    syncService.addPendingChange(sub.id, 'disable', {});
    pendingSync = true;
  } else {
    try {
      const client = panelService.getClientForSubscriber(sub.panel_id);
      await client.disableUser(xtreamUsername);
    } catch (err) {
      if (syncService.isConnectionError(err)) {
        syncService.addPendingChange(sub.id, 'disable', {});
        pendingSync = true;
      } else {
        throw err;
      }
    }
  }

  updateStatus.run({ status: 'disabled', xtreamUsername, tenantId });
  logAudit(tenantId, 'disable', sub.id, { xtreamUsername, localOnly: pendingSync });

  return { ...sub, pendingSync };
}

async function disableUserById(tenantId, id, opts) {
  const sub = findById.get({ id, tenantId });
  if (!sub) throw new Error('Subscriber not found.');
  return disableUser(tenantId, sub.xtream_username, opts);
}

async function enableUser(tenantId, xtreamUsername, { localOnly = false } = {}) {
  const sub = findByXtreamUsername.get({ xtreamUsername, tenantId });
  if (!sub) throw new Error(`Subscriber "${xtreamUsername}" not found.`);

  let pendingSync = false;

  if (localOnly) {
    syncService.addPendingChange(sub.id, 'enable', {});
    pendingSync = true;
  } else {
    try {
      const client = panelService.getClientForSubscriber(sub.panel_id);
      await client.enableUser(xtreamUsername);
    } catch (err) {
      if (syncService.isConnectionError(err)) {
        syncService.addPendingChange(sub.id, 'enable', {});
        pendingSync = true;
      } else {
        throw err;
      }
    }
  }

  updateStatus.run({ status: 'active', xtreamUsername, tenantId });
  logAudit(tenantId, 'enable', sub.id, { xtreamUsername, localOnly: pendingSync });

  return { ...sub, pendingSync };
}

async function enableUserById(tenantId, id, opts) {
  const sub = findById.get({ id, tenantId });
  if (!sub) throw new Error('Subscriber not found.');
  return enableUser(tenantId, sub.xtream_username, opts);
}

async function extendUser(tenantId, xtreamUsername, newExpiryDate, { localOnly = false } = {}) {
  const sub = findByXtreamUsername.get({ xtreamUsername, tenantId });
  if (!sub) throw new Error(`Subscriber "${xtreamUsername}" not found.`);

  let pendingSync = false;

  if (localOnly) {
    syncService.addPendingChange(sub.id, 'extend', { newExpiryDate });
    pendingSync = true;
  } else {
    try {
      const client = panelService.getClientForSubscriber(sub.panel_id);
      await client.extendUser(xtreamUsername, newExpiryDate);
    } catch (err) {
      if (syncService.isConnectionError(err)) {
        syncService.addPendingChange(sub.id, 'extend', { newExpiryDate });
        pendingSync = true;
      } else {
        throw err;
      }
    }
  }

  updateExpiry.run({ expiryDate: newExpiryDate, xtreamUsername, tenantId });
  logAudit(tenantId, 'extend', sub.id, { xtreamUsername, newExpiryDate, localOnly: pendingSync });

  // Reset reminders so they fire again for new expiry
  try {
    const reminderService = require('./reminderService');
    reminderService.resetRemindersForSubscriber(sub.id);
  } catch (_) { /* reminderService may not be loaded yet */ }

  return { ...sub, expiry_date: newExpiryDate, pendingSync };
}

async function extendUserById(tenantId, id, newExpiryDate, opts) {
  const sub = findById.get({ id, tenantId });
  if (!sub) throw new Error('Subscriber not found.');
  return extendUser(tenantId, sub.xtream_username, newExpiryDate, opts);
}

function updateSubscriberInfo(tenantId, id, { customerName, phone, telegramUser, pkg, notes, costPerLine }) {
  updateSubscriber.run({
    id,
    tenantId,
    customerName,
    phone: phone || null,
    telegramUser: telegramUser || null,
    package: pkg,
    notes: notes || null,
    costPerLine: costPerLine || null,
  });
  logAudit(tenantId, 'update', id, { customerName });
}

function getSubscriberById(tenantId, id) {
  return findById.get({ id, tenantId });
}

function getSubscriberWithDetails(tenantId, id) {
  const sub = findById.get({ id, tenantId });
  if (!sub) return null;
  const payments = db.prepare('SELECT * FROM payment_history WHERE subscriber_id = ? AND tenant_id = ? ORDER BY payment_date DESC').all(id, tenantId);
  const audit = getAuditForSubscriber.all({ subscriberId: id, tenantId });
  return { ...sub, payments, audit };
}

function getUserByUsername(tenantId, xtreamUsername) {
  return findByXtreamUsername.get({ xtreamUsername, tenantId });
}

function searchUsers(tenantId, query) {
  return searchByName.all({ search: `%${query}%`, tenantId });
}

function listSubscribers(tenantId, { page = 1, limit = 25, status, search, panelId, sortBy = 'expiry_date', sortDir = 'ASC' } = {}) {
  const validSorts = ['customer_name', 'xtream_username', 'expiry_date', 'status', 'package', 'created_at', 'balance'];
  const validDirs = ['ASC', 'DESC'];
  const sort = validSorts.includes(sortBy) ? sortBy : 'expiry_date';
  const dir = validDirs.includes(sortDir.toUpperCase()) ? sortDir.toUpperCase() : 'ASC';

  let where = 'WHERE s.tenant_id = @tenantId';
  const params = { tenantId };

  if (status && status !== 'all') {
    where += ' AND s.status = @status';
    params.status = status;
  }
  if (search) {
    where += ' AND (s.customer_name LIKE @search OR s.xtream_username LIKE @search OR s.phone LIKE @search)';
    params.search = `%${search}%`;
  }
  if (panelId) {
    where += ' AND s.panel_id = @panelId';
    params.panelId = panelId;
  }

  const countRow = db.prepare(`SELECT COUNT(*) as total FROM subscribers s ${where}`).get(params);
  const rows = db.prepare(`
    SELECT s.*, p.name as panel_name FROM subscribers s LEFT JOIN panels p ON s.panel_id = p.id
    ${where} ORDER BY s.${sort} ${dir} LIMIT @limit OFFSET @offset
  `).all({ ...params, limit, offset: (page - 1) * limit });

  return {
    data: rows,
    total: countRow.total,
    page,
    limit,
    totalPages: Math.ceil(countRow.total / limit),
  };
}

function getActiveUsers(tenantId) {
  return listActive.all({ tenantId });
}

function getExpiringUsers(tenantId, days = 7) {
  return findExpiring.all({ days, tenantId });
}

function syncExpiredStatus(tenantId) {
  const result = expireOverdue.run({ tenantId });
  return result.changes;
}

function getStats(tenantId) {
  const statusCounts = countByStatus.all({ tenantId });
  const expiringSoon = countExpiringSoon.get({ tenantId });
  const monthStart = new Date();
  monthStart.setDate(1);
  const revenue = totalRevenue.get({ startDate: monthStart.toISOString().split('T')[0], tenantId });

  const stats = { total: 0, active: 0, disabled: 0, expired: 0, expiring_soon: expiringSoon.count, revenue_this_month: revenue.total };
  for (const row of statusCounts) {
    stats[row.status] = row.count;
    stats.total += row.count;
  }

  return stats;
}

// --- Bulk operations ---

async function bulkDisable(tenantId, ids) {
  const results = { success: 0, failed: 0, errors: [] };
  for (const id of ids) {
    try {
      await disableUserById(tenantId, id);
      results.success++;
    } catch (err) {
      results.failed++;
      results.errors.push({ id, error: err.message });
    }
  }
  return results;
}

async function bulkEnable(tenantId, ids) {
  const results = { success: 0, failed: 0, errors: [] };
  for (const id of ids) {
    try {
      await enableUserById(tenantId, id);
      results.success++;
    } catch (err) {
      results.failed++;
      results.errors.push({ id, error: err.message });
    }
  }
  return results;
}

async function bulkExtend(tenantId, ids, days) {
  const results = { success: 0, failed: 0, errors: [] };
  for (const id of ids) {
    try {
      const sub = findById.get({ id, tenantId });
      if (!sub) throw new Error('Not found');
      const base = new Date(sub.expiry_date) > new Date() ? new Date(sub.expiry_date) : new Date();
      base.setDate(base.getDate() + days);
      const newExpiry = base.toISOString().split('T')[0];
      await extendUserById(tenantId, id, newExpiry);
      results.success++;
    } catch (err) {
      results.failed++;
      results.errors.push({ id, error: err.message });
    }
  }
  return results;
}

// --- Local-only create (for CSV import without panel) ---

function createUserLocal(tenantId, { customerName, phone, telegramUser, xtreamUsername, pkg, startDate, expiryDate, status, notes, panelId, costPerLine }) {
  const result = insertSubscriber.run({
    tenantId,
    customerName,
    phone: phone || null,
    telegramUser: telegramUser || null,
    xtreamUsername,
    package: pkg,
    startDate: startDate || new Date().toISOString().split('T')[0],
    expiryDate: expiryDate || new Date().toISOString().split('T')[0],
    status: status || 'active',
    notes: notes || null,
    panelId: panelId || null,
    costPerLine: costPerLine || null,
  });
  logAudit(tenantId, 'import', result.lastInsertRowid, { xtreamUsername });
  return result.lastInsertRowid;
}

module.exports = {
  createUser,
  createUserLocal,
  disableUser,
  disableUserById,
  enableUser,
  enableUserById,
  extendUser,
  extendUserById,
  updateSubscriberInfo,
  getSubscriberById,
  getSubscriberWithDetails,
  getUserByUsername,
  searchUsers,
  listSubscribers,
  getActiveUsers,
  getExpiringUsers,
  syncExpiredStatus,
  getStats,
  bulkDisable,
  bulkEnable,
  bulkExtend,
  logAudit,
};
