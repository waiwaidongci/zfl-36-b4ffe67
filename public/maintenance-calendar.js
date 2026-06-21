import { initAuth, renderLoginStatusBar, applyPermissionGuards, can, PERMISSIONS } from "./auth.js";
import { maintenanceTypes } from "./constants.js";

let currentYear = new Date().getFullYear();
let currentMonth = new Date().getMonth() + 1;
let calendarData = { items: [], byDate: {} };
let selectedResponsible = "";
let searchKeyword = "";

async function api(path, options) {
  const res = await fetch(path, options && options.body ? { ...options, headers: { 'Content-Type': 'application/json' } } : options);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || data.message || '请求失败');
  return data;
}

const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];
const STATUS_LABELS = {
  overdue: "已逾期",
  today: "今天",
  soon: "7天内",
  normal: "计划中"
};

function getDaysInMonth(year, month) {
  return new Date(year, month, 0).getDate();
}

function getFirstDayOfMonth(year, month) {
  return new Date(year, month - 1, 1).getDay();
}

function formatDate(y, m, d) {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function isToday(y, m, d) {
  const today = new Date();
  return y === today.getFullYear() && m === today.getMonth() + 1 && d === today.getDate();
}

function getFilteredItems() {
  let items = calendarData.items || [];
  if (selectedResponsible) {
    items = items.filter(it => it.responsible === selectedResponsible);
  }
  if (searchKeyword) {
    const kw = searchKeyword.toLowerCase();
    items = items.filter(it =>
      (it.code || "").toLowerCase().includes(kw) ||
      (it.name || "").toLowerCase().includes(kw) ||
      (it.responsible || "").toLowerCase().includes(kw)
    );
  }
  return items;
}

function updateStats() {
  const items = getFilteredItems();
  const overdue = items.filter(i => i.status === "overdue").length;
  const today = items.filter(i => i.status === "today").length;
  const soon = items.filter(i => i.status === "soon").length;
  document.getElementById("overdueCount").textContent = overdue;
  document.getElementById("todayCount").textContent = today;
  document.getElementById("soonCount").textContent = soon;
  document.getElementById("totalCount").textContent = items.length;
}

function updateResponsibleFilter() {
  const allResponsibles = [...new Set((calendarData.items || []).map(i => i.responsible).filter(Boolean))];
  allResponsibles.sort();
  const sel = document.getElementById("responsibleFilter");
  const currentVal = sel.value;
  sel.innerHTML = '<option value="">全部负责人</option>' +
    allResponsibles.map(r => `<option value="${r}">${r}</option>`).join("");
  if (allResponsibles.includes(currentVal)) {
    sel.value = currentVal;
  }
}

function renderCalendarGrid() {
  const grid = document.getElementById("calendarGrid");
  const year = currentYear;
  const month = currentMonth;
  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfMonth(year, month);
  const filteredItems = getFilteredItems();
  const filteredByDate = {};
  for (const it of filteredItems) {
    if (!filteredByDate[it.nextDate]) filteredByDate[it.nextDate] = [];
    filteredByDate[it.nextDate].push(it);
  }

  let html = '<div class="calendar-weekdays">';
  for (const w of WEEKDAYS) {
    html += `<div class="calendar-weekday">${w}</div>`;
  }
  html += '</div><div class="calendar-days">';

  for (let i = 0; i < firstDay; i++) {
    html += '<div class="calendar-day empty"></div>';
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = formatDate(year, month, d);
    const dayItems = filteredByDate[dateStr] || [];
    const today = isToday(year, month, d);
    const hasOverdue = dayItems.some(i => i.status === "overdue");
    const hasSoon = dayItems.some(i => i.status === "soon");
    const hasToday = dayItems.some(i => i.status === "today");

    let dayClass = "calendar-day";
    if (today) dayClass += " today-cell";
    if (hasOverdue) dayClass += " has-overdue";
    else if (hasToday) dayClass += " has-today";
    else if (hasSoon) dayClass += " has-soon";
    else if (dayItems.length > 0) dayClass += " has-items";

    let itemsHtml = "";
    if (dayItems.length > 0) {
      const preview = dayItems.slice(0, 3);
      itemsHtml = preview.map(it => `
        <div class="cal-item cal-${it.status}" data-item-id="${it.id}" data-item-code="${it.code}" title="${it.code} ${it.name} · ${it.type || '未设置类型'} · ${it.responsible || '未设置负责人'}">
          <span class="cal-item-code">${it.code}</span>
          <span class="cal-item-name">${it.name}</span>
        </div>
      `).join("");
      if (dayItems.length > 3) {
        itemsHtml += `<div class="cal-item-more">+${dayItems.length - 3} 更多</div>`;
      }
    }

    html += `
      <div class="${dayClass}" data-date="${dateStr}">
        <div class="cal-day-num">${d}</div>
        <div class="cal-day-items">${itemsHtml}</div>
      </div>
    `;
  }

  html += '</div>';
  grid.innerHTML = html;

  grid.querySelectorAll(".cal-item").forEach(el => {
    el.onclick = () => {
      const id = el.dataset.itemId;
      const code = el.dataset.itemCode;
      openPlanModal(id || code);
    };
  });
}

function renderMaintenanceList() {
  const list = document.getElementById("maintenanceList");
  const items = getFilteredItems();

  if (items.length === 0) {
    list.innerHTML = '<div class="empty">本月暂无维护计划</div>';
    return;
  }

  const html = items.map(it => {
    const statusClass = `status-${it.status}`;
    const daysLabel = it.status === "overdue"
      ? `逾期 ${Math.abs(it.daysDiff)} 天`
      : it.status === "today"
        ? "今天"
        : it.status === "soon"
          ? `还剩 ${it.daysDiff} 天`
          : `还剩 ${it.daysDiff} 天`;

    return `
      <div class="maint-list-item ${statusClass}">
        <div class="maint-main">
          <div class="maint-title">
            <strong>${it.code}</strong> · ${it.name}
            <span class="pill status-pill ${it.status}">${STATUS_LABELS[it.status]} · ${daysLabel}</span>
          </div>
          <div class="maint-meta">
            <span>📅 ${it.nextDate}</span>
            <span>🔧 ${it.type || '未设置类型'}</span>
            <span>👤 ${it.responsible || '未设置负责人'}</span>
            <span>📦 ${it.itemStatus || '-'}</span>
          </div>
        </div>
        <div class="maint-actions">
          <button class="small secondary" data-view-item="${it.id || it.code}">查看道具</button>
          <button class="small" data-edit-plan="${it.id || it.code}" data-perm="set_maintenance_plan">编辑计划</button>
          <button class="small info" data-complete="${it.id || it.code}" data-perm="complete_maintenance">完成维护</button>
        </div>
      </div>
    `;
  }).join("");

  list.innerHTML = html;

  list.querySelectorAll('[data-view-item]').forEach(btn => {
    btn.onclick = () => {
      const code = btn.dataset.viewItem;
      alert(`跳转到道具卡片：${code}\n\n（当前为演示版，完整版本会跳转至首页并定位该道具卡片）`);
    };
  });

  list.querySelectorAll('[data-edit-plan]').forEach(btn => {
    btn.onclick = () => openPlanModal(btn.dataset.editPlan);
  });

  list.querySelectorAll('[data-complete]').forEach(btn => {
    btn.onclick = async () => {
      const id = btn.dataset.complete;
      const note = prompt('维护完成备注（可选）');
      if (note === null) return;
      try {
        await api('/api/items/' + id + '/complete-maintenance', {
          method: 'POST',
          body: JSON.stringify({ note: note || '维护完成' })
        });
        await loadCalendar();
      } catch (e) {
        alert('操作失败：' + e.message);
      }
    };
  });

  applyPermissionGuards();
}

async function openPlanModal(identifier) {
  const modal = document.getElementById("planModal");
  const modalBody = document.getElementById("planModalBody");
  const modalTitle = document.getElementById("planModalTitle");

  try {
    modal.style.display = "flex";
    modalBody.innerHTML = '<div class="loading">加载中...</div>';

    const allItems = await api('/api/items');
    const item = allItems.find(x => x.id === identifier || x.code === identifier);
    if (!item) {
      modalBody.innerHTML = '<div class="error">未找到道具</div>';
      return;
    }

    modalTitle.textContent = `${item.code} · ${item.name} - 维护计划`;

    const plan = item.maintenancePlan || {};
    const canEdit = can(PERMISSIONS.SET_MAINTENANCE_PLAN);

    modalBody.innerHTML = `
      <div class="info-grid" style="margin-bottom:16px">
        <div class="info-item">
          <span class="info-label">道具状态</span>
          <span class="info-value">${item.status || '-'}</span>
        </div>
        <div class="info-item">
          <span class="info-label">最近维护</span>
          <span class="info-value">${item.lastMaintenance || '-'}</span>
        </div>
      </div>

      <div class="plan-form">
        <label>下次维护日期</label>
        <input type="date" name="nextDate" value="${plan.nextDate || ''}" ${canEdit ? '' : 'disabled'}>
        <div class="plan-row">
          <div>
            <label>维护类型</label>
            <select name="type" ${canEdit ? '' : 'disabled'}>
              <option value="">未设置</option>
              ${maintenanceTypes.map(t => `<option ${plan.type === t ? 'selected' : ''}>${t}</option>`).join('')}
            </select>
          </div>
          <div>
            <label>负责人</label>
            <input name="responsible" value="${plan.responsible || ''}" ${canEdit ? '' : 'disabled'}>
          </div>
        </div>
      </div>

      <div class="modal-footer">
        <button type="button" class="secondary" id="planModalCancel">关闭</button>
        ${canEdit ? '<button type="button" id="savePlanBtn">保存计划</button>' : ''}
      </div>
    `;

    document.getElementById("planModalCancel").onclick = () => {
      modal.style.display = "none";
    };

    const saveBtn = document.getElementById("savePlanBtn");
    if (saveBtn) {
      saveBtn.onclick = async () => {
        const nextDate = modalBody.querySelector('[name="nextDate"]').value;
        const type = modalBody.querySelector('[name="type"]').value;
        const responsible = modalBody.querySelector('[name="responsible"]').value;
        if (!nextDate) {
          alert('请填写下次维护日期');
          return;
        }
        try {
          await api('/api/items/' + identifier + '/maintenance-plan', {
            method: 'PUT',
            body: JSON.stringify({ nextDate, type, responsible })
          });
          modal.style.display = "none";
          await loadCalendar();
        } catch (e) {
          alert('保存失败：' + e.message);
        }
      };
    }
  } catch (e) {
    modalBody.innerHTML = '<div class="error">加载失败：' + e.message + '</div>';
  }
}

async function loadCalendar() {
  document.getElementById("monthTitle").textContent = `${currentYear}年${currentMonth}月`;
  const grid = document.getElementById("calendarGrid");
  const list = document.getElementById("maintenanceList");
  grid.innerHTML = '<div class="loading">加载中...</div>';
  list.innerHTML = '<div class="loading">加载中...</div>';

  try {
    calendarData = await api(`/api/maintenance/calendar?year=${currentYear}&month=${currentMonth}`);
    updateResponsibleFilter();
    updateStats();
    renderCalendarGrid();
    renderMaintenanceList();
  } catch (e) {
    grid.innerHTML = `<div class="error">加载失败：${e.message}</div>`;
    list.innerHTML = `<div class="error">加载失败：${e.message}</div>`;
  }
}

function goPrevMonth() {
  currentMonth--;
  if (currentMonth < 1) {
    currentMonth = 12;
    currentYear--;
  }
  loadCalendar();
}

function goNextMonth() {
  currentMonth++;
  if (currentMonth > 12) {
    currentMonth = 1;
    currentYear++;
  }
  loadCalendar();
}

function goToday() {
  const now = new Date();
  currentYear = now.getFullYear();
  currentMonth = now.getMonth() + 1;
  loadCalendar();
}

document.getElementById("prevMonthBtn").onclick = goPrevMonth;
document.getElementById("nextMonthBtn").onclick = goNextMonth;
document.getElementById("todayBtn").onclick = goToday;
document.getElementById("reloadBtn").onclick = loadCalendar;

document.getElementById("responsibleFilter").onchange = (e) => {
  selectedResponsible = e.target.value;
  updateStats();
  renderCalendarGrid();
  renderMaintenanceList();
};

document.getElementById("listSearch").oninput = (e) => {
  searchKeyword = e.target.value.trim();
  updateStats();
  renderCalendarGrid();
  renderMaintenanceList();
};

document.getElementById("planModalClose").onclick = () => {
  document.getElementById("planModal").style.display = "none";
};

document.getElementById("planModal").onclick = (e) => {
  if (e.target.id === "planModal") {
    document.getElementById("planModal").style.display = "none";
  }
};

(async () => {
  await initAuth();
  renderLoginStatusBar(document.getElementById("userStatusBar"));
  applyPermissionGuards();
  await loadCalendar();
})();
