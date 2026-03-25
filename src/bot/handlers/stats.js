const { withAuth } = require('../middleware/auth');
const userService = require('../../services/userService');

function register(bot) {
  bot.onText(/\/stats/, withAuth(bot, async (msg) => {
    try {
      const stats = userService.getStats();
      const text = [
        '--- IPTV Dashboard ---\n',
        `Total Subscribers: ${stats.total}`,
        `Active: ${stats.active}`,
        `Disabled: ${stats.disabled}`,
        `Expired: ${stats.expired}`,
        `Expiring within 7 days: ${stats.expiring_soon}`,
      ].join('\n');

      await bot.sendMessage(msg.chat.id, text);
    } catch (err) {
      await bot.sendMessage(msg.chat.id, `Error: ${err.message}`);
    }
  }));
}

module.exports = { register };
