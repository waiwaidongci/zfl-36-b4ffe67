import { maintenanceTypes } from "./constants.js";

export function renderPlanHtml(item) {
  const plan = item.maintenancePlan;
  const itemId = item.id || item.code;

  if (plan && plan.nextDate) {
    const today = new Date().toISOString().slice(0, 10);
    const isOverdue = plan.nextDate < today;
    return `
      <div class="maintenance-plan">
        <div class="plan-info">
          ${isOverdue ? '<div class="warn">⚠ 已逾期</div>' : ''}
          <div><strong>下次维护：</strong>${plan.nextDate}</div>
          <div><strong>维护类型：</strong>${plan.type || '未设置'}</div>
          <div><strong>负责人：</strong>${plan.responsible || '未设置'}</div>
        </div>
        <button class="complete-btn" data-complete="${itemId}">完成维护</button>
      </div>`;
  } else {
    return `
      <div class="maintenance-plan">
        <div class="plan-info"><div>未设置维护计划</div></div>
        <div class="plan-form">
          <label>下次维护日期</label><input type="date" name="nextDate">
          <div class="plan-row">
            <div>
              <label>维护类型</label>
              <select name="type">
                ${maintenanceTypes.map(t => `<option>${t}</option>`).join('')}
              </select>
            </div>
            <div>
              <label>负责人</label><input name="responsible">
            </div>
          </div>
          <button data-set-plan="${itemId}">设置维护计划</button>
        </div>
      </div>`;
  }
}

export function bindMaintenanceEvents(api, loadCallback) {
  document.querySelectorAll('[data-set-plan]').forEach(btn => {
    btn.onclick = async () => {
      const id = btn.dataset.setPlan;
      const row = btn.closest('.plan-form');
      const nextDate = row.querySelector('[name="nextDate"]').value;
      const type = row.querySelector('[name="type"]').value;
      const responsible = row.querySelector('[name="responsible"]').value;
      if (!nextDate) { alert('请填写下次维护日期'); return; }
      await api('/api/items/' + id + '/maintenance-plan', {
        method: 'PUT',
        body: JSON.stringify({ nextDate, type, responsible })
      });
      await loadCallback();
    };
  });

  document.querySelectorAll('[data-complete]').forEach(btn => {
    btn.onclick = async () => {
      const id = btn.dataset.complete;
      const note = prompt('维护完成备注（可选）');
      if (note === null) return;
      await api('/api/items/' + id + '/complete-maintenance', {
        method: 'POST',
        body: JSON.stringify({ note: note || '维护完成' })
      });
      await loadCallback();
    };
  });
}
