const batchId = window.location.pathname.split('/').pop();
let batch = null;

async function api(path, options) {
  const res = await fetch(path, options && options.body ? { ...options, headers: { 'Content-Type': 'application/json' } } : options);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || data.message || '请求失败');
  return data;
}

function renderInfo() {
  document.getElementById('batchId').textContent = '批次编号：' + batch.id;
  const overdue = batch.dueDate && !batch.allReturned && new Date(batch.dueDate) < new Date(new Date().toDateString());
  const statusPill = batch.allReturned
    ? '<span class="pill ok">已完成</span>'
    : (overdue ? '<span class="pill danger">已逾期</span>' : '<span class="pill warn">进行中</span>');

  document.getElementById('batchInfo').innerHTML = `
    <div class="info-grid">
      <div class="info-item">
        <span class="info-label">批次名称</span>
        <div class="info-value">${batch.name || '-'}</div>
      </div>
      <div class="info-item">
        <span class="info-label">演示活动</span>
        <div class="info-value">${batch.eventName || '-'}</div>
      </div>
      <div class="info-item">
        <span class="info-label">借用人</span>
        <div class="info-value">${batch.borrower || '-'}</div>
      </div>
      <div class="info-item">
        <span class="info-label">预计归还日期</span>
        <div class="info-value">${batch.dueDate || '-'}</div>
      </div>
      <div class="info-item">
        <span class="info-label">创建时间</span>
        <div class="info-value">${new Date(batch.createdAt).toLocaleString('zh-CN')}</div>
      </div>
      <div class="info-item">
        <span class="info-label">状态</span>
        <div class="info-value">${statusPill}</div>
      </div>
      ${batch.remark ? `
      <div class="info-item" style="grid-column:span 2">
        <span class="info-label">备注</span>
        <div class="info-value">${batch.remark}</div>
      </div>` : ''}
      <div class="info-item" style="grid-column:span 2">
        <span class="info-label">归还进度</span>
        <div class="progress-bar" style="margin-top:4px">
          <div class="progress-fill ${batch.allReturned ? 'ok' : 'warn'}" style="width:${batch.totalCount ? (batch.returnedCount / batch.totalCount * 100) : 0}%"></div>
        </div>
        <div class="meta" style="margin-top:4px">已归还 ${batch.returnedCount} / ${batch.totalCount} 件，未归还 ${batch.notReturnedCount} 件</div>
      </div>
      <div class="info-item" style="grid-column:span 2">
        <button id="editInfoBtn" class="secondary">编辑批次信息</button>
      </div>
    </div>
  `;

  document.getElementById('editInfoBtn').onclick = openEditModal;
}

function openEditModal() {
  const newName = prompt('批次名称', batch.name || '');
  if (newName === null) return;
  const newEventName = prompt('演示活动', batch.eventName || '');
  if (newEventName === null) return;
  const newBorrower = prompt('借用人', batch.borrower || '');
  if (newBorrower === null) return;
  const newDueDate = prompt('预计归还日期 (YYYY-MM-DD)', batch.dueDate || '');
  if (newDueDate === null) return;
  const newRemark = prompt('备注', batch.remark || '');
  if (newRemark === null) return;

  api('/api/batches/' + batchId, {
    method: 'PATCH',
    body: JSON.stringify({
      name: newName,
      eventName: newEventName,
      borrower: newBorrower,
      dueDate: newDueDate,
      remark: newRemark
    })
  }).then(() => {
    load();
  }).catch(e => alert('更新失败：' + e.message));
}

function renderItemRow(item) {
  const pill = item.stillBorrowed
    ? '<span class="pill warn">未归还</span>'
    : '<span class="pill ok">已归还</span>';
  const actionBtn = item.stillBorrowed
    ? `<button class="secondary small" data-return="${item.id}">登记归还</button>`
    : '';
  const dueLabel = item.dueDate ? `<div class="meta">📅 预计归还：${item.dueDate}</div>` : '';

  return `
    <div class="item-row">
      <div class="item-main">
        <div class="item-title">
          <strong>${item.code} · ${item.name}</strong>
          ${pill}
        </div>
        <div class="meta">磨损：${item.wear || '无'} | 状态：${item.status}</div>
        ${item.borrowedAt ? `<div class="meta">借出时间：${new Date(item.borrowedAt).toLocaleString('zh-CN')}</div>` : ''}
        ${dueLabel}
      </div>
      <div class="item-actions">
        ${actionBtn}
      </div>
    </div>
  `;
}

function renderNotReturned() {
  document.getElementById('notReturnedCount').textContent = batch.notReturnedCount;
  const list = batch.notReturnedList || [];
  const el = document.getElementById('notReturnedList');
  if (list.length === 0) {
    el.innerHTML = '<div class="empty">所有道具已归还</div>';
    return;
  }
  el.innerHTML = `<div class="item-list">${list.map(renderItemRow).join('')}</div>`;
  bindReturnButtons(el);
}

function renderAllItems() {
  document.getElementById('totalCount').textContent = batch.totalCount;
  const list = batch.items || [];
  const el = document.getElementById('allItemsList');
  if (list.length === 0) {
    el.innerHTML = '<div class="empty">该批次没有道具</div>';
    return;
  }
  el.innerHTML = `<div class="item-list">${list.map(renderItemRow).join('')}</div>`;
  bindReturnButtons(el);
}

function bindReturnButtons(container) {
  container.querySelectorAll('[data-return]').forEach(btn => {
    btn.onclick = () => {
      const itemId = btn.dataset.return;
      const item = (batch.items || []).find(i => i.id === itemId);
      openReturnModal(item);
    };
  });
}

function openReturnModal(item) {
  const returnDate = prompt('归还日期 (YYYY-MM-DD)', new Date().toISOString().slice(0, 10));
  if (returnDate === null) return;
  const returner = prompt('归还人', batch.borrower || '');
  if (returner === null) return;
  const wearChange = prompt('磨损变化（可留空）', item.wear || '');
  if (wearChange === null) return;
  const needRepair = confirm('是否需要修补？\n\n确定 = 需修补\n取消 = 可借用');

  api('/api/items/' + item.id + '/return', {
    method: 'POST',
    body: JSON.stringify({
      returnDate,
      returner,
      wearChange,
      needRepair
    })
  }).then(() => {
    alert('归还登记成功');
    load();
  }).catch(e => alert('归还登记失败：' + e.message));
}

function renderLogs() {
  const logs = batch.logs || [];
  const el = document.getElementById('batchLogs');
  if (logs.length === 0) {
    el.innerHTML = '<div class="empty meta">暂无日志记录</div>';
    return;
  }
  el.innerHTML = logs.slice().reverse().map(l => `
    <div class="log-item">
      <div class="meta">${new Date(l.at).toLocaleString('zh-CN')} · <strong>${l.step}</strong></div>
      <div style="margin-top:2px">${l.note || ''}</div>
    </div>
  `).join('');
}

async function load() {
  try {
    batch = await api('/api/batches/' + batchId);
    renderInfo();
    renderNotReturned();
    renderAllItems();
    renderLogs();
  } catch (e) {
    document.querySelector('main').innerHTML = '<div class="error" style="padding:20px">加载失败：' + e.message + '</div>';
  }
}

document.getElementById('addLogBtn').onclick = async () => {
  const note = prompt('输入备注内容');
  if (!note) return;
  try {
    await api('/api/batches/' + batchId + '/logs', {
      method: 'POST',
      body: JSON.stringify({ step: '备注', note })
    });
    load();
  } catch (e) {
    alert('添加失败：' + e.message);
  }
};

document.getElementById('reload')?.addEventListener('click', load);

load();
