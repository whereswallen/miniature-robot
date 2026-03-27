const db = require('../db/connection');

let botRegistry = null;

function setBotRegistry(registry) {
  botRegistry = registry;
}

// Legacy: single bot support for backward compatibility
let legacyBot = null;
function setBot(bot) {
  legacyBot = bot;
}

const findLink = db.prepare('SELECT * FROM customer_links WHERE subscriber_id = @subscriberId AND tenant_id = @tenantId');
const findAllLinks = db.prepare('SELECT cl.*, s.customer_name FROM customer_links cl JOIN subscribers s ON cl.subscriber_id = s.id WHERE cl.tenant_id = @tenantId');

function getBot(tenantId) {
  if (botRegistry) {
    return botRegistry.getCustomerBot(tenantId);
  }
  return legacyBot;
}

async function notifyCustomer(tenantId, subscriberId, message) {
  const bot = getBot(tenantId);
  if (!bot) return false;
  const link = findLink.get({ subscriberId, tenantId });
  if (!link) return false;

  try {
    await bot.sendMessage(link.telegram_chat_id, message);
    return true;
  } catch (err) {
    console.error(`Failed to notify customer ${subscriberId}: ${err.message}`);
    return false;
  }
}

async function sendExpiryReminder(tenantId, subscriberId, daysLeft, customerName) {
  const message = [
    `Hello ${customerName}!`,
    '',
    `Your IPTV subscription expires in ${daysLeft} day(s).`,
    '',
    'Please contact your provider to renew.',
    '',
    'Use /status to check your subscription details.',
  ].join('\n');

  return notifyCustomer(tenantId, subscriberId, message);
}

async function broadcastToAll(tenantId, message) {
  const bot = getBot(tenantId);
  if (!bot) return { sent: 0, failed: 0 };
  const links = findAllLinks.all({ tenantId });
  let sent = 0, failed = 0;
  for (const link of links) {
    try {
      await bot.sendMessage(link.telegram_chat_id, message);
      sent++;
    } catch {
      failed++;
    }
  }
  return { sent, failed };
}

module.exports = { setBot, setBotRegistry, notifyCustomer, sendExpiryReminder, broadcastToAll };
