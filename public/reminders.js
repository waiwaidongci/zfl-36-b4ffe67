export async function loadReminders(api, remindersEl) {
  try {
    const data = await api('/api/maintenance/reminders');
    const { overdue, upcoming } = data;
    if (overdue.length === 0 && upcoming.length === 0) {
      remindersEl.innerHTML = '';
      return;
    }
    let html = '<h2>维护提醒</h2><div class="reminder-list">';
    for (const r of overdue) {
      html += `
        <div class="reminder-card overdue">
          <div>
            <strong>${r.code} · ${r.name}</strong>
            <span class="badge overdue-badge">已逾期 ${r.daysOverdue} 天</span>
          </div>
          <div class="detail">计划日期：${r.nextDate} · ${r.type} · ${r.responsible}</div>
        </div>`;
    }
    for (const r of upcoming) {
      html += `
        <div class="reminder-card upcoming">
          <div>
            <strong>${r.code} · ${r.name}</strong>
            <span class="badge upcoming-badge">还剩 ${r.daysLeft} 天</span>
          </div>
          <div class="detail">计划日期：${r.nextDate} · ${r.type} · ${r.responsible}</div>
        </div>`;
    }
    html += '</div>';
    remindersEl.innerHTML = html;
  } catch (e) {
    remindersEl.innerHTML = '';
  }
}
