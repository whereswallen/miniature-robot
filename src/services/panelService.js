const db = require('../db/connection');
const { createXtreamClient } = require('../api/xtream');
const config = require('../config');
const tenantService = require('./tenantService');

const clientCache = new Map();

const insertPanel = db.prepare(`
  INSERT INTO panels (tenant_id, name, url, username, password, is_default, is_active)
  VALUES (@tenantId, @name, @url, @username, @password, @isDefault, @isActive)
`);

const updatePanel = db.prepare(`
  UPDATE panels SET name = @name, url = @url, username = @username, password = @password,
    is_default = @isDefault, is_active = @isActive
  WHERE id = @id AND tenant_id = @tenantId
`);

const deactivatePanel = db.prepare(`UPDATE panels SET is_active = 0 WHERE id = @id AND tenant_id = @tenantId`);

const clearDefault = db.prepare(`UPDATE panels SET is_default = 0 WHERE is_default = 1 AND tenant_id = @tenantId`);

const getAllPanels = db.prepare(`SELECT * FROM panels WHERE tenant_id = @tenantId ORDER BY is_default DESC, name ASC`);
const getActivePanels = db.prepare(`SELECT * FROM panels WHERE tenant_id = @tenantId AND is_active = 1 ORDER BY is_default DESC, name ASC`);
const getPanelById = db.prepare(`SELECT * FROM panels WHERE id = @id AND tenant_id = @tenantId`);
const getDefaultPanelStmt = db.prepare(`SELECT * FROM panels WHERE tenant_id = @tenantId AND is_default = 1 AND is_active = 1 LIMIT 1`);
const getPanelCount = db.prepare(`SELECT COUNT(*) as count FROM panels WHERE tenant_id = @tenantId`);
const getPanelByName = db.prepare(`SELECT * FROM panels WHERE tenant_id = @tenantId AND name = @name LIMIT 1`);

function cacheKey(tenantId, panelId) {
  return `${tenantId}:${panelId}`;
}

function getClient(tenantId, panelId) {
  const key = cacheKey(tenantId, panelId);
  if (clientCache.has(key)) return clientCache.get(key);

  const panel = getPanelById.get({ id: panelId, tenantId });
  if (!panel) throw new Error(`Panel ${panelId} not found.`);
  if (!panel.is_active) throw new Error(`Panel "${panel.name}" is inactive.`);

  const client = createXtreamClient({
    url: panel.url,
    username: panel.username,
    password: panel.password,
  });

  clientCache.set(key, client);
  return client;
}

function getClientForSubscriber(tenantId, panelId) {
  if (!panelId) {
    const def = getDefaultPanelStmt.get({ tenantId });
    if (!def) throw new Error('No default panel configured.');
    return getClient(tenantId, def.id);
  }
  return getClient(tenantId, panelId);
}

function clearClientCache(tenantId, panelId) {
  if (tenantId && panelId) {
    clientCache.delete(cacheKey(tenantId, panelId));
  } else if (tenantId) {
    const prefix = `${tenantId}:`;
    for (const key of clientCache.keys()) {
      if (key.startsWith(prefix)) {
        clientCache.delete(key);
      }
    }
  } else {
    clientCache.clear();
  }
}

function addPanel(tenantId, { name, url, username, password, isDefault = false }) {
  if (!tenantService.checkLimit(tenantId, 'panels')) {
    throw new Error('Panel limit reached for this tenant. Upgrade to add more.');
  }

  const existing = getPanelByName.get({ tenantId, name });
  if (existing) {
    throw new Error(`A panel named "${name}" already exists for this tenant.`);
  }

  if (isDefault) clearDefault.run({ tenantId });
  const result = insertPanel.run({
    tenantId,
    name,
    url: url.replace(/\/+$/, ''),
    username,
    password,
    isDefault: isDefault ? 1 : 0,
    isActive: 1,
  });
  return result.lastInsertRowid;
}

function editPanel(tenantId, id, { name, url, username, password, isDefault }) {
  if (name) {
    const existing = getPanelByName.get({ tenantId, name });
    if (existing && existing.id !== id) {
      throw new Error(`A panel named "${name}" already exists for this tenant.`);
    }
  }

  if (isDefault) clearDefault.run({ tenantId });
  updatePanel.run({
    id,
    tenantId,
    name,
    url: url.replace(/\/+$/, ''),
    username,
    password,
    isDefault: isDefault ? 1 : 0,
    isActive: 1,
  });
  clearClientCache(tenantId, id);
}

function removePanel(tenantId, id) {
  deactivatePanel.run({ id, tenantId });
  clearClientCache(tenantId, id);
}

function listPanels(tenantId, activeOnly = false) {
  return activeOnly ? getActivePanels.all({ tenantId }) : getAllPanels.all({ tenantId });
}

function getPanel(tenantId, id) {
  return getPanelById.get({ id, tenantId });
}

function getDefaultPanel(tenantId) {
  return getDefaultPanelStmt.get({ tenantId });
}

async function healthCheck(tenantId, panelId) {
  const client = getClient(tenantId, panelId);
  return client.healthCheck();
}

async function healthCheckAll(tenantId) {
  const panels = getActivePanels.all({ tenantId });
  const results = [];
  for (const panel of panels) {
    const client = getClient(tenantId, panel.id);
    const health = await client.healthCheck();
    results.push({ ...panel, health });
  }
  return results;
}

function seedFromEnv() {
  const defaultTenantId = 1;
  const count = getPanelCount.get({ tenantId: defaultTenantId }).count;
  if (count > 0) return;

  const { panelUrl, username, password } = config.xtream;
  if (panelUrl && username && password) {
    addPanel(defaultTenantId, {
      name: 'Default Panel',
      url: panelUrl,
      username,
      password,
      isDefault: true,
    });
    console.log('Seeded default panel from environment variables.');
  }
}

module.exports = {
  getClient,
  getClientForSubscriber,
  clearClientCache,
  addPanel,
  editPanel,
  removePanel,
  listPanels,
  getPanel,
  getDefaultPanel,
  healthCheck,
  healthCheckAll,
  seedFromEnv,
};
