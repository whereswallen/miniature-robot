const { withAuth } = require('../middleware/auth');
const userService = require('../../services/userService');

function register(bot) {
  bot.onText(/\/enable(?:\s+(.+))?/, withAuth(bot, async (msg, match) => {
    const username = match[1]?.trim();
    if (!username) {
      await bot.sendMessage(msg.chat.id, 'Usage: /enable <xtream_username>');
      return;
    }

    try {
      const sub = userService.getUserByUsername(username);
      if (!sub) {
        await bot.sendMessage(msg.chat.id, `Subscriber "${username}" not found.`);
        return;
      }

      if (sub.status === 'active') {
        await bot.sendMessage(msg.chat.id, `"${username}" is already active.`);
        return;
      }

      await userService.enableUser(username);
      await bot.sendMessage(
        msg.chat.id,
        `Access RESTORED for "${sub.customer_name}" (${username}).`
      );
    } catch (err) {
      await bot.sendMessage(msg.chat.id, `Failed to enable: ${err.message}`);
    }
  }));
}

module.exports = { register };
