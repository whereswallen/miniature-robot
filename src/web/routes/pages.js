const { Router } = require('express');
const { requireAuthPage } = require('../middleware/auth');
const db = require('../../db/connection');

const router = Router();

router.get('/login', (req, res) => {
  res.render('login');
});

router.get('/signup', (req, res) => {
  res.render('signup');
});

router.get('/', requireAuthPage, (req, res) => {
  // Redirect new tenants to onboarding if no panels configured
  if (req.role !== 'super_admin') {
    const onboardingDone = db.prepare(
      "SELECT value FROM tenant_settings WHERE tenant_id = ? AND key = 'onboarding_complete'"
    ).get(req.tenantId);
    if (!onboardingDone) {
      const panelCount = db.prepare(
        'SELECT COUNT(*) as count FROM panels WHERE tenant_id = ? AND is_active = 1'
      ).get(req.tenantId);
      if (panelCount.count === 0) {
        return res.redirect('/onboarding');
      }
    }
  }
  res.render('dashboard', { admin: req.admin, role: req.role });
});

router.get('/onboarding', requireAuthPage, (req, res) => {
  res.render('onboarding', { admin: req.admin, role: req.role });
});

router.get('/subscribers', requireAuthPage, (req, res) => {
  res.render('subscribers', { admin: req.admin, role: req.role });
});

router.get('/subscribers/:id', requireAuthPage, (req, res) => {
  res.render('subscriber-detail', { admin: req.admin, role: req.role, subscriberId: req.params.id });
});

router.get('/reports', requireAuthPage, (req, res) => {
  res.render('reports', { admin: req.admin, role: req.role });
});

router.get('/bulk', requireAuthPage, (req, res) => {
  res.render('bulk', { admin: req.admin, role: req.role });
});

router.get('/settings', requireAuthPage, (req, res) => {
  res.render('settings', { admin: req.admin, role: req.role });
});

router.get('/campaigns', requireAuthPage, (req, res) => {
  res.render('campaigns', { admin: req.admin, role: req.role });
});

// Platform pages (super admin only)
router.get('/platform', requireAuthPage, (req, res) => {
  if (req.role !== 'super_admin') return res.redirect('/');
  res.render('platform/dashboard', { admin: req.admin, role: req.role, page: 'platform' });
});

router.get('/platform/tenants', requireAuthPage, (req, res) => {
  if (req.role !== 'super_admin') return res.redirect('/');
  res.render('platform/tenants', { admin: req.admin, role: req.role, page: 'tenants' });
});

router.get('/platform/tenants/:id', requireAuthPage, (req, res) => {
  if (req.role !== 'super_admin') return res.redirect('/');
  res.render('platform/tenant-detail', { admin: req.admin, role: req.role, page: 'tenants', tenantId: req.params.id });
});

router.get('/platform/billing', requireAuthPage, (req, res) => {
  if (req.role !== 'super_admin') return res.redirect('/');
  res.render('platform/billing', { admin: req.admin, role: req.role, page: 'platform-billing' });
});

module.exports = router;
