const { Router } = require('express');
const userService = require('../../services/userService');
const { requireAuthAPI } = require('../middleware/auth');

const router = Router();
router.use(requireAuthAPI);

router.get('/', (req, res) => {
  try {
    const { page, limit, status, search, panelId, sortBy, sortDir } = req.query;
    const result = userService.listSubscribers({
      page: parseInt(page, 10) || 1,
      limit: parseInt(limit, 10) || 25,
      status,
      search,
      panelId: panelId ? parseInt(panelId, 10) : undefined,
      sortBy,
      sortDir,
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', (req, res) => {
  try {
    const sub = userService.getSubscriberWithDetails(parseInt(req.params.id, 10));
    if (!sub) return res.status(404).json({ error: 'Not found' });
    res.json(sub);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const result = await userService.createUser(req.body);
    res.status(201).json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.put('/:id', (req, res) => {
  try {
    userService.updateSubscriberInfo(parseInt(req.params.id, 10), req.body);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/:id/kill', async (req, res) => {
  try {
    await userService.disableUserById(parseInt(req.params.id, 10));
    res.json({ ok: true, message: 'Access killed' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/:id/enable', async (req, res) => {
  try {
    await userService.enableUserById(parseInt(req.params.id, 10));
    res.json({ ok: true, message: 'Access restored' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/:id/extend', async (req, res) => {
  try {
    const { days, date } = req.body;
    const sub = userService.getSubscriberById(parseInt(req.params.id, 10));
    if (!sub) return res.status(404).json({ error: 'Not found' });

    let newExpiry;
    if (date) {
      newExpiry = date;
    } else if (days) {
      const base = new Date(sub.expiry_date) > new Date() ? new Date(sub.expiry_date) : new Date();
      base.setDate(base.getDate() + parseInt(days, 10));
      newExpiry = base.toISOString().split('T')[0];
    } else {
      return res.status(400).json({ error: 'Provide days or date' });
    }

    await userService.extendUserById(parseInt(req.params.id, 10), newExpiry);
    res.json({ ok: true, newExpiry });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
