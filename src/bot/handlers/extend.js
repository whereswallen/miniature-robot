const { withAuth } = require('../middleware/auth');
const userService = require('../../services/userService');

function register(bot, tenantId) {
  bot.onText(/\/extend(?:\s+(\S+)(?:\s+(\S+))?)?/, withAuth(bot, tenantId, async (msg, match) => {
    const username = match[1]?.trim();
    const daysOrDate = match[2]?.trim();

    if (!username || !daysOrDate) {
      await bot.sendMessage(msg.chat.id, 'Usage: /extend <xtream_username> <days or YYYY-MM-DD>');
      return;
    }

    try {
      const sub = userService.getUserByUsername(tenantId, username);
      if (!sub) {
        await bot.sendMessage(msg.chat.id, `Subscriber "${username}" not found.`);
        return;
      }

      let newExpiry;
      if (/^\d+$/.test(daysOrDate)) {
        // Number of days — add to current expiry (or today if expired)
        const base = new Date(sub.expiry_date) > new Date() ? new Date(sub.expiry_date) : new Date();
        base.setDate(base.getDate() + parseInt(daysOrDate, 10));
        newExpiry = base.toISOString().split('T')[0];
      } else if (/^\d{4}-\d{2}-\d{2}$/.test(daysOrDate)) {
        newExpiry = daysOrDate;
      } else {
        await bot.sendMessage(msg.chat.id, 'Invalid format. Use number of days (e.g. 30) or a date (YYYY-MM-DD).');
        return;
      }

      const result = await userService.extendUser(tenantId, username, newExpiry);
      const syncNote = result.pendingSync ? '\n\n⏳ Panel was unreachable — change saved locally and will sync when the panel is back online.' : '';
      await bot.sendMessage(
        msg.chat.id,
        `Subscription extended for "${sub.customer_name}" (${username}).\nNew expiry: ${newExpiry}${syncNote}`
      );
    } catch (err) {
      await bot.sendMessage(msg.chat.id, `Failed to extend: ${err.message}`);
    }
  }));
}

module.exports = { register };
