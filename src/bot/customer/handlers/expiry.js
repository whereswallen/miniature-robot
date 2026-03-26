const db = require('../../../db/connection');

const findSubscription = db.prepare(`
  SELECT s.expiry_date, s.customer_name, s.status FROM subscribers s
  JOIN customer_links cl ON s.id = cl.subscriber_id
  WHERE cl.telegram_chat_id = @chatId
`);

function register(bot, tenantId) {
  bot.onText(/\/expiry/, async (msg) => {
    const sub = findSubscription.get({ chatId: String(msg.chat.id) });
    if (!sub) {
      await bot.sendMessage(msg.chat.id, 'No account linked. Use /start <code> to link your account.');
      return;
    }

    const daysLeft = Math.ceil((new Date(sub.expiry_date) - new Date()) / (1000 * 60 * 60 * 24));

    let text;
    if (sub.status === 'expired' || daysLeft <= 0) {
      text = `Your subscription has expired (${sub.expiry_date}).\n\nPlease contact your provider to renew.`;
    } else if (daysLeft <= 3) {
      text = `WARNING: Your subscription expires on ${sub.expiry_date} (${daysLeft} day(s) left)!\n\nContact your provider to renew soon.`;
    } else {
      text = `Your subscription expires on ${sub.expiry_date}.\n\n${daysLeft} day(s) remaining.`;
    }

    await bot.sendMessage(msg.chat.id, text);
  });
}

module.exports = { register };
