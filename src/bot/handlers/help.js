const { withAuth } = require('../middleware/auth');

function register(bot, tenantId) {
  const helpText = [
    'LineTrack - Commands:\n',
    '/adduser - Add a new subscriber',
    '/kill <username> - Disable user access',
    '/enable <username> - Re-enable user access',
    '/extend <username> <days> - Extend subscription',
    '/info <username or name> - Look up user details',
    '/expiring [days] - List users expiring soon (default 7)',
    '/list - List all active subscribers',
    '/stats - Show dashboard statistics',
    '/payment <username> <amount> [method] - Record payment',
    '/balance <username> - Check subscriber balance',
    '/panels - Panel health status',
    '/genlink <username> - Generate customer link code',
    '/backup [label] - Create a backup',
    '/backup list - List all backups',
    '/backup stats - Backup statistics',
    '/sync - Sync pending changes to panel',
    '/sync status - View pending sync queue',
    '/help - Show this message',
  ].join('\n');

  bot.onText(/\/start/, withAuth(bot, tenantId, async (msg) => {
    await bot.sendMessage(msg.chat.id, `Welcome to LineTrack!\n\n${helpText}`);
  }));

  bot.onText(/\/help/, withAuth(bot, tenantId, async (msg) => {
    await bot.sendMessage(msg.chat.id, helpText);
  }));
}

module.exports = { register };
