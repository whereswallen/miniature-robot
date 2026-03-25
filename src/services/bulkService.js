const { Readable } = require('stream');
const csvParser = require('csv-parser');
const db = require('../db/connection');
const userService = require('./userService');

function parseCSV(buffer) {
  return new Promise((resolve, reject) => {
    const rows = [];
    const stream = Readable.from(buffer);
    stream
      .pipe(csvParser())
      .on('data', (row) => rows.push(row))
      .on('end', () => resolve(rows))
      .on('error', reject);
  });
}

function parseXLSX(buffer) {
  const XLSX = require('xlsx');
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const sheetName = workbook.SheetNames[0];
  return XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);
}

function normalizeRow(row) {
  // Map common column names to our fields
  const mapping = {
    customer_name: ['customer_name', 'name', 'customer', 'client_name', 'client'],
    phone: ['phone', 'phone_number', 'tel', 'mobile'],
    telegram_user: ['telegram_user', 'telegram', 'tg'],
    xtream_username: ['xtream_username', 'username', 'user', 'xtream_user'],
    package: ['package', 'plan', 'subscription'],
    start_date: ['start_date', 'start', 'created'],
    expiry_date: ['expiry_date', 'expiry', 'exp_date', 'expires', 'end_date'],
    status: ['status', 'state'],
    notes: ['notes', 'note', 'comments'],
  };

  const normalized = {};
  for (const [field, aliases] of Object.entries(mapping)) {
    for (const alias of aliases) {
      const key = Object.keys(row).find((k) => k.toLowerCase().trim() === alias);
      if (key && row[key]) {
        normalized[field] = String(row[key]).trim();
        break;
      }
    }
  }
  return normalized;
}

function validateImportData(rows) {
  const valid = [];
  const errors = [];
  const seenUsernames = new Set();

  const existingUsernames = new Set(
    db.prepare('SELECT xtream_username FROM subscribers').all().map((r) => r.xtream_username)
  );

  rows.forEach((rawRow, index) => {
    const row = normalizeRow(rawRow);
    const rowErrors = [];

    if (!row.customer_name) rowErrors.push('Missing customer name');
    if (!row.xtream_username) rowErrors.push('Missing xtream username');
    if (!row.package) rowErrors.push('Missing package');

    if (row.xtream_username) {
      if (existingUsernames.has(row.xtream_username)) {
        rowErrors.push(`Username "${row.xtream_username}" already exists`);
      }
      if (seenUsernames.has(row.xtream_username)) {
        rowErrors.push(`Duplicate username "${row.xtream_username}" in import`);
      }
      seenUsernames.add(row.xtream_username);
    }

    if (rowErrors.length > 0) {
      errors.push({ row: index + 1, data: row, errors: rowErrors });
    } else {
      valid.push(row);
    }
  });

  return { valid, errors };
}

function previewImport(rows) {
  const normalized = rows.map(normalizeRow);
  const { valid, errors } = validateImportData(rows);
  return { total: rows.length, valid: valid.length, errors: errors.length, errorDetails: errors, preview: normalized.slice(0, 20) };
}

function executeImport(rows, panelId = null) {
  const { valid, errors } = validateImportData(rows);
  let imported = 0;

  const importTransaction = db.transaction((validRows) => {
    for (const row of validRows) {
      userService.createUserLocal({
        customerName: row.customer_name,
        phone: row.phone,
        telegramUser: row.telegram_user,
        xtreamUsername: row.xtream_username,
        pkg: row.package,
        startDate: row.start_date,
        expiryDate: row.expiry_date,
        status: row.status || 'active',
        notes: row.notes,
        panelId,
      });
      imported++;
    }
  });

  importTransaction(valid);

  return { imported, skipped: errors.length, errors };
}

function exportSubscribers(filters = {}) {
  let where = 'WHERE 1=1';
  const params = {};
  if (filters.status && filters.status !== 'all') {
    where += ' AND s.status = @status';
    params.status = filters.status;
  }
  if (filters.panelId) {
    where += ' AND s.panel_id = @panelId';
    params.panelId = filters.panelId;
  }

  return db.prepare(`
    SELECT s.customer_name, s.phone, s.telegram_user, s.xtream_username, s.package,
      s.start_date, s.expiry_date, s.status, s.balance, s.notes, p.name as panel
    FROM subscribers s LEFT JOIN panels p ON s.panel_id = p.id
    ${where} ORDER BY s.customer_name
  `).all(params);
}

function exportPayments(filters = {}) {
  let where = 'WHERE 1=1';
  const params = {};
  if (filters.startDate) {
    where += ' AND ph.payment_date >= @startDate';
    params.startDate = filters.startDate;
  }
  if (filters.endDate) {
    where += ' AND ph.payment_date <= @endDate';
    params.endDate = filters.endDate;
  }

  return db.prepare(`
    SELECT s.customer_name, s.xtream_username, ph.amount, ph.currency, ph.method,
      ph.payment_type, ph.payment_date, ph.notes
    FROM payment_history ph JOIN subscribers s ON ph.subscriber_id = s.id
    ${where} ORDER BY ph.payment_date DESC
  `).all(params);
}

function getCSVTemplate() {
  return 'customer_name,phone,telegram_user,xtream_username,package,start_date,expiry_date,status,notes\nJohn Doe,+1234567890,@johndoe,john_iptv,1 Month,2024-01-01,2024-02-01,active,Sample entry';
}

module.exports = {
  parseCSV,
  parseXLSX,
  validateImportData,
  previewImport,
  executeImport,
  exportSubscribers,
  exportPayments,
  getCSVTemplate,
};
