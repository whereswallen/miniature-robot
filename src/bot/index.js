const TelegramBot = require('node-telegram-bot-api');
const config = require('../config');

const helpHandler = require('./handlers/help');
const statsHandler = require('./handlers/stats');
const userInfoHandler = require('./handlers/userInfo');
const listAllHandler = require('./handlers/listAll');
const listExpiringHandler = require('./handlers/listExpiring');
const addUserHandler = require('./handlers/addUser');
const killUserHandler = require('./handlers/killUser');
const enableUserHandler = require('./handlers/enableUser');
const extendHandler = require('./handlers/extend');
const genlinkHandler = require('./handlers/genlink');
const paymentHandler = require('./handlers/payment');
const balanceHandler = require('./handlers/balance');
const panelsHandler = require('./handlers/panels');
const backupHandler = require('./handlers/backup');

function createBot() {
  const bot = new TelegramBot(config.telegram.token, { polling: true });

  // Register command handlers
  helpHandler.register(bot);
  statsHandler.register(bot);
  userInfoHandler.register(bot);
  listExpiringHandler.register(bot);
  addUserHandler.register(bot);
  killUserHandler.register(bot);
  enableUserHandler.register(bot);
  extendHandler.register(bot);
  genlinkHandler.register(bot);
  paymentHandler.register(bot);
  balanceHandler.register(bot);
  panelsHandler.register(bot);
  backupHandler.register(bot);
  // listAll registered last — its /list regex could match /listexpiring
  listAllHandler.register(bot);

  // Set bot commands menu
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
  ]);

  bot.on('polling_error', (err) => {
    console.error('Telegram polling error:', err.message);
  });

  console.log('Admin Telegram bot started.');
  return bot;
}

module.exports = { createBot };
