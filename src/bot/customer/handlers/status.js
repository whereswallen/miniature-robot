const db = require('../../../db/connection');

const findSubscription = db.prepare(`
  SELECT s.*, p.name as panel_name FROM subscribers s
  LEFT JOIN panels p ON s.panel_id = p.id
  JOIN customer_links cl ON s.id = cl.subscriber_id
  WHERE cl.telegram_chat_id = @chatId
`);

function register(bot) {
  bot.onText(/\/status/, async (msg) => {
    const sub = findSubscription.get({ chatId: String(msg.chat.id) });
    if (!sub) {
      await bot.sendMessage(msg.chat.id, 'No account linked. Use /start <code> to link your account.');
      return;
    }

    const daysLeft = Math.ceil((new Date(sub.expiry_date) - new Date()) / (1000 * 60 * 60 * 24));

    const text = [
      `Subscription Status for ${sub.customer_name}:\n`,
      `Package: ${sub.package}`,
      `Status: ${sub.status.toUpperCase()}`,
      `Start Date: ${sub.start_date}`,
      `Expiry Date: ${sub.expiry_date}`,
      `Days Remaining: ${daysLeft > 0 ? daysLeft : 0}`,
      sub.balance !== 0 ? `Balance: $${sub.balance.toFixed(2)}` : '',
    ].filter(Boolean).join('\n');

    await bot.sendMessage(msg.chat.id, text);
  });
}

module.exports = { register };
