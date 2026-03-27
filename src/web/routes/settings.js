const { Router } = require('express');
const path = require('path');
const fs = require('fs');
const authService = require('../../services/authService');
const config = require('../../config');
const db = require('../../db/connection');
const { requireAuthAPI, requireSuperAdmin } = require('../middleware/auth');

const router = Router();
router.use(requireAuthAPI);

// Tenant settings key-value
router.get('/', (req, res) => {
  try {
    const rows = db.prepare('SELECT * FROM tenant_settings WHERE tenant_id = ?').all(req.tenantId);
    const settings = {};
    for (const row of rows) settings[row.key] = row.value;
    res.json(settings);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/', (req, res) => {
  try {
    const upsert = db.prepare('INSERT OR REPLACE INTO tenant_settings (tenant_id, key, value) VALUES (@tenantId, @key, @value)');
    const entries = Object.entries(req.body);
    const txn = db.transaction((items) => {
      for (const [key, value] of items) {
        upsert.run({ tenantId: req.tenantId, key, value: String(value) });
      }
    });
    txn(entries);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Onboarding
router.post('/onboarding/complete', (req, res) => {
  try {
    db.prepare('INSERT OR REPLACE INTO tenant_settings (tenant_id, key, value) VALUES (?, ?, ?)').run(req.tenantId, 'onboarding_complete', '1');
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/onboarding/skip', (req, res) => {
  try {
    db.prepare('INSERT OR REPLACE INTO tenant_settings (tenant_id, key, value) VALUES (?, ?, ?)').run(req.tenantId, 'onboarding_complete', '1');
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin accounts (scoped to tenant)
router.get('/admins', (req, res) => {
  try {
    res.json(authService.getAdmins(req.tenantId));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/admins', async (req, res) => {
  try {
    const { username, password, displayName } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Username and password required' });
    const id = await authService.createAdmin(username, password, displayName, req.tenantId, 'tenant_admin');
    res.status(201).json({ id });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.put('/admins/:id', (req, res) => {
  try {
    authService.editAdmin(parseInt(req.params.id, 10), req.body);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.put('/admins/:id/password', async (req, res) => {
  try {
    const { password } = req.body;
    if (!password) return res.status(400).json({ error: 'Password required' });
    await authService.changePassword(parseInt(req.params.id, 10), password);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/admins/:id', (req, res) => {
  try {
    authService.removeAdmin(parseInt(req.params.id, 10), req.tenantId);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Backups — super admin only (database-level operation)
const backupService = require('../../services/backupService');

router.get('/backups', requireSuperAdmin, (req, res) => {
  try {
    const stats = backupService.getBackupStats();
    const backups = backupService.listBackups();
    res.json({ stats, backups });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/backups', requireSuperAdmin, (req, res) => {
  try {
    const { label } = req.body || {};
    const backup = backupService.createBackup(label || '');
    res.status(201).json(backup);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/backups/:filename/download', requireSuperAdmin, (req, res) => {
  try {
    const filePath = backupService.getBackupPath(req.params.filename);
    if (!filePath) return res.status(404).json({ error: 'Backup not found' });
    res.setHeader('Content-Disposition', `attachment; filename=${req.params.filename}`);
    res.sendFile(filePath);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/backups/:filename/restore', requireSuperAdmin, (req, res) => {
  try {
    const result = backupService.restoreBackup(req.params.filename);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/backups/:filename', requireSuperAdmin, (req, res) => {
  try {
    backupService.deleteBackup(req.params.filename);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/backup', requireSuperAdmin, (req, res) => {
  try {
    const dbPath = path.resolve(config.db.path);
    if (!fs.existsSync(dbPath)) return res.status(404).json({ error: 'Database not found' });
    res.setHeader('Content-Disposition', `attachment; filename=backup_${new Date().toISOString().split('T')[0]}.db`);
    res.sendFile(dbPath);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
