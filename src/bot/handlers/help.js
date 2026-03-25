const { withAuth } = require('../middleware/auth');

function register(bot) {
  const helpText = [
    'IPTV Access Killer - Commands:\n',
    '/adduser - Add a new subscriber',
    '/kill <username> - Disable user access (Access Killer)',
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
    '/help - Show this message',
  ].join('\n');

  bot.onText(/\/start/, withAuth(bot, async (msg) => {
    await bot.sendMessage(msg.chat.id, `Welcome to IPTV Access Killer!\n\n${helpText}`);
  }));

  bot.onText(/\/help/, withAuth(bot, async (msg) => {
    await bot.sendMessage(msg.chat.id, helpText);
  }));
}

module.exports = { register };
