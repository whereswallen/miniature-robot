const db = require('../db/connection');

const insertPayment = db.prepare(`
  INSERT INTO payment_history (tenant_id, subscriber_id, amount, currency, method, notes, payment_type, balance_after)
  VALUES (@tenantId, @subscriberId, @amount, @currency, @method, @notes, @paymentType, @balanceAfter)
`);

const updateBalance = db.prepare(`
  UPDATE subscribers SET balance = @balance, updated_at = datetime('now') WHERE id = @id AND tenant_id = @tenantId
`);

const getBalance = db.prepare(`SELECT balance FROM subscribers WHERE id = @id AND tenant_id = @tenantId`);

const getPayments = db.prepare(`
  SELECT ph.*, s.customer_name, s.xtream_username
  FROM payment_history ph
  JOIN subscribers s ON ph.subscriber_id = s.id
  WHERE ph.subscriber_id = @subscriberId AND ph.tenant_id = @tenantId
  ORDER BY ph.payment_date DESC
`);

const getPaymentById = db.prepare(`
  SELECT ph.*, s.customer_name, s.xtream_username, s.phone, s.package, s.expiry_date
  FROM payment_history ph
  JOIN subscribers s ON ph.subscriber_id = s.id
  WHERE ph.id = @id AND ph.tenant_id = @tenantId
`);

const outstanding = db.prepare(`
  SELECT s.*, p.name as panel_name FROM subscribers s
  LEFT JOIN panels p ON s.panel_id = p.id
  WHERE s.balance < 0 AND s.tenant_id = @tenantId
  ORDER BY s.balance ASC
`);

function recordPayment(tenantId, subscriberId, { amount, currency = 'USD', method, notes }) {
  const current = getBalance.get({ id: subscriberId, tenantId });
  if (!current) throw new Error('Subscriber not found.');
  const newBalance = (current.balance || 0) + amount;
  updateBalance.run({ id: subscriberId, tenantId, balance: newBalance });
  return insertPayment.run({
    tenantId,
    subscriberId,
    amount,
    currency,
    method: method || null,
    notes: notes || null,
    paymentType: 'payment',
    balanceAfter: newBalance,
  });
}

function addCredit(tenantId, subscriberId, amount, notes = '') {
  const current = getBalance.get({ id: subscriberId, tenantId });
  if (!current) throw new Error('Subscriber not found.');
  const newBalance = (current.balance || 0) + amount;
  updateBalance.run({ id: subscriberId, tenantId, balance: newBalance });
  return insertPayment.run({
    tenantId,
    subscriberId,
    amount,
    currency: 'USD',
    method: null,
    notes: notes || 'Credit added',
    paymentType: 'credit',
    balanceAfter: newBalance,
  });
}

function applyCredit(tenantId, subscriberId, amount) {
  const current = getBalance.get({ id: subscriberId, tenantId });
  if (!current) throw new Error('Subscriber not found.');
  const newBalance = (current.balance || 0) - amount;
  updateBalance.run({ id: subscriberId, tenantId, balance: newBalance });
  return insertPayment.run({
    tenantId,
    subscriberId,
    amount: -amount,
    currency: 'USD',
    method: null,
    notes: 'Credit applied',
    paymentType: 'adjustment',
    balanceAfter: newBalance,
  });
}

function getOutstandingBalances(tenantId) {
  return outstanding.all({ tenantId });
}

function getPaymentHistory(tenantId, subscriberId) {
  return getPayments.all({ tenantId, subscriberId });
}

function getRevenueReport(tenantId, { startDate, endDate, groupBy = 'month' }) {
  const groupExpr = {
    day: "strftime('%Y-%m-%d', payment_date)",
    week: "strftime('%Y-W%W', payment_date)",
    month: "strftime('%Y-%m', payment_date)",
    year: "strftime('%Y', payment_date)",
  }[groupBy] || "strftime('%Y-%m', payment_date)";

  return db.prepare(`
    SELECT ${groupExpr} as period,
      SUM(CASE WHEN payment_type = 'payment' THEN amount ELSE 0 END) as revenue,
      COUNT(CASE WHEN payment_type = 'payment' THEN 1 END) as payment_count
    FROM payment_history
    WHERE tenant_id = @tenantId AND payment_date >= @startDate AND payment_date <= @endDate
    GROUP BY period ORDER BY period ASC
  `).all({ tenantId, startDate, endDate });
}

function getPaymentMethodBreakdown(tenantId, { startDate, endDate }) {
  return db.prepare(`
    SELECT COALESCE(method, 'Unknown') as method,
      SUM(amount) as total, COUNT(*) as count
    FROM payment_history
    WHERE tenant_id = @tenantId AND payment_type = 'payment' AND payment_date >= @startDate AND payment_date <= @endDate
    GROUP BY method ORDER BY total DESC
  `).all({ tenantId, startDate, endDate });
}

function getProfitReport(tenantId, { startDate, endDate }) {
  return db.prepare(`
    SELECT s.id, s.customer_name, s.xtream_username, s.cost_per_line,
      COALESCE(SUM(CASE WHEN ph.payment_type = 'payment' THEN ph.amount ELSE 0 END), 0) as revenue,
      COALESCE(s.cost_per_line, 0) as cost,
      COALESCE(SUM(CASE WHEN ph.payment_type = 'payment' THEN ph.amount ELSE 0 END), 0) - COALESCE(s.cost_per_line, 0) as profit
    FROM subscribers s
    LEFT JOIN payment_history ph ON s.id = ph.subscriber_id AND ph.payment_date >= @startDate AND ph.payment_date <= @endDate
    WHERE s.tenant_id = @tenantId
    GROUP BY s.id ORDER BY profit DESC
  `).all({ tenantId, startDate, endDate });
}

function generateInvoiceData(tenantId, paymentId) {
  const payment = getPaymentById.get({ id: paymentId, tenantId });
  if (!payment) throw new Error('Payment not found.');
  return {
    invoiceNumber: `INV-${String(paymentId).padStart(6, '0')}`,
    date: payment.payment_date,
    customer: {
      name: payment.customer_name,
      username: payment.xtream_username,
      phone: payment.phone,
    },
    package: payment.package,
    amount: payment.amount,
    currency: payment.currency,
    method: payment.method,
    notes: payment.notes,
  };
}

function getAllPayments(tenantId, { page = 1, limit = 25, subscriberId } = {}) {
  let where = 'WHERE ph.tenant_id = @tenantId';
  const params = { tenantId };
  if (subscriberId) {
    where += ' AND ph.subscriber_id = @subscriberId';
    params.subscriberId = subscriberId;
  }
  const countRow = db.prepare(`SELECT COUNT(*) as total FROM payment_history ph ${where}`).get(params);
  const rows = db.prepare(`
    SELECT ph.*, s.customer_name, s.xtream_username
    FROM payment_history ph JOIN subscribers s ON ph.subscriber_id = s.id
    ${where} ORDER BY ph.payment_date DESC LIMIT @limit OFFSET @offset
  `).all({ ...params, limit, offset: (page - 1) * limit });

  return { data: rows, total: countRow.total, page, limit, totalPages: Math.ceil(countRow.total / limit) };
}

module.exports = {
  recordPayment,
  addCredit,
  applyCredit,
  getOutstandingBalances,
  getPaymentHistory,
  getRevenueReport,
  getPaymentMethodBreakdown,
  getProfitReport,
  generateInvoiceData,
  getAllPayments,
};
