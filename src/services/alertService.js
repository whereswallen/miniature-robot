const userService = require('./userService');
const config = require('../config');

function buildExpiryAlert(tenantId) {
  const dayThresholds = config.scheduler.alertDaysBefore.sort((a, b) => a - b);
  const maxDays = Math.max(...dayThresholds);
  const allExpiring = userService.getExpiringUsers(tenantId, maxDays);

  if (allExpiring.length === 0) return null;

  const groups = {};
  for (const threshold of dayThresholds) {
    groups[threshold] = [];
  }

  for (const user of allExpiring) {
    const daysLeft = Math.ceil(user.days_left);
    // Place user in the smallest matching bucket
    for (const threshold of dayThresholds) {
      if (daysLeft <= threshold) {
        groups[threshold].push({ ...user, daysLeft });
        break;
      }
    }
  }

  const sections = [];
  for (const threshold of dayThresholds) {
    const users = groups[threshold];
    if (users.length === 0) continue;

    const label = threshold === 1 ? 'EXPIRING TODAY/TOMORROW' : `EXPIRING WITHIN ${threshold} DAYS`;
    const lines = users.map(
      (u) => `  ${u.xtream_username} | ${u.customer_name} | ${u.daysLeft}d left`
    );
    sections.push(`${label}:\n${lines.join('\n')}`);
  }

  if (sections.length === 0) return null;

  return `--- Expiry Alert ---\n\n${sections.join('\n\n')}`;
}

function runDailyMaintenance(tenantId) {
  const expiredCount = userService.syncExpiredStatus(tenantId);
  return expiredCount;
}

module.exports = { buildExpiryAlert, runDailyMaintenance };
