const db = require('../db/connection');

// --- Prepared statements ---

const activeCampaigns = db.prepare(`
  SELECT * FROM recapture_campaigns
  WHERE tenant_id = @tenantId AND enabled = 1
  ORDER BY days_after_expiry ASC
`);

const allCampaigns = db.prepare(`
  SELECT * FROM recapture_campaigns
  WHERE tenant_id = @tenantId
  ORDER BY days_after_expiry ASC
`);

const eligibleSubs = db.prepare(`
  SELECT s.*, cl.telegram_chat_id, cl.telegram_username,
    CAST(julianday('now') - julianday(s.expiry_date) AS INTEGER) as days_since_expiry
  FROM subscribers s
  JOIN customer_links cl ON s.id = cl.subscriber_id AND cl.tenant_id = s.tenant_id
  WHERE s.status = 'expired'
    AND s.tenant_id = @tenantId
    AND CAST(julianday('now') - julianday(s.expiry_date) AS INTEGER) >= @daysAfterExpiry
    AND cl.telegram_chat_id IS NOT NULL
    AND s.id NOT IN (
      SELECT subscriber_id FROM recapture_sent WHERE campaign_id = @campaignId
    )
`);

const insertSent = db.prepare(`
  INSERT OR IGNORE INTO recapture_sent (tenant_id, subscriber_id, campaign_id)
  VALUES (@tenantId, @subscriberId, @campaignId)
`);

const getCampaignByIdStmt = db.prepare(`
  SELECT * FROM recapture_campaigns WHERE id = @id AND tenant_id = @tenantId
`);

const insertCampaign = db.prepare(`
  INSERT INTO recapture_campaigns (tenant_id, name, enabled, days_after_expiry, message_template, offer_text)
  VALUES (@tenantId, @name, @enabled, @daysAfterExpiry, @messageTemplate, @offerText)
`);

const updateCampaign = db.prepare(`
  UPDATE recapture_campaigns
  SET name = @name, enabled = @enabled, days_after_expiry = @daysAfterExpiry,
      message_template = @messageTemplate, offer_text = @offerText, updated_at = datetime('now')
  WHERE id = @id AND tenant_id = @tenantId
`);

const campaignStatsStmt = db.prepare(`
  SELECT rc.*,
    (SELECT COUNT(*) FROM recapture_sent rs WHERE rs.campaign_id = rc.id) as sent_count,
    (SELECT MAX(rs.sent_at) FROM recapture_sent rs WHERE rs.campaign_id = rc.id) as last_sent_at
  FROM recapture_campaigns rc
  WHERE rc.tenant_id = @tenantId
  ORDER BY rc.days_after_expiry ASC
`);

// --- Service methods ---

function getActiveCampaigns(tenantId) {
  return activeCampaigns.all({ tenantId });
}

function getAllCampaigns(tenantId) {
  return allCampaigns.all({ tenantId });
}

function getEligibleSubscribers(tenantId, campaignId, daysAfterExpiry) {
  return eligibleSubs.all({ tenantId, campaignId, daysAfterExpiry });
}

function markSent(tenantId, subscriberId, campaignId) {
  insertSent.run({ tenantId, subscriberId, campaignId });
}

function getCampaign(tenantId, id) {
  return getCampaignByIdStmt.get({ tenantId, id });
}

function createCampaign(tenantId, { name, enabled = true, daysAfterExpiry, messageTemplate, offerText }) {
  const result = insertCampaign.run({
    tenantId, name, enabled: enabled ? 1 : 0,
    daysAfterExpiry, messageTemplate, offerText: offerText || null,
  });
  return result.lastInsertRowid;
}

function updateCampaignById(tenantId, id, { name, enabled, daysAfterExpiry, messageTemplate, offerText }) {
  updateCampaign.run({
    tenantId, id, name, enabled: enabled ? 1 : 0,
    daysAfterExpiry, messageTemplate, offerText: offerText || null,
  });
}

function getCampaignStats(tenantId) {
  return campaignStatsStmt.all({ tenantId });
}

function buildMessage(template, subscriber, offerText) {
  return template
    .replace(/\{customer_name\}/g, subscriber.customer_name || 'Subscriber')
    .replace(/\{days_ago\}/g, String(subscriber.days_since_expiry))
    .replace(/\{offer_text\}/g, offerText || '')
    .replace(/\{username\}/g, subscriber.xtream_username || '');
}

module.exports = {
  getActiveCampaigns,
  getAllCampaigns,
  getEligibleSubscribers,
  markSent,
  getCampaign,
  createCampaign,
  updateCampaignById,
  getCampaignStats,
  buildMessage,
};
