const { withAuth } = require('../middleware/auth');
const backupService = require('../../services/backupService');

function register(bot) {
  bot.onText(/\/backup(?:\s+(.+))?/, withAuth(bot, async (msg, match) => {
    const arg = match[1]?.trim();

    // /backup list
    if (arg === 'list') {
      try {
        const backups = backupService.listBackups();
        if (backups.length === 0) {
          await bot.sendMessage(msg.chat.id, 'No backups found. Use /backup to create one.');
          return;
        }
        const lines = backups.slice(0, 10).map((b, i) =>
          `${i + 1}. ${b.filename}\n   ${b.sizeFormatted} | ${b.createdAt.split('T')[0]}${b.label ? ` | ${b.label}` : ''}`
        );
        const stats = backupService.getBackupStats();
        const text = `Backups (${stats.count} total, ${stats.totalSizeFormatted}):\n\n${lines.join('\n\n')}`;
        await bot.sendMessage(msg.chat.id, text);
      } catch (err) {
        await bot.sendMessage(msg.chat.id, `Error: ${err.message}`);
      }
      return;
    }

    // /backup stats
    if (arg === 'stats') {
      try {
        const stats = backupService.getBackupStats();
        const text = [
          '--- Backup Stats ---',
          '',
          `Backups: ${stats.count} / ${stats.maxBackups} max`,
          `Total backup size: ${stats.totalSizeFormatted}`,
          `Database size: ${stats.dbSizeFormatted}`,
          `Last backup: ${stats.latestBackup ? stats.latestBackup.createdAt.split('T')[0] : 'Never'}`,
        ].join('\n');
        await bot.sendMessage(msg.chat.id, text);
      } catch (err) {
        await bot.sendMessage(msg.chat.id, `Error: ${err.message}`);
      }
      return;
    }

    // /backup (create) or /backup <label>
    try {
      const label = arg || '';
      const backup = backupService.createBackup(label);
      await bot.sendMessage(
        msg.chat.id,
        `Backup created:\n\n${backup.filename}\nSize: ${backup.sizeFormatted}\n\nUse /backup list to see all backups.\nUse /backup stats for summary.`
      );
    } catch (err) {
      await bot.sendMessage(msg.chat.id, `Backup failed: ${err.message}`);
    }
  }));
}

module.exports = { register };
