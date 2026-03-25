const authService = require('../../services/authService');

function requireAuthAPI(req, res, next) {
  try {
    const token = req.cookies?.token || req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: 'Not authenticated' });
    const payload = authService.verifyToken(token);
    req.admin = payload;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

function requireAuthPage(req, res, next) {
  try {
    const token = req.cookies?.token;
    if (!token) return res.redirect('/login');
    const payload = authService.verifyToken(token);
    req.admin = payload;
    next();
  } catch {
    return res.redirect('/login');
  }
}

module.exports = { requireAuthAPI, requireAuthPage };
