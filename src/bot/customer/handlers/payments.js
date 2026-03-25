const db = require('../../../db/connection');

const findPayments = db.prepare(`
  SELECT ph.* FROM payment_history ph
  JOIN customer_links cl ON ph.subscriber_id = cl.subscriber_id
  WHERE cl.telegram_chat_id = @chatId
  ORDER BY ph.payment_date DESC LIMIT 10
`);

function register(bot) {
  bot.onText(/\/payments/, async (msg) => {
    const payments = findPayments.all({ chatId: String(msg.chat.id) });

    if (payments.length === 0) {
      await bot.sendMessage(msg.chat.id, 'No payment history found.\n\nIf you are not linked, use /start <code> first.');
      return;
    }

    const lines = payments.map((p) => {
      return `${p.payment_date.split('T')[0]} | $${(p.amount || 0).toFixed(2)} | ${p.method || 'N/A'} | ${p.payment_type}`;
    });

    const text = `Your last ${payments.length} payment(s):\n\nDate | Amount | Method | Type\n${lines.join('\n')}`;
    await bot.sendMessage(msg.chat.id, text);
  });
}

module.exports = { register };
