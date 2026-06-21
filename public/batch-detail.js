import { initAuth, renderLoginStatusBar, applyPermissionGuards, can } from "./auth.js";

const batchId = window.location.pathname.split('/').pop();
let batch = null;
let selectedItemIds = new Set();
let itemDetails = new Map();

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
        <button id="editInfoBtn" class="secondary" data-perm="update_batch">编辑批次信息</button>
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
    ? `<button class="secondary small" data-return="${item.id}" data-perm="return_item">登记归还</button>`
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
  const batchReturnBtn = document.getElementById('batchReturnBtn');

  if (list.length === 0) {
    el.innerHTML = '<div class="empty">所有道具已归还</div>';
    if (batchReturnBtn) batchReturnBtn.style.display = 'none';
    return;
  }

  if (batchReturnBtn) {
    batchReturnBtn.style.display = '';
    batchReturnBtn.onclick = openBatchReturnModal;
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

function openBatchReturnModal() {
  const list = batch.notReturnedList || [];
  if (list.length === 0) {
    alert('没有需要归还的道具');
    return;
  }

  selectedItemIds = new Set();
  itemDetails = new Map();

  const today = new Date().toISOString().slice(0, 10);

  const modal = document.getElementById('batchReturnModal');
  const body = document.getElementById('batchReturnModalBody');

  body.innerHTML = `
    <div class="batch-return-form">
      <div class="batch-return-section">
        <h4 style="margin:0 0 12px 0">📋 选择要归还的道具</h4>
        <div class="batch-return-toolbar">
          <button type="button" class="secondary small" id="selectAllReturnBtn">全选</button>
          <button type="button" class="secondary small" id="clearSelectionReturnBtn">清空选择</button>
          <span class="meta" style="margin-left:auto">已选择 <strong id="selectedReturnCount">0</strong> 件</span>
        </div>
        <div class="batch-return-items" id="batchReturnItems">
          ${list.map(item => {
            itemDetails.set(item.id, {
              ...item,
              wearChange: '',
              needRepair: false,
              note: ''
            });
            return `
              <label class="batch-return-item" data-item-id="${item.id}">
                <input type="checkbox" class="return-item-checkbox" data-item-id="${item.id}">
                <div class="return-item-info">
                  <div class="return-item-title">
                    <strong>${item.code} · ${item.name}</strong>
                    <span class="pill small warn">未归还</span>
                  </div>
                  <div class="meta">当前磨损：${item.wear || '无'} | 借用人：${item.borrower || '未填写'}</div>
                </div>
                <button type="button" class="secondary small toggle-detail-btn" data-item-id="${item.id}">详情 ▾</button>
              </label>
              <div class="return-item-details" data-item-id="${item.id}" style="display:none">
                <div class="detail-grid">
                  <div class="detail-item">
                    <label>磨损变化（留空则使用通用磨损）</label>
                    <input type="text" class="detail-wear" data-item-id="${item.id}" placeholder="如：新增划痕 / 无明显变化" value="${item.wear || ''}">
                  </div>
                  <div class="detail-item">
                    <label>差异说明</label>
                    <input type="text" class="detail-note" data-item-id="${item.id}" placeholder="与其他道具不同的特殊情况">
                  </div>
                  <div class="detail-item">
                    <label class="checkbox-label">
                      <input type="checkbox" class="detail-repair" data-item-id="${item.id}">
                      <span>此道具需单独标记为需修补</span>
                    </label>
                  </div>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>

      <div class="batch-return-section">
        <h4 style="margin:0 0 12px 0">📝 通用归还信息</h4>
        <div class="form-grid">
          <div class="form-item">
            <label>归还日期</label>
            <input type="date" id="batchReturnDate" value="${today}" required>
          </div>
          <div class="form-item">
            <label>归还人</label>
            <input type="text" id="batchReturner" value="${batch.borrower || ''}" placeholder="请输入归还人姓名" required>
          </div>
          <div class="form-item" style="grid-column:span 2">
            <label>通用磨损说明</label>
            <input type="text" id="batchGeneralWear" placeholder="如：使用正常，无明显变化 / 整体略有灰尘，已清洁">
          </div>
        </div>
        <div class="meta" style="margin-top:8px">以上信息将应用于所有选中的道具，单个道具可在详情中覆盖磨损说明和需修补标记</div>
      </div>

      <div class="batch-return-footer">
        <button type="button" class="secondary" id="cancelBatchReturn">取消</button>
        <button type="button" id="submitBatchReturn" data-perm="return_item">提交归还</button>
      </div>
    </div>
  `;

  modal.style.display = 'block';

  document.getElementById('batchReturnModalClose').onclick = closeBatchReturnModal;
  document.getElementById('cancelBatchReturn').onclick = closeBatchReturnModal;

  document.querySelectorAll('.return-item-checkbox').forEach(cb => {
    cb.onchange = (e) => {
      const itemId = e.target.dataset.itemId;
      if (e.target.checked) {
        selectedItemIds.add(itemId);
      } else {
        selectedItemIds.delete(itemId);
      }
      updateSelectedReturnCount();
    };
  });

  document.querySelectorAll('.toggle-detail-btn').forEach(btn => {
    btn.onclick = (e) => {
      const itemId = e.target.dataset.itemId;
      const details = document.querySelector(`.return-item-details[data-item-id="${itemId}"]`);
      const isHidden = details.style.display === 'none';
      details.style.display = isHidden ? 'block' : 'none';
      e.target.textContent = isHidden ? '详情 ▴' : '详情 ▾';
    };
  });

  document.querySelectorAll('.detail-wear').forEach(input => {
    input.oninput = (e) => {
      const itemId = e.target.dataset.itemId;
      const detail = itemDetails.get(itemId);
      if (detail) detail.wearChange = e.target.value;
    };
  });

  document.querySelectorAll('.detail-note').forEach(input => {
    input.oninput = (e) => {
      const itemId = e.target.dataset.itemId;
      const detail = itemDetails.get(itemId);
      if (detail) detail.note = e.target.value;
    };
  });

  document.querySelectorAll('.detail-repair').forEach(cb => {
    cb.onchange = (e) => {
      const itemId = e.target.dataset.itemId;
      const detail = itemDetails.get(itemId);
      if (detail) detail.needRepair = e.target.checked;
    };
  });

  document.getElementById('selectAllReturnBtn').onclick = () => {
    list.forEach(item => selectedItemIds.add(item.id));
    document.querySelectorAll('.return-item-checkbox').forEach(cb => cb.checked = true);
    updateSelectedReturnCount();
  };

  document.getElementById('clearSelectionReturnBtn').onclick = () => {
    selectedItemIds.clear();
    document.querySelectorAll('.return-item-checkbox').forEach(cb => cb.checked = false);
    updateSelectedReturnCount();
  };

  document.getElementById('submitBatchReturn').onclick = submitBatchReturn;

  applyPermissionGuards();
}

function updateSelectedReturnCount() {
  document.getElementById('selectedReturnCount').textContent = selectedItemIds.size;
}

function closeBatchReturnModal() {
  document.getElementById('batchReturnModal').style.display = 'none';
}

async function submitBatchReturn() {
  if (selectedItemIds.size === 0) {
    alert('请至少选择一件道具');
    return;
  }

  const returnDate = document.getElementById('batchReturnDate').value;
  const returner = document.getElementById('batchReturner').value.trim();
  const generalWear = document.getElementById('batchGeneralWear').value.trim();

  if (!returnDate) {
    alert('请填写归还日期');
    return;
  }
  if (!returner) {
    alert('请填写归还人');
    return;
  }

  const items = Array.from(selectedItemIds).map(itemId => {
    const detail = itemDetails.get(itemId);
    return {
      itemId,
      wearChange: detail?.wearChange || '',
      needRepair: detail?.needRepair || false,
      note: detail?.note || ''
    };
  });

  const confirmMsg = `确认归还以下 ${items.length} 件道具？\n\n` +
    items.map(id => {
      const detail = itemDetails.get(id.itemId);
      return `• ${detail.code} · ${detail.name}`;
    }).join('\n') +
    `\n\n归还日期：${returnDate}\n归还人：${returner}` +
    (generalWear ? `\n通用磨损：${generalWear}` : '');

  if (!confirm(confirmMsg)) return;

  try {
    const result = await api('/api/batches/' + batchId + '/return', {
      method: 'POST',
      body: JSON.stringify({
        returnDate,
        returner,
        generalWear,
        items
      })
    });

    alert(`批量归还成功！\n共处理 ${result.processedCount} 件道具`);
    closeBatchReturnModal();
    load();
  } catch (e) {
    alert('批量归还失败：' + e.message);
  }
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
    applyPermissionGuards();
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

window.onclick = (e) => {
  const modal = document.getElementById('batchReturnModal');
  if (e.target === modal) {
    closeBatchReturnModal();
  }
};

(async () => {
  await initAuth();
  renderLoginStatusBar(document.getElementById("userStatusBar"));
  applyPermissionGuards();
  await load();
})();
