const { Router } = require('express');
const authService = require('../../services/authService');
const { requireAuthAPI } = require('../middleware/auth');

const router = Router();

router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Username and password required' });

    const admin = await authService.validateLogin(username, password);
    if (!admin) return res.status(401).json({ error: 'Invalid credentials' });

    const token = authService.generateToken(admin);
    res.cookie('token', token, { httpOnly: true, maxAge: 24 * 60 * 60 * 1000 });
    res.json({ token, admin });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ ok: true });
});

router.get('/me', requireAuthAPI, (req, res) => {
  res.json({ admin: req.admin });
});

module.exports = router;
