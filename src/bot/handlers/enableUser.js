const { withAuth } = require('../middleware/auth');
const userService = require('../../services/userService');

function register(bot, tenantId) {
  bot.onText(/\/enable(?:\s+(.+))?/, withAuth(bot, tenantId, async (msg, match) => {
    const username = match[1]?.trim();
    if (!username) {
      await bot.sendMessage(msg.chat.id, 'Usage: /enable <xtream_username>');
      return;
    }

    try {
      const sub = userService.getUserByUsername(tenantId, username);
      if (!sub) {
        await bot.sendMessage(msg.chat.id, `Subscriber "${username}" not found.`);
        return;
      }

      if (sub.status === 'active') {
        await bot.sendMessage(msg.chat.id, `"${username}" is already active.`);
        return;
      }

      const result = await userService.enableUser(tenantId, username);
      const syncNote = result.pendingSync ? '\n\n⏳ Panel was unreachable — change saved locally and will sync when the panel is back online.' : '';
      await bot.sendMessage(
        msg.chat.id,
        `Access RESTORED for "${sub.customer_name}" (${username}).${syncNote}`
      );
    } catch (err) {
      await bot.sendMessage(msg.chat.id, `Failed to enable: ${err.message}`);
    }
  }));
}

module.exports = { register };
