const cron = require('node-cron');
const config = require('../config');
const alertService = require('../services/alertService');

function start(bot) {
  cron.schedule(config.scheduler.cronSchedule, async () => {
    console.log('Running daily maintenance and expiry check...');

    try {
      // Auto-expire overdue subscribers
      const expiredCount = alertService.runDailyMaintenance();
      if (expiredCount > 0) {
        console.log(`Auto-expired ${expiredCount} subscriber(s).`);
      }

      // Build and send expiry alert
      const alertText = alertService.buildExpiryAlert();
      if (!alertText) {
        console.log('No upcoming expirations.');
        return;
      }

      for (const chatId of config.telegram.authorizedChatIds) {
        try {
          await bot.sendMessage(chatId, alertText);
        } catch (err) {
          console.error(`Failed to send alert to chat ${chatId}: ${err.message}`);
        }
      }
    } catch (err) {
      console.error('Scheduler error:', err.message);
    }
  });

  console.log(`Scheduler started (${config.scheduler.cronSchedule}).`);
}

module.exports = { start };
