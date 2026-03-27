const { Router } = require('express');
const multer = require('multer');
const { Parser } = require('json2csv');
const bulkService = require('../../services/bulkService');
const userService = require('../../services/userService');
const { requireAuthAPI } = require('../middleware/auth');

const router = Router();
router.use(requireAuthAPI);

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

router.post('/import/preview', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    let rows;
    const ext = req.file.originalname.toLowerCase();
    if (ext.endsWith('.csv')) {
      rows = await bulkService.parseCSV(req.file.buffer);
    } else if (ext.endsWith('.xlsx') || ext.endsWith('.xls')) {
      rows = bulkService.parseXLSX(req.file.buffer);
    } else {
      return res.status(400).json({ error: 'Unsupported file type. Use CSV or XLSX.' });
    }

    const preview = bulkService.previewImport(req.tenantId, rows);
    req.app.locals.pendingImport = rows;
    res.json(preview);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/import/execute', (req, res) => {
  try {
    const rows = req.app.locals.pendingImport;
    if (!rows) return res.status(400).json({ error: 'No pending import. Upload a file first.' });

    const { panelId } = req.body;
    const result = bulkService.executeImport(req.tenantId, rows, panelId ? parseInt(panelId, 10) : null);
    delete req.app.locals.pendingImport;
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/export/subscribers', (req, res) => {
  try {
    const { status, panelId } = req.query;
    const data = bulkService.exportSubscribers(req.tenantId, { status, panelId: panelId ? parseInt(panelId, 10) : undefined });
    if (data.length === 0) return res.status(404).json({ error: 'No data to export' });

    const parser = new Parser();
    const csv = parser.parse(data);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=subscribers.csv');
    res.send(csv);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/export/payments', (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const data = bulkService.exportPayments(req.tenantId, { startDate, endDate });
    if (data.length === 0) return res.status(404).json({ error: 'No data to export' });

    const parser = new Parser();
    const csv = parser.parse(data);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=payments.csv');
    res.send(csv);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/export/template', (req, res) => {
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename=import_template.csv');
  res.send(bulkService.getCSVTemplate());
});

router.post('/mass-extend', async (req, res) => {
  try {
    const { ids, days } = req.body;
    if (!ids?.length || !days) return res.status(400).json({ error: 'ids and days required' });
    const result = await userService.bulkExtend(req.tenantId, ids.map(Number), parseInt(days, 10));
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/mass-disable', async (req, res) => {
  try {
    const { ids } = req.body;
    if (!ids?.length) return res.status(400).json({ error: 'ids required' });
    const result = await userService.bulkDisable(req.tenantId, ids.map(Number));
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/mass-enable', async (req, res) => {
  try {
    const { ids } = req.body;
    if (!ids?.length) return res.status(400).json({ error: 'ids required' });
    const result = await userService.bulkEnable(req.tenantId, ids.map(Number));
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
