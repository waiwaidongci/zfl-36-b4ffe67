import { initAuth, renderLoginStatusBar, applyPermissionGuards, can } from "./auth.js";

let locationGroups = [];

export function initInventory(api, loadCallback) {
  loadInventoryView(api, loadCallback);
}

async function loadInventoryView(api, loadCallback) {
  try {
    locationGroups = await api('/api/inventory/by-location');
  } catch (e) {
    locationGroups = [];
  }
  renderInventorySection(api, loadCallback);
}

function renderInventorySection(api, loadCallback) {
  const section = document.querySelector('#inventorySection');
  if (!section) return;

  let html = '<h2>存放点盘点</h2>';

  html += '<form id="inventoryForm" class="inventory-form">';
  html += '<div class="inv-form-row">';
  html += '<div><label>存放点</label><select name="location" id="invLocation">';
  for (const g of locationGroups) {
    html += '<option value="' + escapeAttr(g.location) + '">' + escapeHtml(g.location) + '（' + g.items.length + '件）</option>';
  }
  html += '</select></div>';
  html += '<div><label>盘点日期</label><input type="date" name="date" id="invDate"></div>';
  html += '<div><label>盘点人</label><input name="person" id="invPerson" placeholder="盘点人姓名"></div>';
  html += '</div>';
  html += '<label>异常说明</label><textarea name="notes" id="invNotes" placeholder="如无异常可留空"></textarea>';
  html += '<button type="submit" data-perm="create_inventory">提交盘点记录</button>';
  html += '</form>';

  html += '<div class="inventory-groups">';
  for (const group of locationGroups) {
    const lastInv = group.lastInventory;
    html += '<div class="inv-group" data-location="' + escapeAttr(group.location) + '">';
    html += '<div class="inv-group-header">';
    html += '<h3>' + escapeHtml(group.location) + '</h3>';
    html += '<span class="inv-count">' + group.items.length + '件道具</span>';
    if (lastInv) {
      const hasNotes = lastInv.notes && lastInv.notes.trim();
      html += '<span class="inv-last' + (hasNotes ? ' has-notes' : '') + '">';
      html += '上次盘点：' + lastInv.date + ' · ' + escapeHtml(lastInv.person);
      if (hasNotes) html += ' · <span class="inv-warn">⚠ ' + escapeHtml(lastInv.notes) + '</span>';
      html += '</span>';
    } else {
      html += '<span class="inv-last no-inv">尚未盘点</span>';
    }
    html += '</div>';

    html += '<div class="inv-items">';
    for (const item of group.items) {
      html += '<div class="inv-item">';
      html += '<span class="inv-item-code">' + escapeHtml(item.code || item.id) + '</span>';
      html += '<span class="inv-item-name">' + escapeHtml(item.name || '') + '</span>';
      html += '<span class="pill">' + escapeHtml(item.status || '') + '</span>';
      if (item.wear) html += '<span class="inv-item-wear meta">' + escapeHtml(item.wear) + '</span>';
      html += '</div>';
    }
    html += '</div>';

    html += '<button class="secondary inv-history-btn" data-inv-loc="' + escapeAttr(group.location) + '">查看盘点历史</button>';
    html += '<div class="inv-history" id="invHistory_' + cssSafe(group.location) + '" style="display:none"></div>';

    html += '</div>';
  }
  html += '</div>';

  section.innerHTML = html;

  const form = document.querySelector('#inventoryForm');
  if (form) {
    form.onsubmit = async (e) => {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(form).entries());
      if (!data.location || !data.date || !data.person) {
        alert('存放点、盘点日期和盘点人为必填');
        return;
      }
      try {
        await api('/api/inventory', { method: 'POST', body: JSON.stringify(data) });
        form.reset();
        await loadInventoryView(api, loadCallback);
      } catch (err) {
        alert('提交失败：' + err.message);
      }
    };
  }

  document.querySelectorAll('.inv-history-btn').forEach(btn => {
    btn.onclick = async () => {
      const loc = btn.dataset.invLoc;
      const historyEl = document.querySelector('#invHistory_' + cssSafe(loc));
      if (!historyEl) return;
      if (historyEl.style.display !== 'none') {
        historyEl.style.display = 'none';
        btn.textContent = '查看盘点历史';
        return;
      }
      try {
        const records = await api('/api/inventory/location/' + encodeURIComponent(loc));
        if (records.length === 0) {
          historyEl.innerHTML = '<div class="meta" style="padding:8px">暂无盘点记录</div>';
        } else {
          let rh = '<div class="inv-history-list">';
          for (const r of records) {
            rh += '<div class="inv-history-item">';
            rh += '<div class="inv-history-row"><strong>' + escapeHtml(r.date) + '</strong> · ' + escapeHtml(r.person);
            rh += ' <button class="inv-del-btn" data-del="' + r.id + '" data-perm="delete_inventory">删除</button>';
            rh += '</div>';
            if (r.notes) rh += '<div class="inv-history-notes">' + escapeHtml(r.notes) + '</div>';
            rh += '</div>';
          }
          rh += '</div>';
          historyEl.innerHTML = rh;
        }
        historyEl.style.display = 'block';
        btn.textContent = '收起盘点历史';

        historyEl.querySelectorAll('.inv-del-btn').forEach(delBtn => {
          delBtn.onclick = async () => {
            if (!confirm('确认删除此盘点记录？')) return;
            try {
              await api('/api/inventory/' + delBtn.dataset.del, { method: 'DELETE' });
              await loadInventoryView(api, loadCallback);
            } catch (err) {
              alert('删除失败：' + err.message);
            }
          };
        });
        applyPermissionGuards();
      } catch (err) {
        historyEl.innerHTML = '<div class="warn">加载失败</div>';
        historyEl.style.display = 'block';
      }
    };
  });
  applyPermissionGuards();
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text == null ? '' : String(text);
  return div.innerHTML;
}

function escapeAttr(text) {
  return String(text || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function cssSafe(text) {
  return String(text || '').replace(/[^a-zA-Z0-9\u4e00-\u9fff]/g, '_');
}
