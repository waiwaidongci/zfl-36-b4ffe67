import { repairOrderStatuses, repairAcceptanceResults } from "./constants.js";
import { initAuth, renderLoginStatusBar, applyPermissionGuards, can } from "./auth.js";

export function initRepairs(api, loadCallback) {
  loadRepairView(api, loadCallback);
}

let repairOrders = [];
let items = [];

async function loadRepairView(api, loadCallback) {
  try {
    [repairOrders, items] = await Promise.all([
      api("/api/repair-orders"),
      api("/api/items")
    ]);
  } catch (e) {
    repairOrders = [];
    items = [];
  }
  renderRepairSection(api, loadCallback);
}

function renderRepairSection(api, loadCallback) {
  const section = document.querySelector("#repairPanel");
  if (!section) return;

  const needRepairItems = items.filter(i => i.status === "需修补");
  const stats = computeRepairStats(repairOrders);

  let html = '<h2>修补工单管理</h2>';

  html += '<div class="repair-stats">';
  for (const [status, count] of Object.entries(stats)) {
    html += '<div class="repair-stat"><span>' + escapeHtml(status) + '</span><strong>' + count + '</strong></div>';
  }
  html += '</div>';

  html += '<div class="repair-create-section">';
  html += '<h3>创建新工单</h3>';
  if (needRepairItems.length === 0) {
    html += '<div class="meta">暂无需要修补的道具</div>';
  } else {
    html += '<form id="repairCreateForm" class="repair-form">';
    html += '<label>选择需修补道具</label>';
    html += '<select name="itemId" id="repairItemSelect" required>';
    html += '<option value="">请选择道具</option>';
    for (const item of needRepairItems) {
      html += '<option value="' + escapeAttr(item.id || item.code) + '">' +
        escapeHtml(item.code) + ' · ' + escapeHtml(item.name) +
        (item.wear ? '（磨损：' + escapeHtml(item.wear) + '）' : '') + '</option>';
    }
    html += '</select>';
    html += '<label>问题描述</label>';
    html += '<textarea name="problemDescription" id="repairProblem" placeholder="详细描述需要修补的问题"></textarea>';
    html += '<label>处理人</label>';
    html += '<input name="handler" id="repairHandler" placeholder="负责修补的人员姓名">';
    html += '<button type="submit" data-perm="create_repair_order">创建修补工单</button>';
    html += '</form>';
  }
  html += '</div>';

  html += '<div class="repair-list-section" style="margin-top:18px;">';
  html += '<h3>工单列表</h3>';
  if (repairOrders.length === 0) {
    html += '<div class="meta">暂无修补工单</div>';
  } else {
    html += '<div class="repair-toolbar">';
    html += '<select id="repairStatusFilter"><option value="">全部状态</option>';
    for (const s of repairOrderStatuses) {
      html += '<option value="' + escapeAttr(s) + '">' + escapeHtml(s) + '</option>';
    }
    html += '</select>';
    html += '</div>';
    html += '<div class="repair-orders" id="repairOrdersList">';
    html += renderRepairOrdersList(repairOrders, "");
    html += '</div>';
  }
  html += '</div>';

  html += '<div id="repairDetailModal" class="repair-modal" style="display:none;"></div>';

  section.innerHTML = html;

  const createForm = document.querySelector("#repairCreateForm");
  if (createForm) {
    createForm.onsubmit = async (e) => {
      e.preventDefault();
      const formData = new FormData(createForm);
      const itemId = formData.get("itemId");
      if (!itemId) { alert("请选择需要修补的道具"); return; }
      const payload = {
        itemId,
        problemDescription: formData.get("problemDescription") || "",
        handler: formData.get("handler") || ""
      };
      try {
        await api("/api/repair-orders", { method: "POST", body: JSON.stringify(payload) });
        alert("修补工单创建成功！");
        createForm.reset();
        await loadRepairView(api, loadCallback);
        await loadCallback();
      } catch (err) {
        alert("创建失败：" + err.message);
      }
    };
  }

  const statusFilter = document.querySelector("#repairStatusFilter");
  if (statusFilter) {
    statusFilter.onchange = () => {
      const listEl = document.querySelector("#repairOrdersList");
      if (listEl) {
        listEl.innerHTML = renderRepairOrdersList(repairOrders, statusFilter.value);
        bindRepairOrderEvents(api, loadCallback);
        applyPermissionGuards();
      }
    };
  }

  bindRepairOrderEvents(api, loadCallback);
  applyPermissionGuards();
}

function computeRepairStats(orders) {
  const stats = {};
  for (const s of repairOrderStatuses) stats[s] = 0;
  for (const o of orders) {
    if (stats[o.status] !== undefined) stats[o.status] += 1;
  }
  return stats;
}

function renderRepairOrdersList(orders, filterStatus) {
  const visible = filterStatus ? orders.filter(o => o.status === filterStatus) : orders;
  if (visible.length === 0) {
    return '<div class="meta">暂无符合条件的工单</div>';
  }
  return visible.map(o => renderRepairOrderCard(o)).join("");
}

function renderRepairOrderCard(order) {
  const pillClass = order.status === "已完成" || order.status === "已验收"
    ? "pill-ok"
    : (order.status === "处理中" ? "pill-warn" : "");

  return `
    <div class="repair-order-card" data-order-id="${escapeAttr(order.id)}">
      <div class="repair-order-header">
        <div>
          <strong>${escapeHtml(order.itemCode || order.itemId)} · ${escapeHtml(order.itemName || "")}</strong>
          <span class="pill ${pillClass}" style="margin-left:8px;">${escapeHtml(order.status)}</span>
        </div>
        <div class="meta">创建：${escapeHtml(formatDate(order.createdAt))}</div>
      </div>
      <div class="repair-order-body">
        ${order.problemDescription ? '<div><strong>问题：</strong>' + escapeHtml(order.problemDescription) + '</div>' : ''}
        ${order.handler ? '<div class="meta"><strong>处理人：</strong>' + escapeHtml(order.handler) + '</div>' : ''}
        ${order.completionDate ? '<div class="meta"><strong>完成日期：</strong>' + escapeHtml(order.completionDate) + '</div>' : ''}
        ${order.acceptanceResult ? '<div class="meta"><strong>验收：</strong>' + escapeHtml(order.acceptanceResult) + '</div>' : ''}
      </div>
      <div class="repair-order-actions">
        <button class="secondary" data-view-order="${escapeAttr(order.id)}">查看详情</button>
        ${(order.status !== "已完成" && order.status !== "已验收") ?
          '<button data-complete-order="' + escapeAttr(order.id) + '" data-perm="complete_repair_order">完成工单</button>' : ''}
        <button class="secondary" data-delete-order="${escapeAttr(order.id)}" style="background:#9b4937;" data-perm="delete_repair_order">删除</button>
      </div>
    </div>`;
}

function renderRepairOrderDetail(order) {
  const logs = (order.logs || []).slice().reverse();
  const pillClass = order.status === "已完成" || order.status === "已验收"
    ? "pill-ok"
    : (order.status === "处理中" ? "pill-warn" : "");

  let html = '<div class="repair-modal-content">';
  html += '<div class="repair-modal-header">';
  html += '<h3>工单详情</h3>';
  html += '<button class="secondary" id="closeRepairModal">关闭</button>';
  html += '</div>';

  html += '<div class="repair-detail-section">';
  html += '<div><strong>道具：</strong>' + escapeHtml(order.itemCode || order.itemId) + ' · ' + escapeHtml(order.itemName || "") +
    ' <span class="pill ' + pillClass + '" style="margin-left:8px;">' + escapeHtml(order.status) + '</span></div>';
  html += '<div class="meta">工单编号：' + escapeHtml(order.id) + ' · 创建时间：' + escapeHtml(formatDate(order.createdAt)) + '</div>';
  html += '</div>';

  html += '<div class="repair-detail-section">';
  html += '<h4>工单信息</h4>';
  html += '<div class="repair-detail-grid">';
  html += '<div><label>问题描述</label><div>' + (order.problemDescription ? escapeHtml(order.problemDescription) : '<span class="meta">未填写</span>') + '</div></div>';
  html += '<div><label>处理人</label><div>' + (order.handler ? escapeHtml(order.handler) : '<span class="meta">未分配</span>') + '</div></div>';
  html += '<div><label>处理步骤</label><div>' + (order.processingSteps ? escapeHtml(order.processingSteps) : '<span class="meta">未填写</span>') + '</div></div>';
  html += '<div><label>材料消耗</label><div>' + (order.materialConsumption ? escapeHtml(order.materialConsumption) : '<span class="meta">未填写</span>') + '</div></div>';
  html += '<div><label>完成日期</label><div>' + (order.completionDate ? escapeHtml(order.completionDate) : '<span class="meta">未完成</span>') + '</div></div>';
  html += '<div><label>验收结果</label><div>' + (order.acceptanceResult ? escapeHtml(order.acceptanceResult) : '<span class="meta">未验收</span>') + '</div></div>';
  html += '</div>';
  html += '</div>';

  if (order.status !== "已完成" && order.status !== "已验收") {
    html += '<div class="repair-detail-section">';
    html += '<h4>更新状态</h4>';
    html += '<form id="repairStatusForm" class="repair-form">';
    html += '<label>工单状态</label>';
    html += '<select name="status" id="updateRepairStatus">';
    for (const s of repairOrderStatuses) {
      html += '<option value="' + escapeAttr(s) + '"' + (s === order.status ? ' selected' : '') + '>' + escapeHtml(s) + '</option>';
    }
    html += '</select>';
    html += '<button type="submit" data-perm="update_repair_order">更新状态</button>';
    html += '</form>';
    html += '</div>';

    html += '<div class="repair-detail-section">';
    html += '<h4>完成工单</h4>';
    html += '<form id="repairCompleteForm" class="repair-form">';
    html += '<label>处理步骤</label>';
    html += '<textarea name="processingSteps" placeholder="详细描述修补处理步骤">' + escapeHtml(order.processingSteps || "") + '</textarea>';
    html += '<label>材料消耗</label>';
    html += '<textarea name="materialConsumption" placeholder="记录使用的材料和数量">' + escapeHtml(order.materialConsumption || "") + '</textarea>';
    html += '<label>完成日期</label>';
    html += '<input type="date" name="completionDate" value="' + new Date().toISOString().slice(0, 10) + '">';
    html += '<label>验收结果</label>';
    html += '<select name="acceptanceResult">';
    html += '<option value="">请选择</option>';
    for (const r of repairAcceptanceResults) {
      html += '<option value="' + escapeAttr(r) + '">' + escapeHtml(r) + '</option>';
    }
    html += '</select>';
    html += '<button type="submit" data-perm="complete_repair_order">确认完成</button>';
    html += '</form>';
    html += '</div>';
  }

  html += '<div class="repair-detail-section">';
  html += '<h4>操作日志</h4>';
  if (logs.length === 0) {
    html += '<div class="meta">暂无日志</div>';
  } else {
    html += '<div class="repair-logs">';
    for (const log of logs) {
      html += '<div class="repair-log-item">';
      html += '<div class="repair-log-header"><strong>' + escapeHtml(log.step) + '</strong><span class="meta">' + escapeHtml(formatDate(log.at)) + '</span></div>';
      html += '<div>' + escapeHtml(log.note || "") + '</div>';
      html += '</div>';
    }
    html += '</div>';
  }
  html += '</div>';

  html += '</div>';
  return html;
}

function bindRepairOrderEvents(api, loadCallback) {
  document.querySelectorAll('[data-view-order]').forEach(btn => {
    btn.onclick = async () => {
      const orderId = btn.dataset.viewOrder;
      try {
        const order = await api("/api/repair-orders/" + orderId);
        showRepairModal(order, api, loadCallback);
      } catch (e) {
        alert("加载工单详情失败：" + e.message);
      }
    };
  });

  document.querySelectorAll('[data-complete-order]').forEach(btn => {
    btn.onclick = async () => {
      const orderId = btn.dataset.completeOrder;
      try {
        const order = await api("/api/repair-orders/" + orderId);
        showRepairModal(order, api, loadCallback);
      } catch (e) {
        alert("加载工单详情失败：" + e.message);
      }
    };
  });

  document.querySelectorAll('[data-delete-order]').forEach(btn => {
    btn.onclick = async () => {
      if (!confirm("确认删除此修补工单？此操作不可恢复。")) return;
      const orderId = btn.dataset.deleteOrder;
      try {
        await api("/api/repair-orders/" + orderId, { method: "DELETE" });
        await loadRepairView(api, loadCallback);
        await loadCallback();
      } catch (e) {
        alert("删除失败：" + e.message);
      }
    };
  });
}

function showRepairModal(order, api, loadCallback) {
  const modal = document.querySelector("#repairDetailModal");
  if (!modal) return;
  modal.innerHTML = renderRepairOrderDetail(order);
  modal.style.display = "block";
  applyPermissionGuards();

  const closeBtn = document.querySelector("#closeRepairModal");
  if (closeBtn) {
    closeBtn.onclick = () => {
      modal.style.display = "none";
    };
  }

  modal.onclick = (e) => {
    if (e.target === modal) {
      modal.style.display = "none";
    }
  };

  const statusForm = document.querySelector("#repairStatusForm");
  if (statusForm) {
    statusForm.onsubmit = async (e) => {
      e.preventDefault();
      const status = document.querySelector("#updateRepairStatus").value;
      if (!status) return;
      try {
        await api("/api/repair-orders/" + order.id, {
          method: "PATCH",
          body: JSON.stringify({ status })
        });
        alert("状态更新成功！");
        const updated = await api("/api/repair-orders/" + order.id);
        modal.innerHTML = renderRepairOrderDetail(updated);
        applyPermissionGuards();
        await loadRepairView(api, loadCallback);
        await loadCallback();
      } catch (err) {
        alert("更新失败：" + err.message);
      }
    };
  }

  const completeForm = document.querySelector("#repairCompleteForm");
  if (completeForm) {
    completeForm.onsubmit = async (e) => {
      e.preventDefault();
      const formData = new FormData(completeForm);
      const processingSteps = formData.get("processingSteps") || "";
      const acceptanceResult = formData.get("acceptanceResult");
      if (!processingSteps.trim()) { alert("请填写处理步骤"); return; }
      if (!acceptanceResult) { alert("请选择验收结果"); return; }
      const payload = {
        processingSteps,
        materialConsumption: formData.get("materialConsumption") || "",
        completionDate: formData.get("completionDate") || new Date().toISOString().slice(0, 10),
        acceptanceResult
      };
      if (!confirm("确认完成此修补工单？完成后将自动更新道具状态并追加维护日志。")) return;
      try {
        const result = await api("/api/repair-orders/" + order.id + "/complete", {
          method: "POST",
          body: JSON.stringify(payload)
        });
        const newItemStatus = result.item && result.item.status ? result.item.status : (acceptanceResult === "不合格" ? "需修补" : "可借用");
        alert("工单完成成功！道具状态已更新为：" + newItemStatus);
        modal.style.display = "none";
        await loadRepairView(api, loadCallback);
        await loadCallback();
      } catch (err) {
        alert("完成失败：" + err.message);
      }
    };
  }
}

function formatDate(iso) {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    return d.toISOString().slice(0, 10) + " " + d.toTimeString().slice(0, 5);
  } catch {
    return iso;
  }
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text == null ? "" : String(text);
  return div.innerHTML;
}

function escapeAttr(text) {
  return String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
