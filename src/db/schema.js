const db = require('./connection');

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

    CREATE INDEX IF NOT EXISTS idx_subscribers_status ON subscribers(status);
    CREATE INDEX IF NOT EXISTS idx_subscribers_expiry ON subscribers(expiry_date);
    CREATE INDEX IF NOT EXISTS idx_subscribers_xtream ON subscribers(xtream_username);
  `);
}

module.exports = { initialize };
