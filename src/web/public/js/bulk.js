async function previewImport() {
  const fileInput = document.getElementById('import-file');
  if (!fileInput.files[0]) { toast('Select a file', 'error'); return; }

  const formData = new FormData();
  formData.append('file', fileInput.files[0]);

  try {
    const res = await fetch('/api/bulk/import/preview', { method: 'POST', body: formData });
    if (!res.ok) { const d = await res.json(); throw new Error(d.error); }
    const data = await res.json();

    document.getElementById('import-preview').style.display = 'block';
    document.getElementById('import-stats').innerHTML = `
      <div class="stat-card info"><div class="value">${data.total}</div><div class="label">Total Rows</div></div>
      <div class="stat-card success"><div class="value">${data.valid}</div><div class="label">Valid</div></div>
      <div class="stat-card accent"><div class="value">${data.errors}</div><div class="label">Errors</div></div>
    `;

    if (data.errorDetails.length > 0) {
      document.getElementById('import-errors').innerHTML = '<div class="card" style="border-color:var(--danger)"><h3>Errors</h3>' +
        data.errorDetails.map(e => `<p>Row ${e.row}: ${e.errors.join(', ')}</p>`).join('') + '</div>';
    } else {
      document.getElementById('import-errors').innerHTML = '';
    }

    const tbody = document.querySelector('#preview-table tbody');
    tbody.innerHTML = data.preview.map(r => `<tr>
      <td>${r.customer_name || ''}</td><td>${r.xtream_username || ''}</td>
      <td>${r.package || ''}</td><td>${r.expiry_date || ''}</td><td>${r.status || 'active'}</td>
    </tr>`).join('');

    // Load panels for import
    try {
      const panels = await api('/api/panels');
      document.getElementById('import-panel').innerHTML = '<option value="">No Panel (local only)</option>' +
        panels.filter(p => p.is_active).map(p => `<option value="${p.id}">${p.name}</option>`).join('');
    } catch (_) {}

  } catch (err) { toast(err.message, 'error'); }
}

async function executeImport() {
  const panelId = document.getElementById('import-panel').value;
  try {
    const result = await api('/api/bulk/import/execute', {
      method: 'POST',
      body: JSON.stringify({ panelId: panelId || undefined }),
    });
    toast(`Imported ${result.imported} subscribers (${result.skipped} skipped)`);
    document.getElementById('import-preview').style.display = 'none';
  } catch (err) { toast(err.message, 'error'); }
}

function exportSubscribers() {
  const status = document.getElementById('export-status').value;
  window.location.href = `/api/bulk/export/subscribers?status=${status}`;
}

function exportPayments() {
  window.location.href = '/api/bulk/export/payments';
}
