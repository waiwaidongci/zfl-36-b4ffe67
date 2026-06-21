let reportData = { summary: null, items: [] };

async function api(path, options) {
  const res = await fetch(path, options && options.body ? { ...options, headers: { 'Content-Type': 'application/json' } } : options);
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error || data.message || '请求失败');
  }
  return res.json();
}

function getDateParams() {
  const startDate = document.getElementById('startDate').value;
  const endDate = document.getElementById('endDate').value;
  const params = new URLSearchParams();
  if (startDate) params.set('startDate', startDate);
  if (endDate) params.set('endDate', endDate);
  return params.toString();
}

function renderSummary(summary) {
  const el = document.getElementById('reportSummary');
  if (!summary) {
    el.innerHTML = '<div class="loading">加载中...</div>';
    return;
  }

  el.innerHTML = `
    <div class="report-summary-grid">
      <div class="summary-card">
        <span>道具总数</span>
        <strong>${summary.totalItems}</strong>
      </div>
      <div class="summary-card">
        <span>借用次数</span>
        <strong class="ok">${summary.borrowCount}</strong>
      </div>
      <div class="summary-card">
        <span>逾期未归还</span>
        <strong class="warn">${summary.overdueCount}</strong>
      </div>
      <div class="summary-card">
        <span>修补次数</span>
        <strong class="info">${summary.repairCount}</strong>
      </div>
      <div class="summary-card">
        <span>可借用率</span>
        <strong class="ok">${summary.availableRate}%</strong>
      </div>
    </div>
    <div class="summary-meta meta">
      统计周期：${summary.startDate || '开始'} 至 ${summary.endDate || '至今'}
      · 生成时间：${new Date(summary.generatedAt).toLocaleString('zh-CN')}
    </div>
  `;
}

function renderItems(items) {
  const el = document.getElementById('reportItems');
  const q = document.getElementById('search').value.trim().toLowerCase();

  const filtered = items.filter(item =>
    !q ||
    (item.code || '').toLowerCase().includes(q) ||
    (item.name || '').toLowerCase().includes(q)
  );

  if (filtered.length === 0) {
    el.innerHTML = '<div class="empty">暂无数据</div>';
    return;
  }

  el.innerHTML = `
    <div class="report-table-wrap">
      <table class="report-table">
        <thead>
          <tr>
            <th>编号</th>
            <th>名称</th>
            <th>当前状态</th>
            <th>借用次数</th>
            <th>逾期次数</th>
            <th>修补次数</th>
            <th>是否可借用</th>
          </tr>
        </thead>
        <tbody>
          ${filtered.map(item => `
            <tr>
              <td><strong>${item.code || item.id}</strong></td>
              <td>${item.name || ''}</td>
              <td><span class="pill small ${item.status === '可借用' ? 'ok' : item.status === '需修补' ? 'warn' : ''}">${item.status}</span></td>
              <td>${item.borrowCount}</td>
              <td class="${item.overdueCount > 0 ? 'warn' : ''}">${item.overdueCount}</td>
              <td>${item.repairCount}</td>
              <td>${item.isAvailable ? '<span class="pill small ok">是</span>' : '<span class="pill small warn">否</span>'}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

async function loadReport() {
  try {
    document.getElementById('reportSummary').innerHTML = '<div class="loading">加载中...</div>';
    document.getElementById('reportItems').innerHTML = '<div class="loading">加载中...</div>';

    const params = getDateParams();
    const data = await api('/api/reports/items' + (params ? '?' + params : ''));
    reportData = data;

    renderSummary(data.summary);
    renderItems(data.items);
  } catch (e) {
    document.getElementById('reportSummary').innerHTML = '<div class="error">加载失败：' + e.message + '</div>';
    document.getElementById('reportItems').innerHTML = '<div class="error">加载失败：' + e.message + '</div>';
  }
}

function setQuickRange(days) {
  const end = new Date();
  const start = new Date();

  if (days === 'all') {
    document.getElementById('startDate').value = '';
    document.getElementById('endDate').value = '';
  } else {
    start.setDate(end.getDate() - days + 1);
    document.getElementById('startDate').value = start.toISOString().slice(0, 10);
    document.getElementById('endDate').value = end.toISOString().slice(0, 10);
  }

  loadReport();
}

function exportCSV() {
  const params = getDateParams();
  const url = '/api/reports/export' + (params ? '?' + params : '');
  window.location.href = url;
}

document.getElementById('queryBtn').onclick = loadReport;
document.getElementById('exportBtn').onclick = exportCSV;
document.getElementById('search').oninput = () => renderItems(reportData.items || []);
document.getElementById('reload').onclick = loadReport;

document.querySelectorAll('.quick-btn').forEach(btn => {
  btn.onclick = () => {
    const range = btn.dataset.range;
    if (range === 'all') {
      setQuickRange('all');
    } else {
      setQuickRange(parseInt(range, 10));
    }
  };
});

(function initDefaultDates() {
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - 29);
  document.getElementById('startDate').value = start.toISOString().slice(0, 10);
  document.getElementById('endDate').value = end.toISOString().slice(0, 10);
})();

loadReport();
