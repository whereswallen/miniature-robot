const { withAuth } = require('../middleware/auth');
const userService = require('../../services/userService');

function register(bot, tenantId) {
  bot.onText(/\/balance(?:\s+(.+))?/, withAuth(bot, tenantId, async (msg, match) => {
    const username = match[1]?.trim();
    if (!username) {
      await bot.sendMessage(msg.chat.id, 'Usage: /balance <username>');
      return;
    }

    try {
      const sub = userService.getUserByUsername(tenantId, username);
      if (!sub) {
        await bot.sendMessage(msg.chat.id, `Subscriber "${username}" not found.`);
        return;
      }

      await bot.sendMessage(
        msg.chat.id,
        `Balance for "${sub.customer_name}" (${username}): $${(sub.balance || 0).toFixed(2)}`
      );
    } catch (err) {
      await bot.sendMessage(msg.chat.id, `Error: ${err.message}`);
    }
  }));
}

module.exports = { register };
