const db = require('../db/connection');

const findNeedingReminder = db.prepare(`
  SELECT s.*, cl.telegram_chat_id, cl.telegram_username,
    julianday(s.expiry_date) - julianday('now') AS days_left
  FROM subscribers s
  LEFT JOIN customer_links cl ON s.id = cl.subscriber_id
  WHERE s.status = 'active'
    AND julianday(s.expiry_date) - julianday('now') BETWEEN 0 AND @daysBefore
    AND s.id NOT IN (
      SELECT subscriber_id FROM reminders_sent
      WHERE reminder_type = 'expiry' AND days_before = @daysBefore
    )
  ORDER BY s.expiry_date ASC
`);

const insertReminder = db.prepare(`
  INSERT OR IGNORE INTO reminders_sent (subscriber_id, reminder_type, days_before)
  VALUES (@subscriberId, @reminderType, @daysBefore)
`);

const deleteReminders = db.prepare(`
  DELETE FROM reminders_sent WHERE subscriber_id = @subscriberId
`);

const todaysSentCount = db.prepare(`
  SELECT COUNT(*) as count FROM reminders_sent
  WHERE date(sent_at) = date('now')
`);

function getSubscribersNeedingReminder(daysBefore) {
  return findNeedingReminder.all({ daysBefore });
}

function markReminderSent(subscriberId, daysBefore, reminderType = 'expiry') {
  insertReminder.run({
    subscriberId,
    reminderType,
    daysBefore,
  });
}

function resetRemindersForSubscriber(subscriberId) {
  deleteReminders.run({ subscriberId });
}

function getTodaysSentCount() {
  return todaysSentCount.get().count;
}

module.exports = {
  getSubscribersNeedingReminder,
  markReminderSent,
  resetRemindersForSubscriber,
  getTodaysSentCount,
};
