const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const required = [
  'TELEGRAM_BOT_TOKEN',
  'TELEGRAM_AUTHORIZED_CHAT_IDS',
];

const missing = required.filter((key) => !process.env[key]);
if (missing.length > 0) {
  console.error(`Missing required environment variables: ${missing.join(', ')}`);
  console.error('Copy .env.example to .env and fill in your values.');
  process.exit(1);
}

const config = Object.freeze({
  xtream: {
    panelUrl: (process.env.XTREAM_PANEL_URL || '').replace(/\/+$/, '') || null,
    username: process.env.XTREAM_RESELLER_USERNAME || null,
    password: process.env.XTREAM_RESELLER_PASSWORD || null,
  },
  telegram: {
    token: process.env.TELEGRAM_BOT_TOKEN,
    authorizedChatIds: process.env.TELEGRAM_AUTHORIZED_CHAT_IDS
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean),
  },
  customerBot: {
    token: process.env.CUSTOMER_BOT_TOKEN || null,
  },
  web: {
    port: parseInt(process.env.WEB_PORT, 10) || 3000,
    secret: process.env.WEB_SECRET || 'change-me-in-production',
    adminUser: process.env.WEB_ADMIN_USER || 'admin',
    adminPass: process.env.WEB_ADMIN_PASS || 'admin',
  },
  scheduler: {
    cronSchedule: process.env.ALERT_CRON_SCHEDULE || '0 9 * * *',
    alertDaysBefore: (process.env.ALERT_DAYS_BEFORE || '1,3,7')
      .split(',')
      .map((d) => parseInt(d.trim(), 10))
      .filter((d) => !isNaN(d)),
    backupCronSchedule: process.env.BACKUP_CRON_SCHEDULE || '0 2 * * *',
  },
  db: {
    path: process.env.DB_PATH || './data/access_killer.db',
  },
});

module.exports = config;
