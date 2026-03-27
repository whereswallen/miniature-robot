const TelegramBot = require('node-telegram-bot-api');
const tenantService = require('./tenantService');

const tenantBots = new Map(); // tenantId -> { adminBot, customerBot }

function registerAdminHandlers(bot, tenantId) {
  const helpHandler = require('../bot/handlers/help');
  const statsHandler = require('../bot/handlers/stats');
  const userInfoHandler = require('../bot/handlers/userInfo');
  const listAllHandler = require('../bot/handlers/listAll');
  const listExpiringHandler = require('../bot/handlers/listExpiring');
  const addUserHandler = require('../bot/handlers/addUser');
  const killUserHandler = require('../bot/handlers/killUser');
  const enableUserHandler = require('../bot/handlers/enableUser');
  const extendHandler = require('../bot/handlers/extend');
  const genlinkHandler = require('../bot/handlers/genlink');
  const paymentHandler = require('../bot/handlers/payment');
  const balanceHandler = require('../bot/handlers/balance');
  const panelsHandler = require('../bot/handlers/panels');
  const backupHandler = require('../bot/handlers/backup');
  const syncHandler = require('../bot/handlers/sync');
  const healthHandler = require('../bot/handlers/health');

  helpHandler.register(bot, tenantId);
  statsHandler.register(bot, tenantId);
  userInfoHandler.register(bot, tenantId);
  listExpiringHandler.register(bot, tenantId);
  addUserHandler.register(bot, tenantId);
  killUserHandler.register(bot, tenantId);
  enableUserHandler.register(bot, tenantId);
  extendHandler.register(bot, tenantId);
  genlinkHandler.register(bot, tenantId);
  paymentHandler.register(bot, tenantId);
  balanceHandler.register(bot, tenantId);
  panelsHandler.register(bot, tenantId);
  backupHandler.register(bot, tenantId);
  syncHandler.register(bot, tenantId);
  healthHandler.register(bot, tenantId);
  listAllHandler.register(bot, tenantId);

  bot.setMyCommands([
    { command: 'start', description: 'Start the bot' },
    { command: 'help', description: 'Show available commands' },
    { command: 'adduser', description: 'Add a new subscriber' },
    { command: 'kill', description: 'Disable user access' },
    { command: 'enable', description: 'Re-enable user access' },
    { command: 'extend', description: 'Extend subscription' },
    { command: 'info', description: 'Look up user details' },
    { command: 'expiring', description: 'List expiring subscribers' },
    { command: 'list', description: 'List all active subscribers' },
    { command: 'stats', description: 'Show dashboard statistics' },
    { command: 'payment', description: 'Record a payment' },
    { command: 'balance', description: 'Check subscriber balance' },
    { command: 'panels', description: 'Panel health status' },
    { command: 'genlink', description: 'Generate customer link code' },
    { command: 'backup', description: 'Create/list/stats backups' },
    { command: 'sync', description: 'Sync pending changes to panel' },
    { command: 'health', description: 'System health pulse' },
  ]);
}

function registerCustomerHandlers(bot, tenantId) {
  const linkHandler = require('../bot/customer/handlers/link');
  const statusHandler = require('../bot/customer/handlers/status');
  const expiryHandler = require('../bot/customer/handlers/expiry');
  const paymentsHandler = require('../bot/customer/handlers/payments');
  const supportHandler = require('../bot/customer/handlers/support');
  const helpHandler = require('../bot/customer/handlers/help');

  linkHandler.register(bot, tenantId);
  statusHandler.register(bot, tenantId);
  expiryHandler.register(bot, tenantId);
  paymentsHandler.register(bot, tenantId);
  supportHandler.register(bot, tenantId);
  helpHandler.register(bot, tenantId);
}

function registerTenantBots(tenantId) {
  const tenant = tenantService.getTenant(tenantId);
  if (!tenant) return null;

  const entry = { adminBot: null, customerBot: null };

  if (tenant.admin_bot_token) {
    try {
      const adminBot = new TelegramBot(tenant.admin_bot_token, { polling: true });
      registerAdminHandlers(adminBot, tenantId);
      adminBot.on('polling_error', (err) => {
        console.error(`[Tenant ${tenantId}] Admin bot polling error: ${err.message}`);
      });
      entry.adminBot = adminBot;
      console.log(`[Tenant ${tenantId}] Admin bot started.`);
    } catch (err) {
      console.error(`[Tenant ${tenantId}] Failed to start admin bot: ${err.message}`);
    }
  }

  if (tenant.customer_bot_token) {
    try {
      const customerBot = new TelegramBot(tenant.customer_bot_token, { polling: true });
      registerCustomerHandlers(customerBot, tenantId);
      customerBot.on('polling_error', (err) => {
        console.error(`[Tenant ${tenantId}] Customer bot polling error: ${err.message}`);
      });
      entry.customerBot = customerBot;
      console.log(`[Tenant ${tenantId}] Customer bot started.`);
    } catch (err) {
      console.error(`[Tenant ${tenantId}] Failed to start customer bot: ${err.message}`);
    }
  }

  tenantBots.set(tenantId, entry);
  return entry;
}

function unregisterTenantBots(tenantId) {
  const entry = tenantBots.get(tenantId);
  if (!entry) return;

  if (entry.adminBot) {
    entry.adminBot.stopPolling();
    console.log(`[Tenant ${tenantId}] Admin bot stopped.`);
  }
  if (entry.customerBot) {
    entry.customerBot.stopPolling();
    console.log(`[Tenant ${tenantId}] Customer bot stopped.`);
  }

  tenantBots.delete(tenantId);
}

function initializeAllBots() {
  const tenants = tenantService.listActiveTenants();
  let started = 0;

  for (const tenant of tenants) {
    if (tenant.admin_bot_token || tenant.customer_bot_token) {
      registerTenantBots(tenant.id);
      started++;
    }
  }

  console.log(`Bot registry initialized: ${started} tenant(s) with bots.`);
}

function getAdminBot(tenantId) {
  const entry = tenantBots.get(tenantId);
  return entry?.adminBot || null;
}

function getCustomerBot(tenantId) {
  const entry = tenantBots.get(tenantId);
  return entry?.customerBot || null;
}

function getTenantCount() {
  return tenantBots.size;
}

module.exports = {
  registerTenantBots,
  unregisterTenantBots,
  initializeAllBots,
  getAdminBot,
  getCustomerBot,
  getTenantCount,
};
