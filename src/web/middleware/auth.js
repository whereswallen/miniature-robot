const authService = require('../../services/authService');

function requireAuthAPI(req, res, next) {
  try {
    const token = req.cookies?.token || req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: 'Not authenticated' });
    const payload = authService.verifyToken(token);
    req.admin = payload;
    req.tenantId = payload.tenantId;
    req.role = payload.role || 'tenant_admin';
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
    req.tenantId = payload.tenantId;
    req.role = payload.role || 'tenant_admin';
    next();
  } catch {
    return res.redirect('/login');
  }
}

function requireSuperAdmin(req, res, next) {
  if (req.role !== 'super_admin') {
    if (req.path.startsWith('/api/')) {
      return res.status(403).json({ error: 'Super admin access required' });
    }
    return res.redirect('/');
  }
  next();
}

function requireTenantActive(req, res, next) {
  // Super admins bypass tenant status checks
  if (req.role === 'super_admin') return next();

  const tenantService = require('../../services/tenantService');
  const tenant = tenantService.getTenant(req.tenantId);
  if (!tenant) {
    if (req.path.startsWith('/api/')) {
      return res.status(403).json({ error: 'Tenant not found' });
    }
    return res.redirect('/login');
  }

  if (tenant.status === 'suspended' || tenant.status === 'cancelled') {
    if (req.path.startsWith('/api/')) {
      return res.status(403).json({ error: 'Subscription inactive. Please renew to continue.' });
    }
    return res.redirect('/billing');
  }

  // Check trial expiry
  if (tenant.status === 'trial' && tenant.trial_ends_at) {
    const trialEnd = new Date(tenant.trial_ends_at);
    if (trialEnd < new Date()) {
      tenantService.suspendTenant(tenant.id);
      if (req.path.startsWith('/api/')) {
        return res.status(403).json({ error: 'Trial expired. Please subscribe to continue.' });
      }
      return res.redirect('/billing');
    }
  }

  req.tenant = tenant;
  next();
}

module.exports = { requireAuthAPI, requireAuthPage, requireSuperAdmin, requireTenantActive };
