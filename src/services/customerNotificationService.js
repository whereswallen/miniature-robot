const db = require('../db/connection');

let customerBot = null;

function setBot(bot) {
  customerBot = bot;
}

const findLink = db.prepare('SELECT * FROM customer_links WHERE subscriber_id = @subscriberId');
const findAllLinks = db.prepare('SELECT cl.*, s.customer_name FROM customer_links cl JOIN subscribers s ON cl.subscriber_id = s.id');

async function notifyCustomer(subscriberId, message) {
  if (!customerBot) return false;
  const link = findLink.get({ subscriberId });
  if (!link) return false;

  try {
    await customerBot.sendMessage(link.telegram_chat_id, message);
    return true;
  } catch (err) {
    console.error(`Failed to notify customer ${subscriberId}: ${err.message}`);
    return false;
  }
}

async function sendExpiryReminder(subscriberId, daysLeft, customerName) {
  const message = [
    `Hello ${customerName}!`,
    '',
    `Your IPTV subscription expires in ${daysLeft} day(s).`,
    '',
    'Please contact your provider to renew.',
    '',
    'Use /status to check your subscription details.',
  ].join('\n');

  return notifyCustomer(subscriberId, message);
}

async function broadcastToAll(message) {
  if (!customerBot) return { sent: 0, failed: 0 };
  const links = findAllLinks.all();
  let sent = 0, failed = 0;
  for (const link of links) {
    try {
      await customerBot.sendMessage(link.telegram_chat_id, message);
      sent++;
    } catch {
      failed++;
    }
  }
  return { sent, failed };
}

module.exports = { setBot, notifyCustomer, sendExpiryReminder, broadcastToAll };
