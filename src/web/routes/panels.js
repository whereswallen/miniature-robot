const { Router } = require('express');
const panelService = require('../../services/panelService');
const { requireAuthAPI } = require('../middleware/auth');

const router = Router();
router.use(requireAuthAPI);

router.get('/', (req, res) => {
  try {
    res.json(panelService.listPanels());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', (req, res) => {
  try {
    const { name, url, username, password, isDefault } = req.body;
    if (!name || !url || !username || !password) return res.status(400).json({ error: 'All fields required' });
    const id = panelService.addPanel({ name, url, username, password, isDefault: !!isDefault });
    res.status(201).json({ id });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.put('/:id', (req, res) => {
  try {
    panelService.editPanel(parseInt(req.params.id, 10), req.body);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/:id', (req, res) => {
  try {
    panelService.removePanel(parseInt(req.params.id, 10));
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/:id/health', async (req, res) => {
  try {
    const result = await panelService.healthCheck(parseInt(req.params.id, 10));
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/health', async (req, res) => {
  try {
    const results = await panelService.healthCheckAll();
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
