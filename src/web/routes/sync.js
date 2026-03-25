const { Router } = require('express');
const syncService = require('../../services/syncService');
const { requireAuthAPI } = require('../middleware/auth');

const router = Router();
router.use(requireAuthAPI);

router.get('/status', (req, res) => {
  try {
    const status = syncService.getStatus();
    res.json(status);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/run', async (req, res) => {
  try {
    const result = await syncService.syncAll();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:id/retry', async (req, res) => {
  try {
    syncService.retryFailed(parseInt(req.params.id, 10));
    const result = await syncService.syncOne(parseInt(req.params.id, 10));
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/clear', (req, res) => {
  try {
    const cleared = syncService.clearSynced();
    res.json({ ok: true, cleared });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
