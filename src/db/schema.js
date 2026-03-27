const db = require('./connection');

function columnExists(table, column) {
  const cols = db.pragma(`table_info(${table})`);
  return cols.some((c) => c.name === column);
}

function tableExists(table) {
  const row = db.prepare("SELECT COUNT(*) as count FROM sqlite_master WHERE type='table' AND name=?").get(table);
  return row.count > 0;
}

function initialize() {
  // --- Core multi-tenant tables ---
  db.exec(`
    CREATE TABLE IF NOT EXISTS tenants (
      id                  INTEGER PRIMARY KEY AUTOINCREMENT,
      slug                TEXT    NOT NULL UNIQUE,
      company_name        TEXT    NOT NULL,
      owner_name          TEXT    NOT NULL,
      owner_email         TEXT    NOT NULL UNIQUE,
      plan                TEXT    NOT NULL DEFAULT 'basic',
      status              TEXT    NOT NULL DEFAULT 'trial',
      max_subscribers     INTEGER NOT NULL DEFAULT 50,
      max_panels          INTEGER NOT NULL DEFAULT 2,
      admin_bot_token     TEXT,
      customer_bot_token  TEXT,
      admin_chat_ids      TEXT,
      trial_ends_at       TEXT,
      billing_cycle       TEXT    NOT NULL DEFAULT 'monthly',
      next_billing_at     TEXT,
      created_at          TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at          TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS tenant_payments (
      id                  INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id           INTEGER NOT NULL REFERENCES tenants(id),
      amount              REAL    NOT NULL,
      currency            TEXT    NOT NULL DEFAULT 'USD',
      method              TEXT    NOT NULL,
      status              TEXT    NOT NULL DEFAULT 'pending',
      stripe_session_id   TEXT,
      crypto_tx_hash      TEXT,
      reference           TEXT,
      plan_snapshot       TEXT,
      period_start        TEXT,
      period_end          TEXT,
      notes               TEXT,
      created_at          TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS platform_plans (
      id                  INTEGER PRIMARY KEY AUTOINCREMENT,
      name                TEXT    NOT NULL UNIQUE,
      display_name        TEXT    NOT NULL,
      price_monthly       REAL    NOT NULL,
      price_yearly        REAL    NOT NULL,
      max_subscribers     INTEGER NOT NULL,
      max_panels          INTEGER NOT NULL,
      features            TEXT,
      is_active           INTEGER NOT NULL DEFAULT 1,
      sort_order          INTEGER NOT NULL DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS idx_tenants_status ON tenants(status);
    CREATE INDEX IF NOT EXISTS idx_tenants_slug ON tenants(slug);
    CREATE INDEX IF NOT EXISTS idx_tenant_payments_tenant ON tenant_payments(tenant_id);
  `);

  // --- Existing tables ---
  db.exec(`
    CREATE TABLE IF NOT EXISTS subscribers (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_name   TEXT    NOT NULL,
      phone           TEXT,
      telegram_user   TEXT,
      xtream_username  TEXT,
      package         TEXT    NOT NULL,
      start_date      TEXT    NOT NULL,
      expiry_date     TEXT    NOT NULL,
      status          TEXT    NOT NULL DEFAULT 'active',
      notes           TEXT,
      created_at      TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at      TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS payment_history (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      subscriber_id   INTEGER NOT NULL REFERENCES subscribers(id),
      amount          REAL,
      currency        TEXT    DEFAULT 'USD',
      payment_date    TEXT    NOT NULL DEFAULT (datetime('now')),
      method          TEXT,
      notes           TEXT
    );

    CREATE TABLE IF NOT EXISTS audit_log (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      action          TEXT    NOT NULL,
      subscriber_id   INTEGER REFERENCES subscribers(id),
      details         TEXT,
      performed_at    TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS panels (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      name            TEXT    NOT NULL,
      url             TEXT    NOT NULL,
      username        TEXT    NOT NULL,
      password        TEXT    NOT NULL,
      is_default      INTEGER NOT NULL DEFAULT 0,
      is_active       INTEGER NOT NULL DEFAULT 1,
      created_at      TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS admins (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      username        TEXT    NOT NULL,
      password_hash   TEXT    NOT NULL,
      display_name    TEXT,
      created_at      TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS customer_links (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      subscriber_id   INTEGER NOT NULL REFERENCES subscribers(id),
      telegram_chat_id TEXT   NOT NULL,
      telegram_username TEXT,
      link_code       TEXT,
      linked_at       TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS reminders_sent (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      subscriber_id   INTEGER NOT NULL REFERENCES subscribers(id),
      reminder_type   TEXT    NOT NULL,
      days_before     INTEGER NOT NULL,
      sent_at         TEXT    NOT NULL DEFAULT (datetime('now')),
      UNIQUE(subscriber_id, reminder_type, days_before)
    );

    CREATE TABLE IF NOT EXISTS tenant_settings (
      tenant_id INTEGER NOT NULL REFERENCES tenants(id),
      key       TEXT    NOT NULL,
      value     TEXT,
      PRIMARY KEY (tenant_id, key)
    );

    CREATE TABLE IF NOT EXISTS pending_sync (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      subscriber_id   INTEGER NOT NULL REFERENCES subscribers(id),
      action          TEXT    NOT NULL,
      payload         TEXT,
      created_at      TEXT    NOT NULL DEFAULT (datetime('now')),
      status          TEXT    NOT NULL DEFAULT 'pending',
      error           TEXT,
      synced_at       TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_pending_sync_status ON pending_sync(status);
    CREATE INDEX IF NOT EXISTS idx_subscribers_status ON subscribers(status);
    CREATE INDEX IF NOT EXISTS idx_subscribers_expiry ON subscribers(expiry_date);
    CREATE INDEX IF NOT EXISTS idx_subscribers_xtream ON subscribers(xtream_username);
    CREATE INDEX IF NOT EXISTS idx_subscribers_panel ON subscribers(panel_id);
    CREATE INDEX IF NOT EXISTS idx_customer_links_sub ON customer_links(subscriber_id);
    CREATE INDEX IF NOT EXISTS idx_reminders_sent_sub ON reminders_sent(subscriber_id);
    CREATE INDEX IF NOT EXISTS idx_payment_history_sub ON payment_history(subscriber_id);
  `);

  // --- Safe column migrations ---
  if (!columnExists('subscribers', 'panel_id')) {
    db.exec('ALTER TABLE subscribers ADD COLUMN panel_id INTEGER REFERENCES panels(id)');
  }
  if (!columnExists('subscribers', 'balance')) {
    db.exec('ALTER TABLE subscribers ADD COLUMN balance REAL NOT NULL DEFAULT 0');
  }
  if (!columnExists('subscribers', 'cost_per_line')) {
    db.exec('ALTER TABLE subscribers ADD COLUMN cost_per_line REAL');
  }
  if (!columnExists('payment_history', 'payment_type')) {
    db.exec("ALTER TABLE payment_history ADD COLUMN payment_type TEXT NOT NULL DEFAULT 'payment'");
  }
  if (!columnExists('payment_history', 'balance_after')) {
    db.exec('ALTER TABLE payment_history ADD COLUMN balance_after REAL');
  }

  // --- Multi-tenant migrations: add tenant_id to existing tables ---
  if (!columnExists('subscribers', 'tenant_id')) {
    db.exec('ALTER TABLE subscribers ADD COLUMN tenant_id INTEGER REFERENCES tenants(id)');
  }
  if (!columnExists('panels', 'tenant_id')) {
    db.exec('ALTER TABLE panels ADD COLUMN tenant_id INTEGER REFERENCES tenants(id)');
  }
  if (!columnExists('admins', 'tenant_id')) {
    db.exec('ALTER TABLE admins ADD COLUMN tenant_id INTEGER REFERENCES tenants(id)');
  }
  if (!columnExists('admins', 'role')) {
    db.exec("ALTER TABLE admins ADD COLUMN role TEXT NOT NULL DEFAULT 'tenant_admin'");
  }
  if (!columnExists('payment_history', 'tenant_id')) {
    db.exec('ALTER TABLE payment_history ADD COLUMN tenant_id INTEGER REFERENCES tenants(id)');
  }
  if (!columnExists('audit_log', 'tenant_id')) {
    db.exec('ALTER TABLE audit_log ADD COLUMN tenant_id INTEGER REFERENCES tenants(id)');
  }
  if (!columnExists('customer_links', 'tenant_id')) {
    db.exec('ALTER TABLE customer_links ADD COLUMN tenant_id INTEGER REFERENCES tenants(id)');
  }
  if (!columnExists('reminders_sent', 'tenant_id')) {
    db.exec('ALTER TABLE reminders_sent ADD COLUMN tenant_id INTEGER REFERENCES tenants(id)');
  }
  if (!columnExists('pending_sync', 'tenant_id')) {
    db.exec('ALTER TABLE pending_sync ADD COLUMN tenant_id INTEGER REFERENCES tenants(id)');
  }

  // Seed default tenant for existing data
  const tenantCount = db.prepare('SELECT COUNT(*) as count FROM tenants').get().count;
  if (tenantCount === 0) {
    db.exec(`
      INSERT INTO tenants (id, slug, company_name, owner_name, owner_email, plan, status, max_subscribers, max_panels)
      VALUES (1, 'default', 'Default', 'Admin', 'admin@linetrack.app', 'enterprise', 'active', 9999, 99)
    `);
    // Backfill existing data to default tenant
    db.exec("UPDATE subscribers SET tenant_id = 1 WHERE tenant_id IS NULL");
    db.exec("UPDATE panels SET tenant_id = 1 WHERE tenant_id IS NULL");
    db.exec("UPDATE admins SET tenant_id = 1 WHERE tenant_id IS NULL");
    db.exec("UPDATE payment_history SET tenant_id = 1 WHERE tenant_id IS NULL");
    db.exec("UPDATE audit_log SET tenant_id = 1 WHERE tenant_id IS NULL");
    db.exec("UPDATE customer_links SET tenant_id = 1 WHERE tenant_id IS NULL");
    db.exec("UPDATE reminders_sent SET tenant_id = 1 WHERE tenant_id IS NULL");
    db.exec("UPDATE pending_sync SET tenant_id = 1 WHERE tenant_id IS NULL");
    // Make existing admin a super_admin
    db.exec("UPDATE admins SET role = 'super_admin' WHERE tenant_id = 1");
  }

  // Seed default platform plans
  const planCount = db.prepare('SELECT COUNT(*) as count FROM platform_plans').get().count;
  if (planCount === 0) {
    db.exec(`
      INSERT INTO platform_plans (name, display_name, price_monthly, price_yearly, max_subscribers, max_panels, features, sort_order)
      VALUES
        ('basic', 'Basic', 15, 150, 50, 2, '{"customerBot":false,"reports":true,"bulk":false}', 1),
        ('pro', 'Pro', 30, 300, 200, 5, '{"customerBot":true,"reports":true,"bulk":true}', 2),
        ('enterprise', 'Enterprise', 60, 600, 9999, 99, '{"customerBot":true,"reports":true,"bulk":true}', 3)
    `);
  }

  // Composite indexes for tenant-scoped queries
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_subscribers_tenant ON subscribers(tenant_id, status);
    CREATE INDEX IF NOT EXISTS idx_subscribers_tenant_expiry ON subscribers(tenant_id, expiry_date);
    CREATE INDEX IF NOT EXISTS idx_panels_tenant ON panels(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_admins_tenant ON admins(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_payment_history_tenant ON payment_history(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_pending_sync_tenant ON pending_sync(tenant_id, status);
  `);

  // --- Recapture campaign tables ---
  db.exec(`
    CREATE TABLE IF NOT EXISTS recapture_campaigns (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id         INTEGER NOT NULL REFERENCES tenants(id),
      name              TEXT    NOT NULL,
      enabled           INTEGER NOT NULL DEFAULT 1,
      days_after_expiry INTEGER NOT NULL DEFAULT 7,
      message_template  TEXT    NOT NULL,
      offer_text        TEXT,
      created_at        TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at        TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS recapture_sent (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id         INTEGER NOT NULL REFERENCES tenants(id),
      subscriber_id     INTEGER NOT NULL REFERENCES subscribers(id),
      campaign_id       INTEGER NOT NULL REFERENCES recapture_campaigns(id),
      sent_at           TEXT    NOT NULL DEFAULT (datetime('now')),
      UNIQUE(subscriber_id, campaign_id)
    );

    CREATE INDEX IF NOT EXISTS idx_recapture_campaigns_tenant ON recapture_campaigns(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_recapture_sent_tenant ON recapture_sent(tenant_id);
  `);

  // Seed default recapture campaign for tenants that have none
  const tenantsWithoutCampaign = db.prepare(`
    SELECT t.id FROM tenants t
    WHERE t.id NOT IN (SELECT DISTINCT tenant_id FROM recapture_campaigns)
  `).all();

  if (tenantsWithoutCampaign.length > 0) {
    const insertCampaign = db.prepare(`
      INSERT INTO recapture_campaigns (tenant_id, name, enabled, days_after_expiry, message_template, offer_text)
      VALUES (@tenantId, 'Welcome Back', 1, 7, @template, 'Contact us for a special renewal offer!')
    `);
    const tmpl = 'Hello {customer_name}! Your IPTV subscription expired {days_ago} days ago. We would love to have you back! {offer_text}';
    for (const t of tenantsWithoutCampaign) {
      insertCampaign.run({ tenantId: t.id, template: tmpl });
    }
  }

  // Migrate old settings to tenant_settings if needed
  if (tableExists('settings')) {
    const oldSettings = db.prepare('SELECT * FROM settings').all();
    if (oldSettings.length > 0) {
      const upsert = db.prepare('INSERT OR IGNORE INTO tenant_settings (tenant_id, key, value) VALUES (1, @key, @value)');
      for (const s of oldSettings) {
        upsert.run({ key: s.key, value: s.value });
      }
    }
  }
}

module.exports = { initialize, tableExists, columnExists };
