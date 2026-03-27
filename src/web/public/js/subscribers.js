let currentPage = 1;
let currentSort = 'expiry_date';
let currentDir = 'ASC';
let selectedIds = new Set();

async function loadSubscribers(page = 1) {
  currentPage = page;
  const search = document.getElementById('search-input').value;
  const status = document.getElementById('status-filter').value;
  const panelId = document.getElementById('panel-filter').value;
  const params = new URLSearchParams({ page, limit: 25, sortBy: currentSort, sortDir: currentDir });
  if (search) params.set('search', search);
  if (status !== 'all') params.set('status', status);
  if (panelId) params.set('panelId', panelId);

  try {
    const result = await api(`/api/subscribers?${params}`);
    const tbody = document.querySelector('#subs-table tbody');
    tbody.innerHTML = result.data.length === 0 ? '<tr><td colspan="9">No subscribers found</td></tr>' :
      result.data.map(s => `<tr>
        <td><input type="checkbox" value="${s.id}" onchange="toggleSelect(${s.id}, this.checked)" ${selectedIds.has(s.id) ? 'checked' : ''}></td>
        <td><a href="/subscribers/${s.id}">${s.customer_name}</a></td>
        <td>${s.xtream_username}</td>
        <td>${s.package}</td>
        <td>${formatDate(s.expiry_date)} (${daysLeft(s.expiry_date)}d)</td>
        <td>${statusBadge(s.status)}</td>
        <td>${s.panel_name || 'N/A'}</td>
        <td>$${(s.balance || 0).toFixed(2)}</td>
        <td class="action-cell">
          ${s.status === 'active' ? `<button class="btn btn-sm btn-danger" onclick="killUser(${s.id})">Kill</button>` : ''}
          ${s.status !== 'active' ? `<button class="btn btn-sm btn-success" onclick="enableUserAction(${s.id})">Enable</button>` : ''}
          <button class="btn btn-sm btn-primary" onclick="showExtendModal(${s.id})">Extend</button>
        </td>
      </tr>`).join('');
    renderPagination('pagination', result.page, result.totalPages, 'loadSubscribers');
  } catch (err) { toast(err.message, 'error'); }
}

function toggleSelect(id, checked) {
  checked ? selectedIds.add(id) : selectedIds.delete(id);
  document.getElementById('bulk-toolbar').style.display = selectedIds.size > 0 ? 'flex' : 'none';
  document.getElementById('selected-count').textContent = `${selectedIds.size} selected`;
}

function toggleSelectAll(el) {
  document.querySelectorAll('#subs-table tbody input[type=checkbox]').forEach(cb => {
    cb.checked = el.checked;
    toggleSelect(parseInt(cb.value), el.checked);
  });
}

async function killUser(id) {
  if (!confirm('Kill access for this user?')) return;
  try { await api(`/api/subscribers/${id}/kill`, { method: 'POST' }); toast('Access killed'); loadSubscribers(currentPage); } catch (e) { toast(e.message, 'error'); }
}

async function enableUserAction(id) {
  try { await api(`/api/subscribers/${id}/enable`, { method: 'POST' }); toast('Access restored'); loadSubscribers(currentPage); } catch (e) { toast(e.message, 'error'); }
}

function showExtendModal(id) {
  document.getElementById('extend-id').value = id;
  openModal('extend-modal');
}

document.getElementById('extend-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = document.getElementById('extend-id').value;
  const days = e.target.days.value;
  try {
    await api(`/api/subscribers/${id}/extend`, { method: 'POST', body: JSON.stringify({ days: parseInt(days) }) });
    toast('Subscription extended');
    closeModal('extend-modal');
    loadSubscribers(currentPage);
  } catch (err) { toast(err.message, 'error'); }
});

async function bulkAction(action) {
  if (selectedIds.size === 0) return;
  if (!confirm(`${action === 'disable' ? 'Kill' : 'Enable'} ${selectedIds.size} users?`)) return;
  try {
    await api(`/api/bulk/mass-${action}`, { method: 'POST', body: JSON.stringify({ ids: [...selectedIds] }) });
    toast(`Bulk ${action} complete`);
    selectedIds.clear();
    document.getElementById('bulk-toolbar').style.display = 'none';
    loadSubscribers(currentPage);
  } catch (e) { toast(e.message, 'error'); }
}

function bulkExtendPrompt() {
  const days = prompt('Extend by how many days?', '30');
  if (!days) return;
  api('/api/bulk/mass-extend', { method: 'POST', body: JSON.stringify({ ids: [...selectedIds], days: parseInt(days) }) })
    .then(() => { toast('Bulk extend complete'); selectedIds.clear(); document.getElementById('bulk-toolbar').style.display = 'none'; loadSubscribers(currentPage); })
    .catch(e => toast(e.message, 'error'));
}

function showAddModal() { openModal('add-modal'); loadPanels(); }

async function loadPanels() {
  try {
    const panels = await api('/api/panels');
    const opts = panels.filter(p => p.is_active).map(p => `<option value="${p.id}" ${p.is_default ? 'selected' : ''}>${p.name}</option>`).join('');
    document.getElementById('add-panel-select').innerHTML = opts || '<option value="">No panels</option>';
    document.getElementById('panel-filter').innerHTML = '<option value="">All Panels</option>' +
      panels.filter(p => p.is_active).map(p => `<option value="${p.id}">${p.name}</option>`).join('');
  } catch (_) {}
}

document.getElementById('add-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  const days = parseInt(fd.get('days')) || 30;
  const expDate = new Date(); expDate.setDate(expDate.getDate() + days);
  const body = {
    customerName: fd.get('customerName'),
    phone: fd.get('phone'),
    telegramUser: fd.get('telegramUser'),
    xtreamUsername: fd.get('xtreamUsername'),
    xtreamPassword: fd.get('xtreamPassword'),
    pkg: fd.get('pkg'),
    panelId: parseInt(fd.get('panelId')) || undefined,
    maxConnections: parseInt(fd.get('maxConnections')) || 1,
    bouquet: fd.get('bouquet') || undefined,
    notes: fd.get('notes'),
    expDate: expDate.toISOString().split('T')[0],
  };
  try {
    await api('/api/subscribers', { method: 'POST', body: JSON.stringify(body) });
    toast('Subscriber created');
    closeModal('add-modal');
    e.target.reset();
    loadSubscribers(currentPage);
  } catch (err) { toast(err.message, 'error'); }
});

// Sort handlers
document.querySelectorAll('.sortable').forEach(th => {
  th.addEventListener('click', () => {
    const col = th.dataset.sort;
    if (currentSort === col) { currentDir = currentDir === 'ASC' ? 'DESC' : 'ASC'; }
    else { currentSort = col; currentDir = 'ASC'; }
    loadSubscribers(1);
  });
});

// Debounced search
document.getElementById('search-input').addEventListener('input', debounce(() => loadSubscribers(1)));
document.getElementById('status-filter').addEventListener('change', () => loadSubscribers(1));
document.getElementById('panel-filter').addEventListener('change', () => loadSubscribers(1));

// Initial load
loadPanels();
loadSubscribers();
