const cron = require('node-cron');
const config = require('../config');
const alertService = require('../services/alertService');
const reminderService = require('../services/reminderService');
const customerNotification = require('../services/customerNotificationService');
const backupService = require('../services/backupService');
const syncService = require('../services/syncService');
const tenantService = require('../services/tenantService');
const botRegistry = require('../services/botRegistry');

function start() {
  cron.schedule(config.scheduler.cronSchedule, async () => {
    console.log('Running daily maintenance for all tenants...');

    const tenants = tenantService.listActiveTenants();

    for (const tenant of tenants) {
      try {
        // Auto-expire overdue subscribers
        const expiredCount = alertService.runDailyMaintenance(tenant.id);
        if (expiredCount > 0) {
          console.log(`[Tenant ${tenant.id}] Auto-expired ${expiredCount} subscriber(s).`);
        }

        // Send customer reminders
        let customerNotified = 0;
        let noTelegram = 0;
        for (const daysBefore of config.scheduler.alertDaysBefore) {
          const subs = reminderService.getSubscribersNeedingReminder(tenant.id, daysBefore);
          for (const sub of subs) {
            if (sub.telegram_chat_id) {
              const sent = await customerNotification.sendExpiryReminder(
                tenant.id, sub.id, Math.ceil(sub.days_left), sub.customer_name
              );
              if (sent) customerNotified++;
            } else {
              noTelegram++;
            }
            reminderService.markReminderSent(tenant.id, sub.id, daysBefore);
          }
        }

        if (customerNotified > 0 || noTelegram > 0) {
          console.log(`[Tenant ${tenant.id}] Reminders: ${customerNotified} sent, ${noTelegram} without Telegram.`);
        }

        // Build and send admin expiry alert
        const adminBot = botRegistry.getAdminBot(tenant.id);
        if (adminBot) {
          const alertText = alertService.buildExpiryAlert(tenant.id);
          const reminderSummary = customerNotified > 0 || noTelegram > 0
            ? `\n\n--- Reminders ---\n${customerNotified} customer(s) notified\n${noTelegram} customer(s) need manual contact`
            : '';

          const fullAlert = alertText ? alertText + reminderSummary : (reminderSummary ? `--- Daily Report ---${reminderSummary}` : null);

          if (fullAlert) {
            const chatIds = tenantService.getAuthorizedChatIds(tenant.id);
            for (const chatId of chatIds) {
              try {
                await adminBot.sendMessage(chatId, fullAlert);
              } catch (err) {
                console.error(`[Tenant ${tenant.id}] Failed to send alert to chat ${chatId}: ${err.message}`);
              }
            }
          }
        }

        // Attempt to sync pending changes
        const pendingCount = syncService.getPendingCount(tenant.id);
        if (pendingCount > 0) {
          console.log(`[Tenant ${tenant.id}] Syncing ${pendingCount} pending change(s)...`);
          const syncResult = await syncService.syncAll(tenant.id);
          console.log(`[Tenant ${tenant.id}] Sync: ${syncResult.synced} synced, ${syncResult.failed} failed.`);
        }
      } catch (err) {
        console.error(`[Tenant ${tenant.id}] Scheduler error: ${err.message}`);
      }
    }
  });

  console.log(`Scheduler started (${config.scheduler.cronSchedule}).`);

  // Scheduled auto-backup — runs daily at 2 AM (platform-level)
  const backupSchedule = config.scheduler.backupCronSchedule || '0 2 * * *';
  cron.schedule(backupSchedule, () => {
    try {
      const backup = backupService.createBackup('auto');
      console.log(`Auto-backup created: ${backup.filename} (${backup.sizeFormatted})`);
    } catch (err) {
      console.error('Auto-backup failed:', err.message);
    }
  });

  console.log(`Auto-backup scheduled (${backupSchedule}).`);
}

module.exports = { start };
