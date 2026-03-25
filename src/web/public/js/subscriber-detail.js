(async function () {
  try {
    const sub = await api(`/api/subscribers/${SUBSCRIBER_ID}`);
    document.getElementById('sub-title').textContent = sub.customer_name;

    document.getElementById('sub-info').innerHTML = [
      ['Username', sub.xtream_username],
      ['Phone', sub.phone || 'N/A'],
      ['Telegram', sub.telegram_user || 'N/A'],
      ['Package', sub.package],
      ['Panel', sub.panel_name || 'N/A'],
      ['Start Date', formatDate(sub.start_date)],
      ['Expiry Date', formatDate(sub.expiry_date)],
      ['Days Left', daysLeft(sub.expiry_date)],
      ['Status', sub.status.toUpperCase()],
      ['Balance', '$' + (sub.balance || 0).toFixed(2)],
      ['Notes', sub.notes || 'N/A'],
    ].map(([l, v]) => `<div class="info-row"><span class="label">${l}</span><span>${v}</span></div>`).join('');

    // Quick actions
    document.getElementById('quick-actions').innerHTML = `
      ${sub.status === 'active' ? `<button class="btn btn-danger" onclick="killSub()">Kill Access</button>` : ''}
      ${sub.status !== 'active' ? `<button class="btn btn-success" onclick="enableSub()">Enable Access</button>` : ''}
      <button class="btn btn-primary" onclick="extendSub()">Extend</button>
    `;

    // Payments
    const ptbody = document.querySelector('#payments-table tbody');
    ptbody.innerHTML = (sub.payments || []).length === 0 ? '<tr><td colspan="6">No payments</td></tr>' :
      sub.payments.map(p => `<tr>
        <td>${formatDate(p.payment_date)}</td>
        <td>$${(p.amount || 0).toFixed(2)}</td>
        <td>${p.payment_type}</td>
        <td>${p.method || 'N/A'}</td>
        <td>$${(p.balance_after || 0).toFixed(2)}</td>
        <td>${p.notes || ''}</td>
      </tr>`).join('');

    // Audit
    const atbody = document.querySelector('#audit-table tbody');
    atbody.innerHTML = (sub.audit || []).length === 0 ? '<tr><td colspan="3">No audit entries</td></tr>' :
      sub.audit.map(a => `<tr>
        <td>${formatDate(a.performed_at)}</td>
        <td>${a.action}</td>
        <td>${a.details || ''}</td>
      </tr>`).join('');

  } catch (err) { toast(err.message, 'error'); }

  // Payment form
  document.getElementById('payment-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    try {
      await api('/api/payments', {
        method: 'POST',
        body: JSON.stringify({ subscriberId: SUBSCRIBER_ID, amount: fd.get('amount'), method: fd.get('method'), notes: fd.get('notes') }),
      });
      toast('Payment recorded');
      e.target.reset();
      location.reload();
    } catch (err) { toast(err.message, 'error'); }
  });
})();

async function killSub() {
  if (!confirm('Kill access?')) return;
  try { await api(`/api/subscribers/${SUBSCRIBER_ID}/kill`, { method: 'POST' }); toast('Access killed'); location.reload(); } catch (e) { toast(e.message, 'error'); }
}

async function enableSub() {
  try { await api(`/api/subscribers/${SUBSCRIBER_ID}/enable`, { method: 'POST' }); toast('Access restored'); location.reload(); } catch (e) { toast(e.message, 'error'); }
}

async function extendSub() {
  const days = prompt('Extend by how many days?', '30');
  if (!days) return;
  try { await api(`/api/subscribers/${SUBSCRIBER_ID}/extend`, { method: 'POST', body: JSON.stringify({ days: parseInt(days) }) }); toast('Extended'); location.reload(); } catch (e) { toast(e.message, 'error'); }
}
