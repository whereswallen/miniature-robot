async function loadPanels() {
  try {
    const panels = await api('/api/panels');
    const tbody = document.querySelector('#panels-table tbody');
    tbody.innerHTML = panels.length === 0 ? '<tr><td colspan="5">No panels configured</td></tr>' :
      panels.map(p => `<tr>
        <td>${p.name}</td>
        <td>${p.url}</td>
        <td>${p.is_default ? 'Yes' : 'No'}</td>
        <td>${p.is_active ? statusBadge('active') : statusBadge('disabled')}</td>
        <td>
          <button class="btn btn-sm" onclick="editPanel(${p.id})">Edit</button>
          <button class="btn btn-sm btn-primary" onclick="healthCheck(${p.id})">Check</button>
          ${p.is_active ? `<button class="btn btn-sm btn-danger" onclick="deletePanel(${p.id})">Remove</button>` : ''}
        </td>
      </tr>`).join('');
  } catch (err) { toast(err.message, 'error'); }
}

async function loadAdmins() {
  try {
    const admins = await api('/api/settings/admins');
    const tbody = document.querySelector('#admins-table tbody');
    tbody.innerHTML = admins.map(a => `<tr>
      <td>${a.username}</td>
      <td>${a.display_name || ''}</td>
      <td>
        <button class="btn btn-sm" onclick="changePass(${a.id})">Change Password</button>
        <button class="btn btn-sm btn-danger" onclick="deleteAdmin(${a.id})">Delete</button>
      </td>
    </tr>`).join('');
  } catch (err) { toast(err.message, 'error'); }
}

async function loadSettings() {
  try {
    const settings = await api('/api/settings');
    document.getElementById('alert-days').value = settings.alert_days || '1,3,7';
    document.getElementById('alert-cron').value = settings.alert_cron || '0 9 * * *';
  } catch (_) {}
}

function showPanelModal(panel) {
  document.getElementById('panel-modal-title').textContent = panel ? 'Edit Panel' : 'Add Panel';
  const form = document.getElementById('panel-form');
  form.reset();
  if (panel) {
    form.querySelector('[name=id]').value = panel.id;
    form.querySelector('[name=name]').value = panel.name;
    form.querySelector('[name=url]').value = panel.url;
    form.querySelector('[name=username]').value = panel.username;
    form.querySelector('[name=password]').value = panel.password;
    form.querySelector('[name=isDefault]').checked = panel.is_default;
  }
  openModal('panel-modal');
}

async function editPanel(id) {
  try {
    const panels = await api('/api/panels');
    const panel = panels.find(p => p.id === id);
    if (panel) showPanelModal(panel);
  } catch (e) { toast(e.message, 'error'); }
}

document.getElementById('panel-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  const id = fd.get('id');
  const body = { name: fd.get('name'), url: fd.get('url'), username: fd.get('username'), password: fd.get('password'), isDefault: fd.get('isDefault') === 'on' };
  try {
    if (id) { await api(`/api/panels/${id}`, { method: 'PUT', body: JSON.stringify(body) }); }
    else { await api('/api/panels', { method: 'POST', body: JSON.stringify(body) }); }
    toast('Panel saved');
    closeModal('panel-modal');
    loadPanels();
  } catch (err) { toast(err.message, 'error'); }
});

async function deletePanel(id) {
  if (!confirm('Remove this panel?')) return;
  try { await api(`/api/panels/${id}`, { method: 'DELETE' }); toast('Panel removed'); loadPanels(); } catch (e) { toast(e.message, 'error'); }
}

async function healthCheck(id) {
  try {
    const result = await api(`/api/panels/${id}/health`, { method: 'POST' });
    toast(result.ok ? 'Panel is healthy' : `Panel error: ${result.error}`, result.ok ? 'success' : 'error');
  } catch (e) { toast(e.message, 'error'); }
}

function showAdminModal() { openModal('admin-modal'); }

document.getElementById('admin-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  try {
    await api('/api/settings/admins', { method: 'POST', body: JSON.stringify({ username: fd.get('username'), password: fd.get('password'), displayName: fd.get('displayName') }) });
    toast('Admin created');
    closeModal('admin-modal');
    e.target.reset();
    loadAdmins();
  } catch (err) { toast(err.message, 'error'); }
});

async function deleteAdmin(id) {
  if (!confirm('Delete this admin?')) return;
  try { await api(`/api/settings/admins/${id}`, { method: 'DELETE' }); toast('Admin deleted'); loadAdmins(); } catch (e) { toast(e.message, 'error'); }
}

async function changePass(id) {
  const pass = prompt('New password:');
  if (!pass) return;
  try { await api(`/api/settings/admins/${id}/password`, { method: 'PUT', body: JSON.stringify({ password: pass }) }); toast('Password changed'); } catch (e) { toast(e.message, 'error'); }
}

document.getElementById('alert-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  try {
    await api('/api/settings', { method: 'PUT', body: JSON.stringify({ alert_days: fd.get('alert_days'), alert_cron: fd.get('alert_cron') }) });
    toast('Settings saved');
  } catch (err) { toast(err.message, 'error'); }
});

// Backups
async function loadBackups() {
  try {
    const data = await api('/api/settings/backups');
    const { stats, backups } = data;

    document.getElementById('backup-stats').innerHTML = `
      <div class="stat-card info"><div class="value">${stats.count}</div><div class="label">Backups</div></div>
      <div class="stat-card"><div class="value">${stats.totalSizeFormatted}</div><div class="label">Total Size</div></div>
      <div class="stat-card"><div class="value">${stats.dbSizeFormatted}</div><div class="label">Database Size</div></div>
      <div class="stat-card success"><div class="value">${stats.latestBackup ? formatDate(stats.latestBackup.createdAt) : 'Never'}</div><div class="label">Last Backup</div></div>
    `;

    const tbody = document.querySelector('#backups-table tbody');
    tbody.innerHTML = backups.length === 0 ? '<tr><td colspan="5">No backups yet. Create one above.</td></tr>' :
      backups.map(b => `<tr>
        <td style="font-size:0.8125rem">${b.filename}</td>
        <td>${b.label || '-'}</td>
        <td>${b.sizeFormatted}</td>
        <td>${formatDate(b.createdAt)}</td>
        <td>
          <a href="/api/settings/backups/${encodeURIComponent(b.filename)}/download" class="btn btn-sm">Download</a>
          <button class="btn btn-sm btn-primary" onclick="restoreBackup('${b.filename}')">Restore</button>
          <button class="btn btn-sm btn-danger" onclick="deleteBackup('${b.filename}')">Delete</button>
        </td>
      </tr>`).join('');
  } catch (err) { toast(err.message, 'error'); }
}

async function createBackup() {
  const label = document.getElementById('backup-label').value.trim();
  try {
    const result = await api('/api/settings/backups', { method: 'POST', body: JSON.stringify({ label }) });
    toast(`Backup created: ${result.filename}`);
    document.getElementById('backup-label').value = '';
    loadBackups();
  } catch (err) { toast(err.message, 'error'); }
}

async function restoreBackup(filename) {
  if (!confirm(`RESTORE database from "${filename}"?\n\nA safety backup will be created first.\nThe application may need to be restarted.`)) return;
  try {
    const result = await api(`/api/settings/backups/${encodeURIComponent(filename)}/restore`, { method: 'POST' });
    toast(result.message, 'info');
    loadBackups();
  } catch (err) { toast(err.message, 'error'); }
}

async function deleteBackup(filename) {
  if (!confirm(`Delete backup "${filename}"?`)) return;
  try {
    await api(`/api/settings/backups/${encodeURIComponent(filename)}`, { method: 'DELETE' });
    toast('Backup deleted');
    loadBackups();
  } catch (err) { toast(err.message, 'error'); }
}

loadPanels();
loadAdmins();
loadSettings();
loadBackups();
