const config = require('../../../config');
const db = require('../../../db/connection');

const findCustomer = db.prepare(`
  SELECT s.customer_name, s.xtream_username FROM subscribers s
  JOIN customer_links cl ON s.id = cl.subscriber_id
  WHERE cl.telegram_chat_id = @chatId
`);

// Rate limiting: max 3 support messages per hour per chat
const rateLimit = new Map();

function register(bot) {
  // We need access to the admin bot to forward messages
  let adminBot = null;

  // Allow setting admin bot reference
  bot.setAdminBot = (aBot) => { adminBot = aBot; };

  bot.onText(/\/support(?:\s+(.+))?/, async (msg, match) => {
    const chatId = msg.chat.id;
    const message = match[1]?.trim();

    if (!message) {
      await bot.sendMessage(chatId, 'Usage: /support <your message>\n\nExample: /support I need help with my subscription');
      return;
    }

    // Rate limit check
    const key = String(chatId);
    const now = Date.now();
    const history = rateLimit.get(key) || [];
    const recent = history.filter((t) => now - t < 3600000);
    if (recent.length >= 3) {
      await bot.sendMessage(chatId, 'Rate limit reached. Please wait before sending more support messages.');
      return;
    }
    recent.push(now);
    rateLimit.set(key, recent);

    const customer = findCustomer.get({ chatId: String(chatId) });
    const fromName = customer ? `${customer.customer_name} (${customer.xtream_username})` : `Unknown (chat: ${chatId})`;

    // Forward to admin chats
    if (adminBot) {
      const adminText = `[SUPPORT REQUEST]\nFrom: ${fromName}\nTelegram: @${msg.from.username || 'N/A'}\n\nMessage: ${message}`;
      for (const adminChatId of config.telegram.authorizedChatIds) {
        try {
          await adminBot.sendMessage(adminChatId, adminText);
        } catch (err) {
          console.error(`Failed to forward support to admin ${adminChatId}: ${err.message}`);
        }
      }
    }

    await bot.sendMessage(chatId, 'Your message has been sent to support. They will get back to you soon.');
  });
}

module.exports = { register };
