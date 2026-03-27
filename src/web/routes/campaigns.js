const { Router } = require('express');
const recaptureService = require('../../services/recaptureService');
const { requireAuthAPI } = require('../middleware/auth');

const router = Router();
router.use(requireAuthAPI);

router.get('/', (req, res) => {
  try {
    res.json(recaptureService.getAllCampaigns(req.tenantId));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', (req, res) => {
  try {
    const { name, daysAfterExpiry, messageTemplate, offerText, enabled } = req.body;
    if (!name || !daysAfterExpiry || !messageTemplate) {
      return res.status(400).json({ error: 'name, daysAfterExpiry, and messageTemplate required' });
    }
    const id = recaptureService.createCampaign(req.tenantId, {
      name, daysAfterExpiry: parseInt(daysAfterExpiry, 10), messageTemplate, offerText, enabled,
    });
    res.status(201).json({ id });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.put('/:id', (req, res) => {
  try {
    const campaign = recaptureService.getCampaign(req.tenantId, parseInt(req.params.id, 10));
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
    recaptureService.updateCampaignById(req.tenantId, parseInt(req.params.id, 10), {
      name: req.body.name ?? campaign.name,
      enabled: req.body.enabled ?? campaign.enabled,
      daysAfterExpiry: req.body.daysAfterExpiry ?? campaign.days_after_expiry,
      messageTemplate: req.body.messageTemplate ?? campaign.message_template,
      offerText: req.body.offerText ?? campaign.offer_text,
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/stats', (req, res) => {
  try {
    res.json(recaptureService.getCampaignStats(req.tenantId));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
