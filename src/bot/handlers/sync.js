const { withAuth } = require('../middleware/auth');
const syncService = require('../../services/syncService');

function register(bot, tenantId) {
  bot.onText(/\/sync(?:\s+(.+))?/, withAuth(bot, tenantId, async (msg, match) => {
    const arg = match[1]?.trim();

    if (arg === 'status') {
      const status = syncService.getStatus(tenantId);
      const lines = [`Pending: ${status.pending}`, `Failed: ${status.failed}`];

      if (status.items.length > 0) {
        lines.push('');
        for (const item of status.items.slice(0, 15)) {
          lines.push(`[${item.status}] ${item.action} — ${item.xtream_username} (${item.created_at})`);
        }
        if (status.items.length > 15) {
          lines.push(`...and ${status.items.length - 15} more`);
        }
      }

      await bot.sendMessage(msg.chat.id, `Sync Status:\n\n${lines.join('\n')}`);
      return;
    }

    // Default: show count then sync
    const pendingCount = syncService.getPendingCount(tenantId);
    if (pendingCount === 0) {
      await bot.sendMessage(msg.chat.id, 'No pending changes to sync.');
      return;
    }

    await bot.sendMessage(msg.chat.id, `Syncing ${pendingCount} pending change(s)...`);

    const result = await syncService.syncAll(tenantId);
    const lines = [`Synced: ${result.synced}`, `Failed: ${result.failed}`];

    if (result.errors.length > 0) {
      lines.push('\nErrors:');
      for (const e of result.errors.slice(0, 10)) {
        lines.push(`- ${e.username}: ${e.error}`);
      }
    }

    await bot.sendMessage(msg.chat.id, lines.join('\n'));
  }));
}

module.exports = { register };
