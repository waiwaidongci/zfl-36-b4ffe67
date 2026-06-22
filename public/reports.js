import { initAuth, renderLoginStatusBar, applyPermissionGuards, can } from "./auth.js";

let reportData = { summary: null, items: [] };
let eventData = { events: [] };
let activeTab = "item";

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
        <span>核验次数</span>
        <strong style="color:#558b2f">${summary.checkCount || 0}</strong>
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

function formatReportDateTime(dateStr) {
  if (!dateStr) return '-';
  try {
    const date = new Date(dateStr);
    return date.toLocaleString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch {
    return dateStr;
  }
}

function getReportCheckBadge(result) {
  switch (result) {
    case '正常': return '<span class="pill small ok">正常</span>';
    case '存放异常': return '<span class="pill small" style="background:#fff3e0;color:#e65100">存放异常</span>';
    case '状态异常': return '<span class="pill small" style="background:#fff3e0;color:#e65100">状态异常</span>';
    case '需修补': return '<span class="pill small warn">需修补</span>';
    case '已借出中': return '<span class="pill small" style="background:#e3f2fd;color:#1565c0">已借出中</span>';
    default: return result ? `<span class="pill small">${result}</span>` : '-';
  }
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
            <th>核验次数</th>
            <th>最近核验</th>
            <th>核验结果</th>
            <th>逾期次数</th>
            <th>修补次数</th>
            <th>是否可借用</th>
          </tr>
        </thead>
        <tbody>
          ${filtered.map(item => {
            const latestCheck = item.latestCheck;
            return `
            <tr>
              <td><strong>${item.code || item.id}</strong></td>
              <td>${item.name || ''}</td>
              <td><span class="pill small ${item.status === '可借用' ? 'ok' : item.status === '需修补' ? 'warn' : ''}">${item.status}</span></td>
              <td>${item.borrowCount}</td>
              <td><strong>${item.checkCount || 0}</strong></td>
              <td class="meta" style="font-size:12px">${latestCheck ? formatReportDateTime(latestCheck.at) : '-'}</td>
              <td>${latestCheck ? getReportCheckBadge(latestCheck.checkResult) + (latestCheck.needRepair ? ' ⚠️' : '') : '-'}</td>
              <td class="${item.overdueCount > 0 ? 'warn' : ''}">${item.overdueCount}</td>
              <td>${item.repairCount}</td>
              <td>${item.isAvailable ? '<span class="pill small ok">是</span>' : '<span class="pill small warn">否</span>'}</td>
            </tr>
          `}).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function renderEvents(events) {
  const el = document.getElementById('reportEvents');
  const q = document.getElementById('eventSearch').value.trim().toLowerCase();

  const filtered = events.filter(ev =>
    !q || (ev.eventName || '').toLowerCase().includes(q)
  );

  if (filtered.length === 0) {
    el.innerHTML = '<div class="empty">暂无数据</div>';
    return;
  }

  const totalBorrow = filtered.reduce((s, e) => s + e.borrowCount, 0);
  const totalEvents = filtered.reduce((s, e) => s + e.eventCount, 0);
  const totalOverdue = filtered.reduce((s, e) => s + e.overdueCount, 0);
  const totalRepair = filtered.reduce((s, e) => s + e.repairCount, 0);

  el.innerHTML = `
    <div class="report-summary-grid">
      <div class="summary-card">
        <span>活动总数</span>
        <strong>${filtered.length}</strong>
      </div>
      <div class="summary-card">
        <span>活动总次数</span>
        <strong class="ok">${totalEvents}</strong>
      </div>
      <div class="summary-card">
        <span>借用总次数</span>
        <strong class="ok">${totalBorrow}</strong>
      </div>
      <div class="summary-card">
        <span>逾期未归还</span>
        <strong class="warn">${totalOverdue}</strong>
      </div>
      <div class="summary-card">
        <span>产生修补</span>
        <strong class="info">${totalRepair}</strong>
      </div>
    </div>
    <div class="report-table-wrap" style="margin-top:12px">
      <table class="report-table">
        <thead>
          <tr>
            <th>活动名称</th>
            <th>活动次数</th>
            <th>借用次数</th>
            <th>单道具借用</th>
            <th>批次借用</th>
            <th>涉及道具数</th>
            <th>逾期未归还数</th>
            <th>产生修补数</th>
            <th>最近借用时间</th>
          </tr>
        </thead>
        <tbody>
          ${filtered.map(ev => `
            <tr>
              <td><strong>${ev.eventName}</strong></td>
              <td>${ev.eventCount}</td>
              <td>${ev.borrowCount}</td>
              <td>${ev.singleBorrowCount}</td>
              <td>${ev.batchBorrowCount}</td>
              <td>${ev.itemCount}</td>
              <td class="${ev.overdueCount > 0 ? 'warn' : ''}">${ev.overdueCount}</td>
              <td>${ev.repairCount}</td>
              <td>${ev.lastBorrowAt ? new Date(ev.lastBorrowAt).toLocaleString('zh-CN') : '-'}</td>
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
    applyPermissionGuards();
  } catch (e) {
    document.getElementById('reportSummary').innerHTML = '<div class="error">加载失败：' + e.message + '</div>';
    document.getElementById('reportItems').innerHTML = '<div class="error">加载失败：' + e.message + '</div>';
  }
}

async function loadEventReport() {
  try {
    document.getElementById('reportEvents').innerHTML = '<div class="loading">加载中...</div>';

    const params = getDateParams();
    const data = await api('/api/reports/events' + (params ? '?' + params : ''));
    eventData = data;

    renderEvents(data.events);
    applyPermissionGuards();
  } catch (e) {
    document.getElementById('reportEvents').innerHTML = '<div class="error">加载失败：' + e.message + '</div>';
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

  loadAllReports();
}

function loadAllReports() {
  loadReport();
  loadEventReport();
}

function exportCSV() {
  if (activeTab === 'event') {
    const params = getDateParams();
    const url = '/api/reports/events/export' + (params ? '?' + params : '');
    window.location.href = url;
  } else {
    const params = getDateParams();
    const url = '/api/reports/export' + (params ? '?' + params : '');
    window.location.href = url;
  }
}

function switchTab(tab) {
  activeTab = tab;
  document.querySelectorAll('.report-tab').forEach(t => {
    t.classList.toggle('active', t.dataset.tab === tab);
  });
  document.getElementById('tabItem').style.display = tab === 'item' ? '' : 'none';
  document.getElementById('tabEvent').style.display = tab === 'event' ? '' : 'none';

  if (tab === 'event' && eventData.events.length === 0) {
    loadEventReport();
  }
}

document.getElementById('queryBtn').onclick = loadAllReports;
document.getElementById('exportBtn').onclick = exportCSV;
document.getElementById('search').oninput = () => renderItems(reportData.items || []);
document.getElementById('eventSearch').oninput = () => renderEvents(eventData.events || []);
document.getElementById('reload').onclick = loadAllReports;

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

document.querySelectorAll('.report-tab').forEach(tab => {
  tab.onclick = () => switchTab(tab.dataset.tab);
});

(function initDefaultDates() {
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - 29);
  document.getElementById('startDate').value = start.toISOString().slice(0, 10);
  document.getElementById('endDate').value = end.toISOString().slice(0, 10);
})();

(async () => {
  await initAuth();
  renderLoginStatusBar(document.getElementById("userStatusBar"));
  applyPermissionGuards();
  await loadReport();
})();
