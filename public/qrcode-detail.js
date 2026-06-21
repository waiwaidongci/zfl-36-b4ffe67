function getIdentifierFromUrl() {
  const path = window.location.pathname;
  const match = path.match(/^\/qrcode\/([^/]+)$/);
  return match ? match[1] : null;
}

async function loadItemDetail() {
  const identifier = getIdentifierFromUrl();
  if (!identifier) {
    showError('无效的道具标识');
    return;
  }

  try {
    const res = await fetch('/api/qrcode/' + encodeURIComponent(identifier));
    if (!res.ok) {
      if (res.status === 404) {
        showError('未找到该道具');
      } else {
        showError('加载失败，请稍后重试');
      }
      return;
    }
    const item = await res.json();
    renderItemDetail(item);
  } catch (e) {
    showError('网络错误，请稍后重试');
  }
}

function showError(message) {
  document.getElementById('qrcodeDetailContent').innerHTML =
    '<div class="error-box"><div class="error-icon">!</div><div class="error-text">' + message + '</div></div>';
}

function formatDate(dateStr) {
  if (!dateStr) return '-';
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString('zh-CN');
  } catch {
    return dateStr;
  }
}

function getStatusClass(status) {
  switch (status) {
    case '可借用': return 'status-ok';
    case '已借出': return 'status-borrowed';
    case '待归还': return 'status-pending';
    case '需修补': return 'status-warn';
    default: return '';
  }
}

function renderItemDetail(item) {
  const content = document.getElementById('qrcodeDetailContent');
  const statusClass = getStatusClass(item.status);

  let borrowingHtml = '';
  if (item.currentBorrowing) {
    borrowingHtml = `
      <div class="detail-section borrowed-section">
        <h3>当前借用信息</h3>
        <div class="detail-grid">
          <div class="detail-item">
            <span class="detail-label">借用人</span>
            <span class="detail-value">${item.currentBorrowing.borrower || '-'}</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">演示活动</span>
            <span class="detail-value">${item.currentBorrowing.eventName || '-'}</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">借出时间</span>
            <span class="detail-value">${formatDate(item.currentBorrowing.at)}</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">预计归还</span>
            <span class="detail-value">${item.currentBorrowing.dueDate || '-'}</span>
          </div>
        </div>
      </div>
    `;
  }

  let maintenanceHtml = '';
  if (item.latestMaintenanceLog || item.lastMaintenance) {
    const maintDate = item.latestMaintenanceLog ? formatDate(item.latestMaintenanceLog.at) : item.lastMaintenance;
    const maintNote = item.latestMaintenanceLog ? item.latestMaintenanceLog.note : '';
    maintenanceHtml = `
      <div class="detail-section">
        <h3>最近维护记录</h3>
        <div class="detail-grid">
          <div class="detail-item">
            <span class="detail-label">维护日期</span>
            <span class="detail-value">${maintDate || '-'}</span>
          </div>
          ${maintNote ? `
          <div class="detail-item full-width">
            <span class="detail-label">维护内容</span>
            <span class="detail-value">${maintNote}</span>
          </div>
          ` : ''}
          ${item.maintenancePlan ? `
          <div class="detail-item">
            <span class="detail-label">下次维护</span>
            <span class="detail-value">${item.maintenancePlan.nextDate || '-'}</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">维护类型</span>
            <span class="detail-value">${item.maintenancePlan.type || '-'}</span>
          </div>
          ` : ''}
        </div>
      </div>
    `;
  }

  content.innerHTML = `
    <div class="detail-header">
      <div class="detail-code">${item.code}</div>
      <div class="detail-status ${statusClass}">${item.status}</div>
    </div>
    <div class="detail-name">${item.name}</div>

    <div class="detail-section">
      <h3>基本信息</h3>
      <div class="detail-grid">
        <div class="detail-item">
          <span class="detail-label">存放点</span>
          <span class="detail-value">${item.location || '-'}</span>
        </div>
        <div class="detail-item">
          <span class="detail-label">用途</span>
          <span class="detail-value">${item.purpose || '-'}</span>
        </div>
        <div class="detail-item">
          <span class="detail-label">材质</span>
          <span class="detail-value">${item.material || '-'}</span>
        </div>
        <div class="detail-item">
          <span class="detail-label">磨损情况</span>
          <span class="detail-value">${item.wear || '无'}</span>
        </div>
      </div>
    </div>

    ${maintenanceHtml}
    ${borrowingHtml}
  `;
}

loadItemDetail();
