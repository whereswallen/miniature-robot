let revenueChart, methodsChart;

// Default date range: last 6 months
const end = new Date();
const start = new Date(end); start.setMonth(start.getMonth() - 6);
document.getElementById('start-date').value = start.toISOString().split('T')[0];
document.getElementById('end-date').value = end.toISOString().split('T')[0];

function switchTab(btn, tabId) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById(tabId).classList.add('active');
}

async function loadReports() {
  const startDate = document.getElementById('start-date').value;
  const endDate = document.getElementById('end-date').value;
  const groupBy = document.getElementById('group-by').value;
  if (!startDate || !endDate) { toast('Select date range', 'error'); return; }

  try {
    // Revenue
    const revenue = await api(`/api/reports/revenue?startDate=${startDate}&endDate=${endDate}&groupBy=${groupBy}`);
    const rtbody = document.querySelector('#revenue-table tbody');
    rtbody.innerHTML = revenue.map(r => `<tr><td>${r.period}</td><td>$${r.revenue.toFixed(2)}</td><td>${r.payment_count}</td></tr>`).join('') || '<tr><td colspan="3">No data</td></tr>';

    if (revenueChart) revenueChart.destroy();
    revenueChart = new Chart(document.getElementById('revenue-chart'), {
      type: 'bar',
      data: { labels: revenue.map(r => r.period), datasets: [{ label: 'Revenue', data: revenue.map(r => r.revenue), backgroundColor: 'rgba(239,68,68,0.7)' }] },
      options: { responsive: true, scales: { y: { ticks: { color: '#8b8fa3' } }, x: { ticks: { color: '#8b8fa3' } } } }
    });

    // Methods
    const methods = await api(`/api/reports/methods?startDate=${startDate}&endDate=${endDate}`);
    const mtbody = document.querySelector('#methods-table tbody');
    mtbody.innerHTML = methods.map(m => `<tr><td>${m.method}</td><td>$${m.total.toFixed(2)}</td><td>${m.count}</td></tr>`).join('') || '<tr><td colspan="3">No data</td></tr>';

    if (methodsChart) methodsChart.destroy();
    if (methods.length > 0) {
      methodsChart = new Chart(document.getElementById('methods-chart'), {
        type: 'pie',
        data: { labels: methods.map(m => m.method), datasets: [{ data: methods.map(m => m.total), backgroundColor: ['#ef4444', '#22c55e', '#3b82f6', '#f59e0b', '#8b5cf6'] }] },
        options: { responsive: true, plugins: { legend: { labels: { color: '#8b8fa3' } } } }
      });
    }

    // Profit
    const profit = await api(`/api/reports/profit?startDate=${startDate}&endDate=${endDate}`);
    const ptbody = document.querySelector('#profit-table tbody');
    ptbody.innerHTML = profit.map(p => `<tr><td>${p.customer_name}</td><td>${p.xtream_username}</td><td>$${p.revenue.toFixed(2)}</td><td>$${p.cost.toFixed(2)}</td><td>$${p.profit.toFixed(2)}</td></tr>`).join('') || '<tr><td colspan="5">No data</td></tr>';

    // Outstanding
    const outstanding = await api('/api/payments/outstanding');
    const otbody = document.querySelector('#outstanding-table tbody');
    otbody.innerHTML = outstanding.map(o => `<tr><td>${o.customer_name}</td><td>${o.xtream_username}</td><td>$${o.balance.toFixed(2)}</td><td>${statusBadge(o.status)}</td><td><a href="/subscribers/${o.id}" class="btn btn-sm">View</a></td></tr>`).join('') || '<tr><td colspan="5">No outstanding balances</td></tr>';

  } catch (err) { toast(err.message, 'error'); }
}

loadReports();
