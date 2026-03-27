const { withAuth } = require('../middleware/auth');
const userService = require('../../services/userService');
const financialService = require('../../services/financialService');
const backupService = require('../../services/backupService');
const panelService = require('../../services/panelService');

function register(bot, tenantId) {
  bot.onText(/\/health/, withAuth(bot, tenantId, async (msg) => {
    try {
      const stats = userService.getStats(tenantId);
      const todayRev = financialService.getTodayRevenue(tenantId);

      // Backup status
      const bStats = backupService.getBackupStats();
      let backupStatus = 'Warning (no backups)';
      if (bStats.latestBackup) {
        const hoursSince = (Date.now() - new Date(bStats.latestBackup.createdAt).getTime()) / 3600000;
        backupStatus = hoursSince < 48 ? `OK (${Math.floor(hoursSince)}h ago)` : `Warning (${Math.floor(hoursSince)}h ago)`;
      }

      // Panel status
      let panelLine = 'No panels configured';
      try {
        const panelResults = await panelService.healthCheckAll(tenantId);
        const online = panelResults.filter((p) => p.health?.ok).length;
        panelLine = `${online}/${panelResults.length} online`;
      } catch {
        panelLine = 'Unable to check';
      }

      const text = [
        '--- Health Pulse ---\n',
        `Revenue Today: $${todayRev.toFixed(2)}`,
        `Revenue This Month: $${stats.revenue_this_month.toFixed(2)}`,
        `Backup: ${backupStatus}`,
        `Panels: ${panelLine}`,
        '',
        `Active: ${stats.active} | Expired: ${stats.expired} | Expiring (7d): ${stats.expiring_soon}`,
      ].join('\n');

      await bot.sendMessage(msg.chat.id, text);
    } catch (err) {
      await bot.sendMessage(msg.chat.id, `Error: ${err.message}`);
    }
  }));
}

module.exports = { register };
