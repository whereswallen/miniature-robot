const tenantService = require('../../services/tenantService');

function isAuthorized(chatId, tenantId) {
  const authorizedIds = tenantService.getAuthorizedChatIds(tenantId);
  return authorizedIds.includes(String(chatId));
}

function withAuth(bot, tenantId, handler) {
  return async (msg, match) => {
    if (!isAuthorized(msg.chat.id, tenantId)) {
      await bot.sendMessage(msg.chat.id, 'Unauthorized. Access denied.');
      return;
    }
    return handler(msg, match);
  };
}

module.exports = { isAuthorized, withAuth };
