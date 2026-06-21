import { applyPermissionGuards } from "./auth.js";

export const returnFields = [
  ["returner", "归还人", "text"],
  ["returnDate", "实际归还日期", "date"],
  ["wearChange", "磨损变化", "text"],
  ["needRepair", "是否需要修补", "checkbox"]
];

export function renderReturnFormHtml(borrowedItems) {
  const today = new Date().toISOString().slice(0, 10);
  const options = borrowedItems.length
    ? borrowedItems.map(item =>
        `<option value="${item.id}">${item.code} · ${item.name}（借用人：${item.borrower || "未填写"}）</option>`
      ).join("")
    : `<option value="">暂无可归还道具</option>`;

  return `
    <div class="panel return-section">
      <h2>归还登记</h2>
      <form id="returnForm">
        <label>选择归还道具</label>
        <select name="itemId" id="returnItemSelect" ${borrowedItems.length ? "" : "disabled"}>
          ${options}
        </select>
        <div id="borrowedInfo" class="meta borrowed-info" style="display:none;margin:8px 0;padding:8px;background:#f8f9f6;border-radius:6px;"></div>
        <label>归还人</label>
        <input name="returner" type="text" placeholder="请输入归还人姓名" required>
        <label>实际归还日期</label>
        <input name="returnDate" type="date" value="${today}" required>
        <label>磨损变化</label>
        <input name="wearChange" type="text" placeholder="如：无明显变化 / 新增划痕 / 网眼破损等">
        <label class="checkbox-label">
          <input type="checkbox" name="needRepair">
          <span>需要修补（勾选后状态将变为"需修补"）</span>
        </label>
        <button type="submit" ${borrowedItems.length ? "" : "disabled"} data-perm="return_item">提交归还</button>
      </form>
      <div id="returnHistory" class="return-history" style="margin-top:16px;"></div>
    </div>`;
}

export function renderReturnHistoryHtml(returnList) {
  if (!returnList || returnList.length === 0) {
    return `
      <h3 style="margin-top:16px;">归还记录</h3>
      <div class="meta">暂无归还记录</div>`;
  }

  const rows = returnList.slice(0, 10).map(r => `
    <div class="return-record">
      <div class="return-record-header">
        <strong>${r.itemCode} · ${r.itemName}</strong>
        <span class="pill ${r.needRepair ? "pill-warn" : "pill-ok"}">
          ${r.needRepair ? "需修补" : "可借用"}
        </span>
      </div>
      <div class="meta">
        归还人：${r.returner || "未填写"} · 归还日期：${r.returnDate}
        ${r.wearChange ? ` · 磨损：${r.wearChange}` : ""}
      </div>
    </div>
  `).join("");

  return `
    <h3 style="margin-top:16px;">归还记录（最近${Math.min(10, returnList.length)}条）</h3>
    <div class="return-records">${rows}</div>`;
}

export async function initReturns(api, loadCallback) {
  const returnPanel = document.querySelector("#returnPanel");
  if (!returnPanel) return;

  async function refreshReturnPanel() {
    try {
      const [borrowed, returns] = await Promise.all([
        api("/api/returns/borrowed"),
        api("/api/returns")
      ]);
      returnPanel.innerHTML = renderReturnFormHtml(borrowed) + `
        <div style="margin-top:16px;">${renderReturnHistoryHtml(returns).replace(/^<h3[^>]*>.*?<\/h3>/, "")}</div>
      `;
      bindReturnEvents(api, loadCallback, refreshReturnPanel, borrowed);
      applyPermissionGuards();
    } catch (e) {
      console.error("加载归还数据失败", e);
    }
  }

  await refreshReturnPanel();
}

function bindReturnEvents(api, loadCallback, refreshReturnPanel, borrowedItems) {
  const form = document.querySelector("#returnForm");
  const itemSelect = document.querySelector("#returnItemSelect");
  const infoEl = document.querySelector("#borrowedInfo");

  if (itemSelect && infoEl && borrowedItems) {
    itemSelect.onchange = () => {
      const selected = borrowedItems.find(b => b.id === itemSelect.value);
      if (selected) {
        infoEl.style.display = "block";
        infoEl.innerHTML = `
          <strong>借用信息：</strong><br>
          演示活动：${selected.eventName || "未填写"}<br>
          借用人：${selected.borrower || "未填写"}<br>
          预计归还：${selected.dueDate || "未设置"}
        `;
      } else {
        infoEl.style.display = "none";
      }
    };
  }

  if (form) {
    form.onsubmit = async event => {
      event.preventDefault();
      const formData = new FormData(form);
      const itemId = formData.get("itemId");
      if (!itemId) { alert("请选择要归还的道具"); return; }

      const payload = {
        returner: formData.get("returner") || "",
        returnDate: formData.get("returnDate") || new Date().toISOString().slice(0, 10),
        wearChange: formData.get("wearChange") || "",
        needRepair: formData.get("needRepair") === "on"
      };

      try {
        const result = await api("/api/items/" + itemId + "/return", {
          method: "POST",
          body: JSON.stringify(payload)
        });
        alert(`归还成功！道具状态已更新为：${result.item.status}`);
        form.reset();
        if (infoEl) infoEl.style.display = "none";
        await refreshReturnPanel();
        await loadCallback();
      } catch (e) {
        alert("归还失败：" + e.message);
      }
    };
  }
}
