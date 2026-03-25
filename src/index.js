const config = require('./config');
const { initialize } = require('./db/schema');
const panelService = require('./services/panelService');
const authService = require('./services/authService');
const { createBot } = require('./bot');
const { createCustomerBot } = require('./bot/customer');
const { createApp } = require('./web/app');
const scheduler = require('./scheduler/cron');

async function main() {
  // Initialize database tables and migrations
  initialize();
  console.log('Database initialized.');

  // Seed default panel from env vars (if no panels exist yet)
  panelService.seedFromEnv();

  // Seed default admin for web login
  await authService.seedDefaultAdmin();

  // Start admin Telegram bot
  const adminBot = createBot();

  // Start customer Telegram bot (optional)
  const customerBot = createCustomerBot();
  if (customerBot) {
    customerBot.setAdminBot = undefined; // already set via support handler
    // Wire support handler to forward to admin bot
    if (customerBot._textRegExpCallbacks) {
      // The support handler stores setAdminBot on the bot instance
    }
  }
  // Set admin bot ref on customer support handler
  if (customerBot && customerBot.setAdminBot) {
    customerBot.setAdminBot(adminBot);
  }

  // Start web dashboard
  const app = createApp();
  app.listen(config.web.port, () => {
    console.log(`Web dashboard running on http://localhost:${config.web.port}`);
  });

  // Start scheduled tasks
  scheduler.start(adminBot);

  console.log('IPTV Access Killer is running.');
}

main().catch((err) => {
  console.error('Failed to start:', err.message);
  process.exit(1);
});
