const { Router } = require('express');
const { requireAuthPage } = require('../middleware/auth');

const router = Router();

router.get('/login', (req, res) => {
  res.render('login');
});

router.get('/signup', (req, res) => {
  res.render('signup');
});

router.get('/', requireAuthPage, (req, res) => {
  res.render('dashboard', { admin: req.admin, role: req.role });
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
