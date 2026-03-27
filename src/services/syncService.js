const db = require('../db/connection');
const panelService = require('./panelService');

// --- Prepared statements ---

const insertPending = db.prepare(`
  INSERT INTO pending_sync (tenant_id, subscriber_id, action, payload)
  VALUES (@tenantId, @subscriberId, @action, @payload)
`);

const getPending = db.prepare(`
  SELECT ps.*, s.xtream_username, s.panel_id, s.customer_name, s.tenant_id
  FROM pending_sync ps
  JOIN subscribers s ON ps.subscriber_id = s.id
  WHERE ps.status = 'pending' AND ps.tenant_id = @tenantId
  ORDER BY ps.created_at ASC
`);

const getPendingCountStmt = db.prepare(`
  SELECT COUNT(*) as count FROM pending_sync WHERE status = 'pending' AND tenant_id = @tenantId
`);

const getFailedCountStmt = db.prepare(`
  SELECT COUNT(*) as count FROM pending_sync WHERE status = 'failed' AND tenant_id = @tenantId
`);

const getPendingForSub = db.prepare(`
  SELECT * FROM pending_sync WHERE subscriber_id = @subscriberId AND status = 'pending' AND tenant_id = @tenantId
  ORDER BY created_at ASC
`);

const markSynced = db.prepare(`
  UPDATE pending_sync SET status = 'synced', synced_at = datetime('now'), error = NULL WHERE id = @id
`);

const markFailed = db.prepare(`
  UPDATE pending_sync SET status = 'failed', error = @error WHERE id = @id
`);

const resetToRetry = db.prepare(`
  UPDATE pending_sync SET status = 'pending', error = NULL WHERE id = @id
`);

const clearSyncedStmt = db.prepare(`
  DELETE FROM pending_sync WHERE status = 'synced' AND tenant_id = @tenantId
`);

const getPendingByIdStmt = db.prepare(`
  SELECT ps.*, s.xtream_username, s.panel_id, s.customer_name, s.tenant_id
  FROM pending_sync ps
  JOIN subscribers s ON ps.subscriber_id = s.id
  WHERE ps.id = @id
`);

const getAllPendingAndFailed = db.prepare(`
  SELECT ps.*, s.xtream_username, s.panel_id, s.customer_name, s.tenant_id
  FROM pending_sync ps
  JOIN subscribers s ON ps.subscriber_id = s.id
  WHERE ps.status IN ('pending', 'failed') AND ps.tenant_id = @tenantId
  ORDER BY ps.created_at ASC
`);

// --- Service methods ---

function addPendingChange(tenantId, subscriberId, action, payload = {}) {
  return insertPending.run({
    tenantId,
    subscriberId,
    action,
    payload: JSON.stringify(payload),
  });
}

function getPendingChanges(tenantId) {
  return getPending.all({ tenantId });
}

function getPendingCount(tenantId) {
  return getPendingCountStmt.get({ tenantId }).count;
}

function getFailedCount(tenantId) {
  return getFailedCountStmt.get({ tenantId }).count;
}

function getPendingForSubscriber(tenantId, subscriberId) {
  return getPendingForSub.all({ tenantId, subscriberId });
}

function getStatus(tenantId) {
  const pending = getPendingCount(tenantId);
  const failed = getFailedCount(tenantId);
  const items = getAllPendingAndFailed.all({ tenantId });
  return { pending, failed, items };
}

async function syncOne(pendingId) {
  const item = getPendingByIdStmt.get({ id: pendingId });
  if (!item) throw new Error(`Pending sync item ${pendingId} not found.`);

  try {
    const client = panelService.getClientForSubscriber(item.tenant_id, item.panel_id);
    const payload = item.payload ? JSON.parse(item.payload) : {};

    switch (item.action) {
      case 'disable':
        await client.disableUser(item.xtream_username);
        break;
      case 'enable':
        await client.enableUser(item.xtream_username);
        break;
      case 'extend':
        await client.extendUser(item.xtream_username, payload.newExpiryDate);
        break;
      default:
        throw new Error(`Unknown sync action: ${item.action}`);
    }

    markSynced.run({ id: pendingId });
    return { synced: true };
  } catch (err) {
    markFailed.run({ id: pendingId, error: err.message });
    return { synced: false, error: err.message };
  }
}

async function syncAll(tenantId) {
  const items = getPending.all({ tenantId });
  const results = { synced: 0, failed: 0, errors: [] };

  for (const item of items) {
    try {
      const client = panelService.getClientForSubscriber(item.tenant_id, item.panel_id);
      const payload = item.payload ? JSON.parse(item.payload) : {};

      switch (item.action) {
        case 'disable':
          await client.disableUser(item.xtream_username);
          break;
        case 'enable':
          await client.enableUser(item.xtream_username);
          break;
        case 'extend':
          await client.extendUser(item.xtream_username, payload.newExpiryDate);
          break;
        default:
          throw new Error(`Unknown sync action: ${item.action}`);
      }

      markSynced.run({ id: item.id });
      results.synced++;
    } catch (err) {
      markFailed.run({ id: item.id, error: err.message });
      results.failed++;
      results.errors.push({ id: item.id, username: item.xtream_username, error: err.message });
    }
  }

  return results;
}

function retryFailed(pendingId) {
  resetToRetry.run({ id: pendingId });
}

function clearSynced(tenantId) {
  return clearSyncedStmt.run({ tenantId }).changes;
}

function isConnectionError(err) {
  const code = err.code || '';
  const msg = err.message || '';
  return code === 'ECONNREFUSED'
    || code === 'ETIMEDOUT'
    || code === 'ENOTFOUND'
    || code === 'ENETUNREACH'
    || msg.includes('timeout')
    || msg.includes('ECONNREFUSED')
    || msg.includes('ETIMEDOUT')
    || msg.includes('Network Error');
}

module.exports = {
  addPendingChange,
  getPendingChanges,
  getPendingCount,
  getFailedCount,
  getPendingForSubscriber,
  getStatus,
  syncOne,
  syncAll,
  retryFailed,
  clearSynced,
  isConnectionError,
};
