const crypto = require('crypto');
const { withAuth } = require('../middleware/auth');
const db = require('../../db/connection');
const userService = require('../../services/userService');

const insertLink = db.prepare(`
  INSERT INTO customer_links (subscriber_id, telegram_chat_id, link_code)
  VALUES (@subscriberId, '', @linkCode)
`);

const findExistingLink = db.prepare(`
  SELECT * FROM customer_links WHERE subscriber_id = @subscriberId
`);

function register(bot, tenantId) {
  bot.onText(/\/genlink(?:\s+(.+))?/, withAuth(bot, tenantId, async (msg, match) => {
    const username = match[1]?.trim();
    if (!username) {
      await bot.sendMessage(msg.chat.id, 'Usage: /genlink <xtream_username>');
      return;
    }

    try {
      const sub = userService.getUserByUsername(tenantId, username);
      if (!sub) {
        await bot.sendMessage(msg.chat.id, `Subscriber "${username}" not found.`);
        return;
      }

      // Check if already linked
      const existing = findExistingLink.get({ subscriberId: sub.id });
      if (existing && existing.telegram_chat_id) {
        await bot.sendMessage(msg.chat.id, `"${username}" is already linked to a Telegram account.`);
        return;
      }

      // Generate or refresh link code
      const linkCode = crypto.randomBytes(4).toString('hex');
      if (existing) {
        db.prepare('UPDATE customer_links SET link_code = @linkCode WHERE id = @id').run({ linkCode, id: existing.id });
      } else {
        insertLink.run({ subscriberId: sub.id, linkCode });
      }

      await bot.sendMessage(
        msg.chat.id,
        `Link code for "${sub.customer_name}" (${username}):\n\n${linkCode}\n\nTell the customer to send this to the customer bot:\n/start ${linkCode}`
      );
    } catch (err) {
      await bot.sendMessage(msg.chat.id, `Error: ${err.message}`);
    }
  }));
}

module.exports = { register };
