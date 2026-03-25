const db = require('../db/connection');
const xtream = require('../api/xtream');

// --- Prepared statements ---

const insertSubscriber = db.prepare(`
  INSERT INTO subscribers (customer_name, phone, telegram_user, xtream_username, package, start_date, expiry_date, status, notes)
  VALUES (@customerName, @phone, @telegramUser, @xtreamUsername, @package, @startDate, @expiryDate, @status, @notes)
`);

const updateStatus = db.prepare(`
  UPDATE subscribers SET status = @status, updated_at = datetime('now') WHERE xtream_username = @xtreamUsername
`);

const updateExpiry = db.prepare(`
  UPDATE subscribers SET expiry_date = @expiryDate, status = 'active', updated_at = datetime('now') WHERE xtream_username = @xtreamUsername
`);

const findByXtreamUsername = db.prepare(`
  SELECT * FROM subscribers WHERE xtream_username = @xtreamUsername
`);

const searchByName = db.prepare(`
  SELECT * FROM subscribers WHERE customer_name LIKE @search OR xtream_username LIKE @search
`);

const listActive = db.prepare(`
  SELECT * FROM subscribers WHERE status = 'active' ORDER BY expiry_date ASC
`);

const listByStatus = db.prepare(`
  SELECT * FROM subscribers WHERE status = @status ORDER BY expiry_date ASC
`);

const findExpiring = db.prepare(`
  SELECT *, julianday(expiry_date) - julianday('now') AS days_left
  FROM subscribers
  WHERE status = 'active'
    AND julianday(expiry_date) - julianday('now') BETWEEN 0 AND @days
  ORDER BY expiry_date ASC
`);

const expireOverdue = db.prepare(`
  UPDATE subscribers SET status = 'expired', updated_at = datetime('now')
  WHERE status = 'active' AND date(expiry_date) < date('now')
`);

const countByStatus = db.prepare(`
  SELECT status, COUNT(*) as count FROM subscribers GROUP BY status
`);

const countExpiringSoon = db.prepare(`
  SELECT COUNT(*) as count FROM subscribers
  WHERE status = 'active' AND julianday(expiry_date) - julianday('now') BETWEEN 0 AND 7
`);

const insertAudit = db.prepare(`
  INSERT INTO audit_log (action, subscriber_id, details) VALUES (@action, @subscriberId, @details)
`);

const insertPayment = db.prepare(`
  INSERT INTO payment_history (subscriber_id, amount, currency, method, notes)
  VALUES (@subscriberId, @amount, @currency, @method, @notes)
`);

// --- Service methods ---

function logAudit(action, subscriberId, details = {}) {
  insertAudit.run({
    action,
    subscriberId: subscriberId || null,
    details: JSON.stringify(details),
  });
}

async function createUser({ customerName, phone, telegramUser, xtreamUsername, xtreamPassword, pkg, maxConnections, bouquet, expDate, notes }) {
  // Calculate dates
  const startDate = new Date().toISOString().split('T')[0];
  const expiryDate = expDate || startDate;

  // API first — panel is source of truth
  const apiResult = await xtream.createUser({
    userUsername: xtreamUsername,
    userPassword: xtreamPassword,
    maxConnections: maxConnections || 1,
    expDate: expiryDate,
    bouquet,
  });

  // Then local DB
  const result = insertSubscriber.run({
    customerName,
    phone: phone || null,
    telegramUser: telegramUser || null,
    xtreamUsername,
    package: pkg,
    startDate,
    expiryDate,
    status: 'active',
    notes: notes || null,
  });

  logAudit('create', result.lastInsertRowid, { xtreamUsername, pkg });

  return { id: result.lastInsertRowid, apiResult };
}

async function disableUser(xtreamUsername) {
  const sub = findByXtreamUsername.get({ xtreamUsername });
  if (!sub) throw new Error(`Subscriber "${xtreamUsername}" not found in local database.`);

  await xtream.disableUser(xtreamUsername);
  updateStatus.run({ status: 'disabled', xtreamUsername });
  logAudit('disable', sub.id, { xtreamUsername });

  return sub;
}

async function enableUser(xtreamUsername) {
  const sub = findByXtreamUsername.get({ xtreamUsername });
  if (!sub) throw new Error(`Subscriber "${xtreamUsername}" not found in local database.`);

  await xtream.enableUser(xtreamUsername);
  updateStatus.run({ status: 'active', xtreamUsername });
  logAudit('enable', sub.id, { xtreamUsername });

  return sub;
}

async function extendUser(xtreamUsername, newExpiryDate) {
  const sub = findByXtreamUsername.get({ xtreamUsername });
  if (!sub) throw new Error(`Subscriber "${xtreamUsername}" not found in local database.`);

  await xtream.extendUser(xtreamUsername, newExpiryDate);
  updateExpiry.run({ expiryDate: newExpiryDate, xtreamUsername });
  logAudit('extend', sub.id, { xtreamUsername, newExpiryDate });

  return { ...sub, expiry_date: newExpiryDate };
}

function getUserByUsername(xtreamUsername) {
  return findByXtreamUsername.get({ xtreamUsername });
}

function searchUsers(query) {
  return searchByName.all({ search: `%${query}%` });
}

function getActiveUsers() {
  return listActive.all();
}

function getUsersByStatus(status) {
  return listByStatus.all({ status });
}

function getExpiringUsers(days = 7) {
  return findExpiring.all({ days });
}

function syncExpiredStatus() {
  const result = expireOverdue.run();
  return result.changes;
}

function getStats() {
  const statusCounts = countByStatus.all();
  const expiringSoon = countExpiringSoon.get();

  const stats = { total: 0, active: 0, disabled: 0, expired: 0, expiring_soon: expiringSoon.count };
  for (const row of statusCounts) {
    stats[row.status] = row.count;
    stats.total += row.count;
  }

  return stats;
}

function addPayment(subscriberId, { amount, currency, method, notes }) {
  return insertPayment.run({
    subscriberId,
    amount: amount || null,
    currency: currency || 'USD',
    method: method || null,
    notes: notes || null,
  });
}

module.exports = {
  createUser,
  disableUser,
  enableUser,
  extendUser,
  getUserByUsername,
  searchUsers,
  getActiveUsers,
  getUsersByStatus,
  getExpiringUsers,
  syncExpiredStatus,
  getStats,
  addPayment,
};
