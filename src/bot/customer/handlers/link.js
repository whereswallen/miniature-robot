const db = require('../../../db/connection');

const findByCode = db.prepare('SELECT cl.*, s.customer_name FROM customer_links cl JOIN subscribers s ON cl.subscriber_id = s.id WHERE cl.link_code = @code AND cl.telegram_chat_id IS NULL');
const updateLink = db.prepare('UPDATE customer_links SET telegram_chat_id = @chatId, telegram_username = @username, link_code = NULL, linked_at = datetime(\'now\') WHERE id = @id');
const findByChatId = db.prepare('SELECT cl.*, s.customer_name FROM customer_links cl JOIN subscribers s ON cl.subscriber_id = s.id WHERE cl.telegram_chat_id = @chatId');

function register(bot) {
  bot.onText(/\/start(?:\s+(.+))?/, async (msg, match) => {
    const chatId = msg.chat.id;
    const code = match[1]?.trim();

    // Check if already linked
    const existing = findByChatId.get({ chatId: String(chatId) });
    if (existing) {
      await bot.sendMessage(chatId, `You are linked to account: ${existing.customer_name}\n\nUse /status to check your subscription.`);
      return;
    }

    if (!code) {
      await bot.sendMessage(chatId, 'Welcome! To link your account, your provider will give you a link code.\n\nUse: /start <code>\n\nOr type /help for available commands.');
      return;
    }

    // Find pending link with this code
    const link = findByCode.get({ code });
    if (!link) {
      await bot.sendMessage(chatId, 'Invalid or expired link code. Please contact your provider for a new code.');
      return;
    }

    // Link the account
    updateLink.run({
      id: link.id,
      chatId: String(chatId),
      username: msg.from.username || null,
    });

    await bot.sendMessage(chatId, `Account linked successfully!\n\nWelcome, ${link.customer_name}.\n\nUse /status to check your subscription.`);
  });
}

module.exports = { register };
