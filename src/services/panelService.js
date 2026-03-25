const db = require('../db/connection');
const { createXtreamClient } = require('../api/xtream');
const config = require('../config');

const clientCache = new Map();

const insertPanel = db.prepare(`
  INSERT INTO panels (name, url, username, password, is_default, is_active)
  VALUES (@name, @url, @username, @password, @isDefault, @isActive)
`);

const updatePanel = db.prepare(`
  UPDATE panels SET name = @name, url = @url, username = @username, password = @password,
    is_default = @isDefault, is_active = @isActive
  WHERE id = @id
`);

const deactivatePanel = db.prepare(`UPDATE panels SET is_active = 0 WHERE id = @id`);

const clearDefault = db.prepare(`UPDATE panels SET is_default = 0 WHERE is_default = 1`);

const getAllPanels = db.prepare(`SELECT * FROM panels ORDER BY is_default DESC, name ASC`);
const getActivePanels = db.prepare(`SELECT * FROM panels WHERE is_active = 1 ORDER BY is_default DESC, name ASC`);
const getPanelById = db.prepare(`SELECT * FROM panels WHERE id = @id`);
const getDefaultPanel = db.prepare(`SELECT * FROM panels WHERE is_default = 1 AND is_active = 1 LIMIT 1`);
const getPanelCount = db.prepare(`SELECT COUNT(*) as count FROM panels`);

function getClient(panelId) {
  if (clientCache.has(panelId)) return clientCache.get(panelId);

  const panel = getPanelById.get({ id: panelId });
  if (!panel) throw new Error(`Panel ${panelId} not found.`);
  if (!panel.is_active) throw new Error(`Panel "${panel.name}" is inactive.`);

  const client = createXtreamClient({
    url: panel.url,
    username: panel.username,
    password: panel.password,
  });

  clientCache.set(panelId, client);
  return client;
}

function getClientForSubscriber(panelId) {
  if (!panelId) {
    const def = getDefaultPanel.get();
    if (!def) throw new Error('No default panel configured.');
    return getClient(def.id);
  }
  return getClient(panelId);
}

function clearClientCache(panelId) {
  if (panelId) {
    clientCache.delete(panelId);
  } else {
    clientCache.clear();
  }
}

function addPanel({ name, url, username, password, isDefault = false }) {
  if (isDefault) clearDefault.run();
  const result = insertPanel.run({
    name,
    url: url.replace(/\/+$/, ''),
    username,
    password,
    isDefault: isDefault ? 1 : 0,
    isActive: 1,
  });
  return result.lastInsertRowid;
}

function editPanel(id, { name, url, username, password, isDefault }) {
  if (isDefault) clearDefault.run();
  updatePanel.run({
    id,
    name,
    url: url.replace(/\/+$/, ''),
    username,
    password,
    isDefault: isDefault ? 1 : 0,
    isActive: 1,
  });
  clearClientCache(id);
}

function removePanel(id) {
  deactivatePanel.run({ id });
  clearClientCache(id);
}

function listPanels(activeOnly = false) {
  return activeOnly ? getActivePanels.all() : getAllPanels.all();
}

function getPanel(id) {
  return getPanelById.get({ id });
}

function getDefault() {
  return getDefaultPanel.get();
}

async function healthCheck(panelId) {
  const client = getClient(panelId);
  return client.healthCheck();
}

async function healthCheckAll() {
  const panels = getActivePanels.all();
  const results = [];
  for (const panel of panels) {
    const client = getClient(panel.id);
    const health = await client.healthCheck();
    results.push({ ...panel, health });
  }
  return results;
}

function seedFromEnv() {
  const count = getPanelCount.get().count;
  if (count > 0) return;

  const { panelUrl, username, password } = config.xtream;
  if (panelUrl && username && password) {
    addPanel({
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
  getDefault,
  healthCheck,
  healthCheckAll,
  seedFromEnv,
};
