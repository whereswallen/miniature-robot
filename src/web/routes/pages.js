const { Router } = require('express');
const { requireAuthPage } = require('../middleware/auth');

const router = Router();

router.get('/login', (req, res) => {
  res.render('login');
});

router.get('/', requireAuthPage, (req, res) => {
  res.render('dashboard', { admin: req.admin });
});

router.get('/subscribers', requireAuthPage, (req, res) => {
  res.render('subscribers', { admin: req.admin });
});

router.get('/subscribers/:id', requireAuthPage, (req, res) => {
  res.render('subscriber-detail', { admin: req.admin, subscriberId: req.params.id });
});

router.get('/reports', requireAuthPage, (req, res) => {
  res.render('reports', { admin: req.admin });
});

router.get('/bulk', requireAuthPage, (req, res) => {
  res.render('bulk', { admin: req.admin });
});

router.get('/settings', requireAuthPage, (req, res) => {
  res.render('settings', { admin: req.admin });
});

module.exports = router;
