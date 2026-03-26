const { withAuth } = require('../middleware/auth');
const panelService = require('../../services/panelService');

function register(bot, tenantId) {
  bot.onText(/\/panels/, withAuth(bot, tenantId, async (msg) => {
    try {
      const panels = panelService.listPanels(true);
      if (panels.length === 0) {
        await bot.sendMessage(msg.chat.id, 'No panels configured.');
        return;
      }

      const results = await panelService.healthCheckAll(tenantId);
      const lines = results.map((p) => {
        const status = p.health.ok ? 'OK' : 'DOWN';
        const def = p.is_default ? ' [DEFAULT]' : '';
        return `${p.name}${def}: ${status}`;
      });

      await bot.sendMessage(msg.chat.id, `Panel Status:\n\n${lines.join('\n')}`);
    } catch (err) {
      await bot.sendMessage(msg.chat.id, `Error: ${err.message}`);
    }
  }));
}

module.exports = { register };
