const { Router } = require('express');
const path = require('path');
const fs = require('fs');
const authService = require('../../services/authService');
const config = require('../../config');
const db = require('../../db/connection');
const { requireAuthAPI } = require('../middleware/auth');

const router = Router();
router.use(requireAuthAPI);

// Settings key-value
router.get('/', (req, res) => {
  try {
    const rows = db.prepare('SELECT * FROM settings').all();
    const settings = {};
    for (const row of rows) settings[row.key] = row.value;
    res.json(settings);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/', (req, res) => {
  try {
    const upsert = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (@key, @value)');
    const entries = Object.entries(req.body);
    const txn = db.transaction((items) => {
      for (const [key, value] of items) {
        upsert.run({ key, value: String(value) });
      }
    });
    txn(entries);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Admin accounts
router.get('/admins', (req, res) => {
  try {
    res.json(authService.getAdmins());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/admins', async (req, res) => {
  try {
    const { username, password, displayName } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Username and password required' });
    const id = await authService.createAdmin(username, password, displayName);
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
    authService.removeAdmin(parseInt(req.params.id, 10));
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Backups
const backupService = require('../../services/backupService');

router.get('/backups', (req, res) => {
  try {
    const stats = backupService.getBackupStats();
    const backups = backupService.listBackups();
    res.json({ stats, backups });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/backups', (req, res) => {
  try {
    const { label } = req.body || {};
    const backup = backupService.createBackup(label || '');
    res.status(201).json(backup);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/backups/:filename/download', (req, res) => {
  try {
    const filePath = backupService.getBackupPath(req.params.filename);
    if (!filePath) return res.status(404).json({ error: 'Backup not found' });
    res.setHeader('Content-Disposition', `attachment; filename=${req.params.filename}`);
    res.sendFile(filePath);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/backups/:filename/restore', (req, res) => {
  try {
    const result = backupService.restoreBackup(req.params.filename);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/backups/:filename', (req, res) => {
  try {
    backupService.deleteBackup(req.params.filename);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Legacy single-download endpoint (kept for backward compat)
router.get('/backup', (req, res) => {
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
