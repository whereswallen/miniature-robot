const config = require('../../config');

function isAuthorized(chatId) {
  return config.telegram.authorizedChatIds.includes(String(chatId));
}

function withAuth(bot, handler) {
  return async (msg, match) => {
    if (!isAuthorized(msg.chat.id)) {
      await bot.sendMessage(msg.chat.id, 'Unauthorized. Access denied.');
      return;
    }
    return handler(msg, match);
  };
}

module.exports = { isAuthorized, withAuth };
