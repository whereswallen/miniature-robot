const PDFDocument = require('pdfkit');
const financialService = require('./financialService');

function generateInvoiceText(tenantId, paymentId) {
  const data = financialService.generateInvoiceData(tenantId, paymentId);
  return [
    `INVOICE ${data.invoiceNumber}`,
    `Date: ${data.date}`,
    '',
    `Customer: ${data.customer.name}`,
    `Username: ${data.customer.username}`,
    data.customer.phone ? `Phone: ${data.customer.phone}` : '',
    '',
    `Package: ${data.package}`,
    `Amount: ${data.amount} ${data.currency}`,
    `Method: ${data.method || 'N/A'}`,
    data.notes ? `Notes: ${data.notes}` : '',
    '',
    'Thank you for your subscription.',
  ].filter((l) => l !== undefined).join('\n');
}

function generateInvoicePDF(tenantId, paymentId) {
  const data = financialService.generateInvoiceData(tenantId, paymentId);
  const doc = new PDFDocument({ size: 'A4', margin: 50 });

  // Header
  doc.fontSize(24).fillColor('#ef4444').text('LineTrack', { align: 'center' });
  doc.moveDown(0.5);
  doc.fontSize(16).fillColor('#333').text('INVOICE', { align: 'center' });
  doc.moveDown(1);

  // Invoice details
  doc.fontSize(10).fillColor('#666');
  doc.text(`Invoice #: ${data.invoiceNumber}`);
  doc.text(`Date: ${data.date}`);
  doc.moveDown(1);

  // Customer
  doc.fontSize(12).fillColor('#333').text('Bill To:');
  doc.fontSize(10).fillColor('#666');
  doc.text(data.customer.name);
  doc.text(`Username: ${data.customer.username}`);
  if (data.customer.phone) doc.text(`Phone: ${data.customer.phone}`);
  doc.moveDown(1);

  // Line item
  doc.fontSize(10).fillColor('#333');
  const tableTop = doc.y;
  doc.text('Description', 50, tableTop, { width: 200, continued: false });
  doc.text('Amount', 400, tableTop, { width: 100, align: 'right' });
  doc.moveTo(50, doc.y + 5).lineTo(550, doc.y + 5).stroke('#ddd');
  doc.moveDown(0.5);

  doc.fillColor('#666');
  doc.text(`IPTV Subscription - ${data.package}`, 50, doc.y, { width: 300 });
  doc.text(`${data.amount} ${data.currency}`, 400, doc.y - doc.currentLineHeight(), { width: 100, align: 'right' });
  doc.moveDown(0.5);

  doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke('#ddd');
  doc.moveDown(0.5);

  // Total
  doc.fontSize(12).fillColor('#333');
  doc.text('Total:', 350, doc.y, { width: 50 });
  doc.text(`${data.amount} ${data.currency}`, 400, doc.y - doc.currentLineHeight(), { width: 100, align: 'right' });
  doc.moveDown(1);

  // Payment info
  doc.fontSize(10).fillColor('#666');
  doc.text(`Payment Method: ${data.method || 'N/A'}`);
  if (data.notes) doc.text(`Notes: ${data.notes}`);
  doc.moveDown(2);

  doc.fontSize(10).fillColor('#999').text('Thank you for your subscription.', { align: 'center' });

  doc.end();
  return doc;
}

module.exports = { generateInvoiceText, generateInvoicePDF };
