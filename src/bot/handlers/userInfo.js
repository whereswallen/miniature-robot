const { withAuth } = require('../middleware/auth');
const userService = require('../../services/userService');

function formatUser(sub) {
  const daysLeft = Math.ceil(
    (new Date(sub.expiry_date) - new Date()) / (1000 * 60 * 60 * 24)
  );

  return [
    `Name: ${sub.customer_name}`,
    `Username: ${sub.xtream_username}`,
    `Phone: ${sub.phone || 'N/A'}`,
    `Telegram: ${sub.telegram_user || 'N/A'}`,
    `Package: ${sub.package}`,
    `Start: ${sub.start_date}`,
    `Expiry: ${sub.expiry_date}`,
    `Status: ${sub.status.toUpperCase()}`,
    `Days left: ${daysLeft > 0 ? daysLeft : 0}`,
    sub.notes ? `Notes: ${sub.notes}` : '',
  ].filter(Boolean).join('\n');
}

function register(bot) {
  bot.onText(/\/info(?:\s+(.+))?/, withAuth(bot, async (msg, match) => {
    const query = match[1]?.trim();
    if (!query) {
      await bot.sendMessage(msg.chat.id, 'Usage: /info <username or name>');
      return;
    }

    try {
      // Try exact xtream username first
      let sub = userService.getUserByUsername(query);
      if (sub) {
        await bot.sendMessage(msg.chat.id, formatUser(sub));
        return;
      }

      // Search by name
      const results = userService.searchUsers(query);
      if (results.length === 0) {
        await bot.sendMessage(msg.chat.id, `No subscriber found for "${query}".`);
        return;
      }

      const text = results.map(formatUser).join('\n\n---\n\n');
      await bot.sendMessage(msg.chat.id, `Found ${results.length} result(s):\n\n${text}`);
    } catch (err) {
      await bot.sendMessage(msg.chat.id, `Error: ${err.message}`);
    }
  }));
}

module.exports = { register };
