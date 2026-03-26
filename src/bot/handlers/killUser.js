const { withAuth } = require('../middleware/auth');
const userService = require('../../services/userService');

const pendingConfirm = new Map();

function register(bot, tenantId) {
  bot.onText(/\/kill(?:\s+(.+))?/, withAuth(bot, tenantId, async (msg, match) => {
    const username = match[1]?.trim();
    if (!username) {
      await bot.sendMessage(msg.chat.id, 'Usage: /kill <xtream_username>');
      return;
    }

    const sub = userService.getUserByUsername(tenantId, username);
    if (!sub) {
      await bot.sendMessage(msg.chat.id, `Subscriber "${username}" not found.`);
      return;
    }

    if (sub.status === 'disabled') {
      await bot.sendMessage(msg.chat.id, `"${username}" is already disabled.`);
      return;
    }

    pendingConfirm.set(msg.chat.id, username);
    await bot.sendMessage(
      msg.chat.id,
      `Are you sure you want to KILL access for "${sub.customer_name}" (${username})?\n\nType YES to confirm or anything else to cancel.`
    );
  }));

  bot.on('message', withAuth(bot, tenantId, async (msg) => {
    const chatId = msg.chat.id;
    if (!pendingConfirm.has(chatId)) return;

    const username = pendingConfirm.get(chatId);
    pendingConfirm.delete(chatId);

    if (msg.text?.toUpperCase() !== 'YES') {
      await bot.sendMessage(chatId, 'Cancelled.');
      return;
    }

    try {
      const result = await userService.disableUser(tenantId, username);
      const syncNote = result.pendingSync ? '\n\n⏳ Panel was unreachable — change saved locally and will sync when the panel is back online.' : '';
      await bot.sendMessage(chatId, `ACCESS KILLED for "${username}". User has been disabled.${syncNote}`);
    } catch (err) {
      await bot.sendMessage(chatId, `Failed to kill access: ${err.message}`);
    }
  }));
}

module.exports = { register };
