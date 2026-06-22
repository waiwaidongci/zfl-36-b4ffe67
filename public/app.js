import { fields, stages, extraFields } from "./constants.js";
import { renderPlanHtml, bindMaintenanceEvents } from "./maintenance.js";
import { loadReminders } from "./reminders.js";
import { initImport } from "./import.js";
import { initInventory } from "./inventory.js";
import { initReturns } from "./returns.js";
import { initRepairs } from "./repairs.js";
import { initQrCodeFeatures } from "./qrcode-label.js";
import { initAuth, renderLoginStatusBar, applyPermissionGuards, can } from "./auth.js";

const createForm = document.querySelector('#createForm');
const actionForm = document.querySelector('#actionForm');
const cards = document.querySelector('#cards');
const statsEl = document.querySelector('#stats');
const itemSelect = document.querySelector('#itemSelect');
const remindersEl = document.querySelector('#reminders');
let items = [];
let selectedItemIds = new Set();

async function api(path, options) {
  const res = await fetch(path, options && options.body ? { ...options, headers: { 'Content-Type': 'application/json' } } : options);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || data.message || '请求失败');
  return data;
}

function renderForms() {
  document.querySelector('#fields').innerHTML = fields.map(([key, label, type]) =>
    '<label>' + label + '</label><input name="' + key + '" type="' + type + '" ' + (key === 'code' ? 'required' : '') + '>'
  ).join('');
  document.querySelector('#extraFields').innerHTML = extraFields.map(([key, label]) =>
    '<label>' + label + '</label><input name="' + key + '">'
  ).join('');
  setupModeSwitch();
}

function setupModeSwitch() {
  document.querySelectorAll('input[name="borrowMode"]').forEach(radio => {
    radio.onchange = () => {
      const mode = document.querySelector('input[name="borrowMode"]:checked').value;
      document.getElementById('singleMode').style.display = mode === 'single' ? '' : 'none';
      document.getElementById('batchMode').style.display = mode === 'batch' ? '' : 'none';
      document.getElementById('submitBtn').textContent = mode === 'single' ? '提交记录' : '创建借用批次';
    };
  });
  document.getElementById('selectAllBtn').onclick = () => {
    items.forEach(item => {
      if (item.status === '可借用') {
        selectedItemIds.add(item.id || item.code);
      }
    });
    renderMultiSelect();
  };
  document.getElementById('clearSelectionBtn').onclick = () => {
    selectedItemIds.clear();
    renderMultiSelect();
  };
}

function renderMultiSelect() {
  const panel = document.getElementById('multiSelectPanel');
  const available = items.filter(i => i.status === '可借用');
  const borrowed = items.filter(i => i.status === '已借出' || i.status === '待归还');
  const other = items.filter(i => i.status !== '可借用' && i.status !== '已借出' && i.status !== '待归还');

  let html = '';
  if (available.length === 0) {
    html += '<div class="meta" style="padding:12px;color:#888">暂无可借用的道具</div>';
  } else {
    html += available.map(item => {
      const id = item.id || item.code;
      const checked = selectedItemIds.has(id) ? 'checked' : '';
      return `
        <label class="multi-item ${checked ? 'selected' : ''}">
          <input type="checkbox" data-id="${id}" ${checked}>
          <span class="multi-item-code">${item.code || id}</span>
          <span class="multi-item-name">${item.name || ''}</span>
          <span class="pill small">${item.status}</span>
        </label>
      `;
    }).join('');
  }
  if (borrowed.length > 0) {
    html += '<h4 style="margin:12px 0 8px;color:#888">已借出（不可选）</h4>';
    html += borrowed.map(item => {
      const id = item.id || item.code;
      return `
        <label class="multi-item disabled">
          <input type="checkbox" disabled>
          <span class="multi-item-code">${item.code || id}</span>
          <span class="multi-item-name">${item.name || ''}</span>
          <span class="pill small warn">${item.status}</span>
        </label>
      `;
    }).join('');
  }
  if (other.length > 0) {
    html += '<h4 style="margin:12px 0 8px;color:#888">其他状态（不可选）</h4>';
    html += other.map(item => {
      const id = item.id || item.code;
      return `
        <label class="multi-item disabled">
          <input type="checkbox" disabled>
          <span class="multi-item-code">${item.code || id}</span>
          <span class="multi-item-name">${item.name || ''}</span>
          <span class="pill small" style="background:#eee;color:#666">${item.status}</span>
        </label>
      `;
    }).join('');
  }
  panel.innerHTML = html;

  panel.querySelectorAll('input[type="checkbox"][data-id]').forEach(cb => {
    cb.onchange = () => {
      const id = cb.dataset.id;
      if (cb.checked) selectedItemIds.add(id);
      else selectedItemIds.delete(id);
      cb.closest('.multi-item').classList.toggle('selected', cb.checked);
      updateSelectedCount();
    };
  });
  updateSelectedCount();
}

function updateSelectedCount() {
  document.getElementById('selectedCount').textContent = selectedItemIds.size;
}

function render() {
  itemSelect.innerHTML = items.map(item =>
    '<option value="' + (item.id || item.code) + '">' + (item.code || item.id) + ' · ' + (item.name || '') + '</option>'
  ).join('');

  const stats = Object.fromEntries(stages.map(s => [s, items.filter(i => i.status === s).length]));
  statsEl.innerHTML = Object.entries(stats).map(([k, v]) =>
    '<div class="stat"><span>' + k + '</span><strong>' + v + '</strong></div>'
  ).join('');

  const status = document.querySelector('#statusFilter').value;
  const q = document.querySelector('#search').value.trim();
  const visible = items.filter(item =>
    (!status || item.status === status) && (!q || JSON.stringify(item).includes(q))
  );
  cards.innerHTML = visible.map(item => cardHtml(item)).join('');

  window._items = items;

  renderMultiSelect();

  document.querySelectorAll('[data-status]').forEach(sel => {
    sel.onchange = async () => {
      await api('/api/items/' + sel.dataset.status, { method: 'PATCH', body: JSON.stringify({ status: sel.value }) });
      await load();
    };
  });
  document.querySelectorAll('[data-note]').forEach(btn => {
    btn.onclick = async () => {
      const id = btn.dataset.note;
      const note = prompt('记录备注');
      if (note) { await api('/api/items/' + id + '/logs', { method: 'POST', body: JSON.stringify({ step: '备注', note }) }); await load(); }
    };
  });

  bindMaintenanceEvents(api, load);
  applyPermissionGuards();
}

let _highlightDone = false;

function triggerInitialHighlight() {
  if (_highlightDone) return;
  const highlightParam = new URLSearchParams(window.location.search).get('highlight');
  if (highlightParam) {
    highlightAndScrollToItem(highlightParam);
  }
}

function highlightAndScrollToItem(identifier) {
  const searchInput = document.querySelector('#search');
  const cleanId = (identifier || '').trim();
  if (!cleanId) return;

  const target = items.find(it => it.id === cleanId || it.code === cleanId);
  if (target) {
    _highlightDone = true;
    searchInput.value = cleanId;
    const targetCode = target.code || target.id;

    const visible = items.filter(item => {
      const status = document.querySelector('#statusFilter').value;
      const q = cleanId;
      return (!status || item.status === status) && (!q || JSON.stringify(item).includes(q));
    });
    cards.innerHTML = visible.map(item => cardHtml(item)).join('');
    document.querySelectorAll('[data-status]').forEach(sel => {
      sel.onchange = async () => {
        await api('/api/items/' + sel.dataset.status, { method: 'PATCH', body: JSON.stringify({ status: sel.value }) });
        await load();
      };
    });
    document.querySelectorAll('[data-note]').forEach(btn => {
      btn.onclick = async () => {
        const id = btn.dataset.note;
        const note = prompt('记录备注');
        if (note) { await api('/api/items/' + id + '/logs', { method: 'POST', body: JSON.stringify({ step: '备注', note }) }); await load(); }
      };
    });
    bindMaintenanceEvents(api, load);
    applyPermissionGuards();

    setTimeout(() => {
      const allCards = document.querySelectorAll('#cards .card');
      let foundCard = null;
      for (const card of allCards) {
        const h3 = card.querySelector('h3');
        if (h3 && h3.textContent.trim() === targetCode) {
          foundCard = card;
          break;
        }
      }
      if (foundCard) {
        foundCard.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
        foundCard.classList.add('card-highlight');
        setTimeout(() => {
          foundCard.classList.add('card-highlight-active');
        }, 100);
        setTimeout(() => {
          foundCard.classList.remove('card-highlight-active');
        }, 3500);
      }
    }, 150);
  }
}

function formatCardDateTime(dateStr) {
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

function getCheckBadgeClass(result) {
  switch (result) {
    case '正常': return 'check-badge-ok';
    case '存放异常': return 'check-badge-warn';
    case '状态异常': return 'check-badge-warn';
    case '需修补': return 'check-badge-danger';
    case '已借出中': return 'check-badge-info';
    default: return '';
  }
}

function cardHtml(item) {
  const main = fields.slice(0, 4).map(([key, label]) =>
    '<div><b>' + label + '</b> ' + (item[key] ?? '') + '</div>'
  ).join('');
  const tasks = (item.tasks || []).map(t =>
    '<div class="meta">任务 ' + t.position + ' · ' + t.status + ' · ' + t.tension + '</div>'
  ).join('');
  const logs = (item.logs || []).slice(-4).map(l =>
    '<div>' + l.step + '：' + l.note + '</div>'
  ).join('');

  const planHtml = renderPlanHtml(item);

  let checkHtml = '';
  if (item.latestCheck) {
    const c = item.latestCheck;
    const badgeClass = getCheckBadgeClass(c.checkResult);
    checkHtml = `
      <div class="card-check-info">
        <span class="meta">最近核验：</span>
        <span class="check-badge-small ${badgeClass}">${c.checkResult}</span>
        <span class="meta">${formatCardDateTime(c.at)}</span>
        ${c.operator ? `<span class="meta">· ${c.operator}</span>` : ''}
        ${c.needRepair ? '<span class="meta" style="color:#c62828">⚠️需修补</span>' : ''}
      </div>
    `;
  } else if (item.checkCount > 0) {
    checkHtml = `<div class="card-check-info meta">核验次数：${item.checkCount}</div>`;
  }

  return '<article class="card"><h3>' + (item.code || item.id) + '</h3><span class="pill">' + item.status + '</span>' +
    main + tasks + checkHtml +
    '<label>状态</label><select data-status="' + (item.id || item.code) + '" data-perm="update_item_status">' +
    stages.map(s => '<option ' + (s === item.status ? 'selected' : '') + '>' + s + '</option>').join('') +
    '</select><button class="secondary" data-note="' + (item.id || item.code) + '" data-perm="add_log">追加备注</button>' +
    '<button class="secondary qr-btn" data-qrcode="' + (item.id || item.code) + '">二维码标签</button>' +
    planHtml +
    '<div class="logs meta">' + (logs || '暂无记录') + '</div></article>';
}

async function load() {
  items = await api('/api/items');
  render();
  triggerInitialHighlight();
  await loadReminders(api, remindersEl);
  initInventory(api, load);
  initReturns(api, load);
  initRepairs(api, load);
}

createForm.onsubmit = async event => {
  event.preventDefault();
  await api('/api/items', { method: 'POST', body: JSON.stringify(Object.fromEntries(new FormData(createForm).entries())) });
  createForm.reset();
  await load();
};

actionForm.onsubmit = async event => {
  event.preventDefault();
  try {
    const mode = document.querySelector('input[name="borrowMode"]:checked').value;
    const formData = Object.fromEntries(new FormData(actionForm).entries());

    if (mode === 'single') {
      if (!formData.id) {
        alert('请选择要借用的道具');
        return;
      }
      await api('/api/items/' + formData.id + '/action', {
        method: 'POST',
        body: JSON.stringify({
          borrower: formData.borrower,
          eventName: formData.eventName,
          dueDate: formData.dueDate
        })
      });
    } else {
      if (selectedItemIds.size === 0) {
        alert('请至少选择一件道具');
        return;
      }
      const batch = await api('/api/batches', {
        method: 'POST',
        body: JSON.stringify({
          itemIds: Array.from(selectedItemIds),
          name: formData.batchName || formData.eventName || '演示活动借用批次',
          eventName: formData.eventName || '演示活动',
          borrower: formData.borrower,
          dueDate: formData.dueDate,
          remark: formData.remark
        })
      });
      if (confirm(`借用批次创建成功！\n批次：${batch.name}\n共 ${batch.totalCount} 件道具\n是否跳转到批次详情页？`)) {
        window.location.href = '/batches/' + batch.id;
        return;
      }
    }
    actionForm.reset();
    selectedItemIds.clear();
    document.querySelector('input[name="borrowMode"][value="single"]').checked = true;
    document.getElementById('singleMode').style.display = '';
    document.getElementById('batchMode').style.display = 'none';
    document.getElementById('submitBtn').textContent = '提交记录';
    await load();
  } catch (e) {
    alert('提交失败：' + e.message);
  }
};

document.querySelector('#statusFilter').onchange = render;
document.querySelector('#search').oninput = render;
document.querySelector('#reload').onclick = load;

renderForms();
initImport(api, load);
initQrCodeFeatures(api, load);
(async () => {
  await initAuth();
  renderLoginStatusBar(document.getElementById("userStatusBar"));
  applyPermissionGuards();
  await load();
})();
