const TelegramBot = require('node-telegram-bot-api');
const config = require('../../config');
const customerNotification = require('../../services/customerNotificationService');

const helpHandler = require('./handlers/help');
const linkHandler = require('./handlers/link');
const statusHandler = require('./handlers/status');
const expiryHandler = require('./handlers/expiry');
const paymentsHandler = require('./handlers/payments');
const supportHandler = require('./handlers/support');

function createCustomerBot(tenantId) {
  if (!config.customerBot.token) {
    console.log('Customer bot token not set. Skipping customer bot.');
    return null;
  }

  const bot = new TelegramBot(config.customerBot.token, { polling: true });

  customerNotification.setBot(bot);

  helpHandler.register(bot, tenantId);
  linkHandler.register(bot, tenantId);
  statusHandler.register(bot, tenantId);
  expiryHandler.register(bot, tenantId);
  paymentsHandler.register(bot, tenantId);
  supportHandler.register(bot, tenantId);

  bot.setMyCommands([
    { command: 'start', description: 'Link your account' },
    { command: 'status', description: 'Check subscription status' },
    { command: 'expiry', description: 'Check expiry date' },
    { command: 'payments', description: 'View payment history' },
    { command: 'support', description: 'Contact support' },
    { command: 'help', description: 'Show commands' },
  ]);

  bot.on('polling_error', (err) => {
    console.error('Customer bot polling error:', err.message);
  });

  console.log('Customer Telegram bot started.');
  return bot;
}

module.exports = { createCustomerBot };
