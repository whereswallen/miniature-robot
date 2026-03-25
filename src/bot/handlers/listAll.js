const { withAuth } = require('../middleware/auth');
const userService = require('../../services/userService');

function register(bot) {
  bot.onText(/\/list/, withAuth(bot, async (msg) => {
    try {
      const users = userService.getActiveUsers();
      if (users.length === 0) {
        await bot.sendMessage(msg.chat.id, 'No active subscribers.');
        return;
      }

      const lines = users.map((u) => {
        const daysLeft = Math.ceil(
          (new Date(u.expiry_date) - new Date()) / (1000 * 60 * 60 * 24)
        );
        return `${u.xtream_username} | ${u.customer_name} | Exp: ${u.expiry_date} (${daysLeft}d)`;
      });

      // Split into chunks of 50 to avoid Telegram message limits
      const chunks = [];
      for (let i = 0; i < lines.length; i += 50) {
        chunks.push(lines.slice(i, i + 50));
      }

      for (const chunk of chunks) {
        const text = `Active Subscribers (${users.length}):\n\n${chunk.join('\n')}`;
        await bot.sendMessage(msg.chat.id, text);
      }
    } catch (err) {
      await bot.sendMessage(msg.chat.id, `Error: ${err.message}`);
    }
  }));
}

module.exports = { register };
