// Global utilities

async function api(url, options = {}) {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  });
  if (res.status === 401) {
    window.location.href = '/login';
    return;
  }
  const data = res.headers.get('content-type')?.includes('json') ? await res.json() : await res.text();
  if (!res.ok) throw new Error(data.error || data || 'Request failed');
  return data;
}

function toast(message, type = 'success') {
  const container = document.getElementById('toast-container');
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.textContent = message;
  container.appendChild(el);
  setTimeout(() => el.remove(), 4000);
}

function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
  document.getElementById('sidebar-overlay').classList.toggle('open');
}

function openModal(id) {
  document.getElementById(id).classList.add('open');
}

function closeModal(id) {
  document.getElementById(id).classList.remove('open');
}

async function logout() {
  await fetch('/api/auth/logout', { method: 'POST' });
  window.location.href = '/login';
}

function statusBadge(status) {
  const cls = { active: 'badge-active', disabled: 'badge-disabled', expired: 'badge-expired' }[status] || 'badge-expired';
  return `<span class="badge ${cls}">${status}</span>`;
}

function daysLeft(expiryDate) {
  const d = Math.ceil((new Date(expiryDate) - new Date()) / (1000 * 60 * 60 * 24));
  return d > 0 ? d : 0;
}

function formatDate(d) {
  return d ? d.split('T')[0] : 'N/A';
}

function renderPagination(containerId, currentPage, totalPages, onPageChange) {
  const el = document.getElementById(containerId);
  if (!el || totalPages <= 1) { if (el) el.innerHTML = ''; return; }
  let html = `<button ${currentPage <= 1 ? 'disabled' : ''} onclick="${onPageChange}(${currentPage - 1})">Prev</button>`;
  for (let i = 1; i <= totalPages; i++) {
    if (totalPages > 7 && i > 3 && i < totalPages - 2 && Math.abs(i - currentPage) > 1) {
      if (i === 4) html += '<span>...</span>';
      continue;
    }
    html += `<button class="${i === currentPage ? 'active' : ''}" onclick="${onPageChange}(${i})">${i}</button>`;
  }
  html += `<button ${currentPage >= totalPages ? 'disabled' : ''} onclick="${onPageChange}(${currentPage + 1})">Next</button>`;
  el.innerHTML = html;
}

function debounce(fn, ms = 300) {
  let timer;
  return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), ms); };
}
