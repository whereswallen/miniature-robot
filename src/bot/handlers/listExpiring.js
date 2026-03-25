const { withAuth } = require('../middleware/auth');
const userService = require('../../services/userService');

function register(bot) {
  bot.onText(/\/expiring(?:\s+(\d+))?/, withAuth(bot, async (msg, match) => {
    try {
      const days = parseInt(match[1], 10) || 7;
      const users = userService.getExpiringUsers(days);

      if (users.length === 0) {
        await bot.sendMessage(msg.chat.id, `No subscribers expiring within ${days} days.`);
        return;
      }

      const lines = users.map((u) => {
        const daysLeft = Math.ceil(u.days_left);
        return `${u.xtream_username} | ${u.customer_name} | ${daysLeft} day(s) left`;
      });

      const text = `Expiring within ${days} days (${users.length}):\n\n${lines.join('\n')}`;
      await bot.sendMessage(msg.chat.id, text);
    } catch (err) {
      await bot.sendMessage(msg.chat.id, `Error: ${err.message}`);
    }
  }));
}

module.exports = { register };
