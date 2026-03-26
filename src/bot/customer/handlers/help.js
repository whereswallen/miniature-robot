function register(bot, tenantId) {
  const helpText = [
    'IPTV Customer Bot - Commands:\n',
    '/start <code> - Link your account using a code from your provider',
    '/status - Check your subscription status',
    '/expiry - See when your subscription expires',
    '/payments - View your payment history',
    '/support <message> - Send a message to support',
    '/help - Show this message',
  ].join('\n');

  bot.onText(/\/help/, async (msg) => {
    await bot.sendMessage(msg.chat.id, helpText);
  });
}

module.exports = { register };
