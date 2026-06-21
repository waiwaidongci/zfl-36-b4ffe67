import { initAuth, renderLoginStatusBar, applyPermissionGuards, can } from "./auth.js";

let batches = [];

async function api(path, options) {
  const res = await fetch(path, options && options.body ? { ...options, headers: { 'Content-Type': 'application/json' } } : options);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || data.message || '请求失败');
  return data;
}

function renderStats() {
  const total = batches.length;
  const active = batches.filter(b => !b.allReturned).length;
  const returned = batches.filter(b => b.allReturned).length;
  const totalItems = batches.reduce((s, b) => s + b.totalCount, 0);
  const notReturnedItems = batches.reduce((s, b) => s + b.notReturnedCount, 0);

  document.getElementById('batchStats').innerHTML = `
    <div class="stat-grid">
      <div class="stat-box">
        <span>总批次数</span>
        <strong>${total}</strong>
      </div>
      <div class="stat-box warn">
        <span>进行中批次</span>
        <strong>${active}</strong>
      </div>
      <div class="stat-box ok">
        <span>已完成批次</span>
        <strong>${returned}</strong>
      </div>
      <div class="stat-box">
        <span>借用道具总数</span>
        <strong>${totalItems}</strong>
      </div>
      <div class="stat-box warn">
        <span>待归还道具</span>
        <strong>${notReturnedItems}</strong>
      </div>
    </div>
  `;
}

function renderBatchCard(batch) {
  const statusPill = batch.allReturned
    ? '<span class="pill ok">已完成</span>'
    : '<span class="pill warn">进行中</span>';
  const dueDateLabel = batch.dueDate ? `<div class="meta">📅 预计归还：${batch.dueDate}</div>` : '';
  const remarkLabel = batch.remark ? `<div class="meta" style="margin-top:4px">📝 ${batch.remark}</div>` : '';
  const overdue = batch.dueDate && !batch.allReturned && new Date(batch.dueDate) < new Date(new Date().toDateString());
  const overdueLabel = overdue ? '<span class="pill danger">已逾期</span>' : '';

  return `
    <a href="/batches/${batch.id}" class="batch-card">
      <div class="batch-card-header">
        <h3>${batch.name || batch.eventName}</h3>
        <div class="batch-status">${statusPill} ${overdueLabel}</div>
      </div>
      <div class="batch-info">
        <div>🎭 活动：${batch.eventName || '-'}</div>
        <div>👤 借用人：${batch.borrower || '-'}</div>
        ${dueDateLabel}
        ${remarkLabel}
      </div>
      <div class="batch-progress">
        <div class="progress-bar">
          <div class="progress-fill ${batch.allReturned ? 'ok' : 'warn'}" style="width:${batch.totalCount ? (batch.returnedCount / batch.totalCount * 100) : 0}%"></div>
        </div>
        <div class="progress-meta meta">
          已归还 ${batch.returnedCount} / ${batch.totalCount} 件，未归还 ${batch.notReturnedCount} 件
        </div>
      </div>
      <div class="meta" style="margin-top:8px">创建时间：${new Date(batch.createdAt).toLocaleString('zh-CN')}</div>
    </a>
  `;
}

function renderList() {
  const status = document.getElementById('statusFilter').value;
  const q = document.getElementById('search').value.trim().toLowerCase();

  let visible = batches.slice();
  if (status === 'active') visible = visible.filter(b => !b.allReturned);
  if (status === 'returned') visible = visible.filter(b => b.allReturned);
  if (q) {
    visible = visible.filter(b =>
      (b.name || '').toLowerCase().includes(q) ||
      (b.eventName || '').toLowerCase().includes(q) ||
      (b.borrower || '').toLowerCase().includes(q) ||
      (b.remark || '').toLowerCase().includes(q)
    );
  }

  const listEl = document.getElementById('batchList');
  if (visible.length === 0) {
    listEl.innerHTML = '<div class="empty">暂无符合条件的批次记录</div>';
    return;
  }
  listEl.innerHTML = `<div class="batch-grid">${visible.map(renderBatchCard).join('')}</div>`;
}

async function load() {
  try {
    batches = await api('/api/batches');
    renderStats();
    renderList();
    applyPermissionGuards();
  } catch (e) {
    document.getElementById('batchStats').innerHTML = '<div class="error">加载失败：' + e.message + '</div>';
    document.getElementById('batchList').innerHTML = '';
  }
}

document.getElementById('statusFilter').onchange = renderList;
document.getElementById('search').oninput = renderList;
document.getElementById('reload').onclick = load;

(async () => {
  await initAuth();
  renderLoginStatusBar(document.getElementById("userStatusBar"));
  applyPermissionGuards();
  await load();
})();
