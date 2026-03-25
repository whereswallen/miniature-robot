(async function () {
  try {
    const stats = await api('/api/reports/stats');
    document.getElementById('stat-cards').innerHTML = `
      <div class="stat-card info"><div class="value">${stats.total}</div><div class="label">Total Subscribers</div></div>
      <div class="stat-card success"><div class="value">${stats.active}</div><div class="label">Active</div></div>
      <div class="stat-card accent"><div class="value">${stats.disabled}</div><div class="label">Disabled</div></div>
      <div class="stat-card"><div class="value">${stats.expired}</div><div class="label">Expired</div></div>
      <div class="stat-card warning"><div class="value">${stats.expiring_soon}</div><div class="label">Expiring (7d)</div></div>
      <div class="stat-card success"><div class="value">$${(stats.revenue_this_month || 0).toFixed(2)}</div><div class="label">Revenue (This Month)</div></div>
    `;

    // Revenue chart
    const endDate = new Date().toISOString().split('T')[0];
    const startDate = new Date(Date.now() - 180 * 86400000).toISOString().split('T')[0];
    const revenue = await api(`/api/reports/revenue?startDate=${startDate}&endDate=${endDate}&groupBy=month`);

    if (revenue.length > 0) {
      new Chart(document.getElementById('revenue-chart'), {
        type: 'bar',
        data: {
          labels: revenue.map(r => r.period),
          datasets: [{ label: 'Revenue', data: revenue.map(r => r.revenue), backgroundColor: 'rgba(239,68,68,0.7)' }]
        },
        options: { responsive: true, plugins: { legend: { display: false } }, scales: { y: { ticks: { color: '#8b8fa3' } }, x: { ticks: { color: '#8b8fa3' } } } }
      });
    }

    // Status chart
    new Chart(document.getElementById('status-chart'), {
      type: 'doughnut',
      data: {
        labels: ['Active', 'Disabled', 'Expired'],
        datasets: [{ data: [stats.active, stats.disabled, stats.expired], backgroundColor: ['#22c55e', '#ef4444', '#6b7280'] }]
      },
      options: { responsive: true, plugins: { legend: { labels: { color: '#8b8fa3' } } } }
    });

    // Expiring table
    const subs = await api('/api/subscribers?status=active&sortBy=expiry_date&sortDir=ASC&limit=10');
    const expiring = subs.data.filter(s => daysLeft(s.expiry_date) <= 7);
    const tbody = document.querySelector('#expiring-table tbody');
    tbody.innerHTML = expiring.length === 0 ? '<tr><td colspan="5">No subscribers expiring soon</td></tr>' :
      expiring.map(s => `<tr>
        <td><a href="/subscribers/${s.id}">${s.xtream_username}</a></td>
        <td>${s.customer_name}</td>
        <td>${formatDate(s.expiry_date)}</td>
        <td>${daysLeft(s.expiry_date)}d</td>
        <td><button class="btn btn-sm btn-primary" onclick="window.location='/subscribers/${s.id}'">View</button></td>
      </tr>`).join('');
  } catch (err) {
    toast(err.message, 'error');
  }
})();
