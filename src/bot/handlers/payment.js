const { withAuth } = require('../middleware/auth');
const userService = require('../../services/userService');
const financialService = require('../../services/financialService');

function register(bot) {
  bot.onText(/\/payment(?:\s+(\S+)(?:\s+(\S+)(?:\s+(.+))?)?)?/, withAuth(bot, async (msg, match) => {
    const username = match[1]?.trim();
    const amount = match[2]?.trim();
    const method = match[3]?.trim();

    if (!username || !amount) {
      await bot.sendMessage(msg.chat.id, 'Usage: /payment <username> <amount> [method]');
      return;
    }

    try {
      const sub = userService.getUserByUsername(username);
      if (!sub) {
        await bot.sendMessage(msg.chat.id, `Subscriber "${username}" not found.`);
        return;
      }

      financialService.recordPayment(sub.id, {
        amount: parseFloat(amount),
        method: method || 'Cash',
      });

      await bot.sendMessage(
        msg.chat.id,
        `Payment of $${parseFloat(amount).toFixed(2)} recorded for "${sub.customer_name}" (${username}).`
      );
    } catch (err) {
      await bot.sendMessage(msg.chat.id, `Error: ${err.message}`);
    }
  }));
}

module.exports = { register };
