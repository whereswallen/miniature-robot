const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');

const authRoutes = require('./routes/auth');
const subscriberRoutes = require('./routes/subscribers');
const paymentRoutes = require('./routes/payments');
const panelRoutes = require('./routes/panels');
const reportRoutes = require('./routes/reports');
const bulkRoutes = require('./routes/bulk');
const settingsRoutes = require('./routes/settings');
const pageRoutes = require('./routes/pages');

function createApp() {
  const app = express();

  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, 'views'));

  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());
  app.use(express.static(path.join(__dirname, 'public')));

  // API routes
  app.use('/api/auth', authRoutes);
  app.use('/api/subscribers', subscriberRoutes);
  app.use('/api/payments', paymentRoutes);
  app.use('/api/panels', panelRoutes);
  app.use('/api/reports', reportRoutes);
  app.use('/api/bulk', bulkRoutes);
  app.use('/api/settings', settingsRoutes);

  // Page routes
  app.use('/', pageRoutes);

  // Error handler
  app.use((err, req, res, _next) => {
    console.error('Server error:', err.message);
    if (req.path.startsWith('/api/')) {
      res.status(500).json({ error: err.message });
    } else {
      res.status(500).send('Internal Server Error');
    }
  });

  return app;
}

module.exports = { createApp };
