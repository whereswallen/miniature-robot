const { Router } = require('express');
const financialService = require('../../services/financialService');
const { requireAuthAPI } = require('../middleware/auth');

const router = Router();
router.use(requireAuthAPI);

router.get('/', (req, res) => {
  try {
    const { page, limit, subscriberId } = req.query;
    const result = financialService.getAllPayments(req.tenantId, {
      page: parseInt(page, 10) || 1,
      limit: parseInt(limit, 10) || 25,
      subscriberId: subscriberId ? parseInt(subscriberId, 10) : undefined,
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/subscriber/:id', (req, res) => {
  try {
    const payments = financialService.getPaymentHistory(req.tenantId, parseInt(req.params.id, 10));
    res.json(payments);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/outstanding', (req, res) => {
  try {
    res.json(financialService.getOutstandingBalances(req.tenantId));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', (req, res) => {
  try {
    const { subscriberId, amount, currency, method, notes } = req.body;
    if (!subscriberId || !amount) return res.status(400).json({ error: 'subscriberId and amount required' });
    financialService.recordPayment(req.tenantId, parseInt(subscriberId, 10), { amount: parseFloat(amount), currency, method, notes });
    res.status(201).json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/credit', (req, res) => {
  try {
    const { subscriberId, amount, notes } = req.body;
    if (!subscriberId || !amount) return res.status(400).json({ error: 'subscriberId and amount required' });
    financialService.addCredit(req.tenantId, parseInt(subscriberId, 10), parseFloat(amount), notes);
    res.status(201).json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/invoice/:id', (req, res) => {
  try {
    const data = financialService.generateInvoiceData(req.tenantId, parseInt(req.params.id, 10));
    res.json(data);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/invoice/:id/download', async (req, res) => {
  const pdfQueue = require('../../services/pdfQueue');
  const invoiceService = require('../../services/invoiceService');
  const paymentId = parseInt(req.params.id, 10);

  try {
    await pdfQueue.enqueue(() => {
      const doc = invoiceService.generateInvoicePDF(req.tenantId, paymentId);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename=invoice-${paymentId}.pdf`);
      return new Promise((resolve, reject) => {
        doc.pipe(res);
        doc.on('end', resolve);
        doc.on('error', reject);
      });
    });
  } catch (err) {
    if (err.message === 'Queue full') {
      res.status(503).json({ error: 'Server busy generating PDFs. Try again shortly.' });
    } else {
      res.status(400).json({ error: err.message });
    }
  }
});

module.exports = router;
