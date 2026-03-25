const db = require('./connection');

function columnExists(table, column) {
  const cols = db.pragma(`table_info(${table})`);
  return cols.some((c) => c.name === column);
}

function initialize() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS subscribers (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_name   TEXT    NOT NULL,
      phone           TEXT,
      telegram_user   TEXT,
      xtream_username  TEXT   UNIQUE,
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
      name            TEXT    NOT NULL UNIQUE,
      url             TEXT    NOT NULL,
      username        TEXT    NOT NULL,
      password        TEXT    NOT NULL,
      is_default      INTEGER NOT NULL DEFAULT 0,
      is_active       INTEGER NOT NULL DEFAULT 1,
      created_at      TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS admins (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      username        TEXT    NOT NULL UNIQUE,
      password_hash   TEXT    NOT NULL,
      display_name    TEXT,
      created_at      TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS customer_links (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      subscriber_id   INTEGER NOT NULL REFERENCES subscribers(id),
      telegram_chat_id TEXT   NOT NULL UNIQUE,
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

    CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY,
      value TEXT
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

  // Add columns to existing tables (safe migration)
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
}

module.exports = { initialize };
