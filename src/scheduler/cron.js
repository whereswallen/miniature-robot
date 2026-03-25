const cron = require('node-cron');
const config = require('../config');
const alertService = require('../services/alertService');
const reminderService = require('../services/reminderService');
const customerNotification = require('../services/customerNotificationService');

function start(adminBot) {
  cron.schedule(config.scheduler.cronSchedule, async () => {
    console.log('Running daily maintenance and expiry check...');

    try {
      // Auto-expire overdue subscribers
      const expiredCount = alertService.runDailyMaintenance();
      if (expiredCount > 0) {
        console.log(`Auto-expired ${expiredCount} subscriber(s).`);
      }

      // Send customer reminders
      let customerNotified = 0;
      let noTelegram = 0;
      for (const daysBefore of config.scheduler.alertDaysBefore) {
        const subs = reminderService.getSubscribersNeedingReminder(daysBefore);
        for (const sub of subs) {
          if (sub.telegram_chat_id) {
            const sent = await customerNotification.sendExpiryReminder(
              sub.id, Math.ceil(sub.days_left), sub.customer_name
            );
            if (sent) customerNotified++;
          } else {
            noTelegram++;
          }
          reminderService.markReminderSent(sub.id, daysBefore);
        }
      }

      if (customerNotified > 0 || noTelegram > 0) {
        console.log(`Reminders: ${customerNotified} sent to customers, ${noTelegram} without Telegram.`);
      }

      // Build and send admin expiry alert
      const alertText = alertService.buildExpiryAlert();
      const reminderSummary = customerNotified > 0 || noTelegram > 0
        ? `\n\n--- Reminders ---\n${customerNotified} customer(s) notified\n${noTelegram} customer(s) need manual contact`
        : '';

      const fullAlert = alertText ? alertText + reminderSummary : (reminderSummary ? `--- Daily Report ---${reminderSummary}` : null);

      if (fullAlert) {
        for (const chatId of config.telegram.authorizedChatIds) {
          try {
            await adminBot.sendMessage(chatId, fullAlert);
          } catch (err) {
            console.error(`Failed to send alert to chat ${chatId}: ${err.message}`);
          }
        }
      } else {
        console.log('No upcoming expirations.');
      }
    } catch (err) {
      console.error('Scheduler error:', err.message);
    }
  });

  console.log(`Scheduler started (${config.scheduler.cronSchedule}).`);
}

module.exports = { start };
