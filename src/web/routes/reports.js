const { Router } = require('express');
const financialService = require('../../services/financialService');
const userService = require('../../services/userService');
const { requireAuthAPI } = require('../middleware/auth');

const router = Router();
router.use(requireAuthAPI);

router.get('/stats', (req, res) => {
  try {
    res.json(userService.getStats());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/revenue', (req, res) => {
  try {
    const { startDate, endDate, groupBy } = req.query;
    if (!startDate || !endDate) return res.status(400).json({ error: 'startDate and endDate required' });
    res.json(financialService.getRevenueReport({ startDate, endDate, groupBy }));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/methods', (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    if (!startDate || !endDate) return res.status(400).json({ error: 'startDate and endDate required' });
    res.json(financialService.getPaymentMethodBreakdown({ startDate, endDate }));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/profit', (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    if (!startDate || !endDate) return res.status(400).json({ error: 'startDate and endDate required' });
    res.json(financialService.getProfitReport({ startDate, endDate }));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
