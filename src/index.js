const config = require('./config');
const { initialize } = require('./db/schema');
const panelService = require('./services/panelService');
const authService = require('./services/authService');
const botRegistry = require('./services/botRegistry');
const customerNotification = require('./services/customerNotificationService');
const { createApp } = require('./web/app');
const scheduler = require('./scheduler/cron');

async function main() {
  // Initialize database tables and migrations
  initialize();
  console.log('Database initialized.');

  // Seed default panel from env vars (if no panels exist for default tenant)
  panelService.seedFromEnv();

  // Seed super admin for web login
  await authService.seedSuperAdmin();

  // Migrate legacy env-based bot tokens to default tenant if needed
  const tenantService = require('./services/tenantService');
  const defaultTenant = tenantService.getTenant(1);
  if (defaultTenant && !defaultTenant.admin_bot_token && config.telegram.token) {
    tenantService.configureBots(1, {
      adminBotToken: config.telegram.token,
      customerBotToken: config.customerBot.token,
      adminChatIds: config.telegram.authorizedChatIds.join(','),
    });
    console.log('Migrated bot tokens from env vars to default tenant.');
  }

  // Initialize all tenant bots via registry
  botRegistry.initializeAllBots();

  // Wire customer notification service to bot registry
  customerNotification.setBotRegistry(botRegistry);

  // Start web dashboard
  const app = createApp();
  app.listen(config.web.port, () => {
    console.log(`Web dashboard running on http://localhost:${config.web.port}`);
  });

  // Start scheduled tasks
  scheduler.start();

  console.log('LineTrack is running.');
}

main().catch((err) => {
  console.error('Failed to start:', err.message);
  process.exit(1);
});
