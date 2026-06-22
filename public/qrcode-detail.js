import { initAuth, isLoggedIn, can, renderLoginStatusBar, applyPermissionGuards, getCurrentUser } from "./auth.js";
import { PERMISSIONS } from "./auth.js";

let currentItem = null;
let pageLoaded = false;

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
    currentItem = item;
    renderItemDetail(item);
  } catch (e) {
    showError('网络错误，请稍后重试');
  }
}

function showError(message) {
  document.getElementById('qrcodeDetailContent').innerHTML =
    '<div class="error-box"><div class="error-icon">!</div><div class="error-text">' + message + '</div></div>';
}

function formatDateTime(dateStr) {
  if (!dateStr) return '-';
  try {
    const date = new Date(dateStr);
    return date.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch {
    return dateStr;
  }
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

function getCheckResultClass(result) {
  switch (result) {
    case '正常': return 'check-ok';
    case '存放异常': return 'check-warn';
    case '状态异常': return 'check-warn';
    case '需修补': return 'check-danger';
    case '已借出中': return 'check-info';
    default: return '';
  }
}

function renderRecentChecks(checks) {
  if (!checks || checks.length === 0) {
    return '<div class="meta" style="padding:8px 0;color:#888">暂无核验记录</div>';
  }
  return checks.map(c => `
    <div class="check-record">
      <div class="check-record-header">
        <span class="check-result-badge ${getCheckResultClass(c.checkResult)}">${c.checkResult}</span>
        <span class="check-time">${formatDateTime(c.at)}</span>
      </div>
      <div class="check-record-body">
        <div class="check-operator">核验人：${c.operator || '-'}</div>
        ${c.actualLocation ? `<div class="check-location">存放点：${c.actualLocation}</div>` : ''}
        ${c.wearNote ? `<div class="check-wear">磨损备注：${c.wearNote}</div>` : ''}
        ${c.needRepair ? `<div class="check-repair" style="color:#c62828">⚠️ 需要修补</div>` : ''}
      </div>
    </div>
  `).join('');
}

function renderItemDetail(item) {
  const content = document.getElementById('qrcodeDetailContent');
  const statusClass = getStatusClass(item.status);
  const loggedIn = isLoggedIn();
  const hasPermission = loggedIn && can(PERMISSIONS.ADD_LOG);

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

  let checkHistoryHtml = '';
  if (item.recentChecks && item.recentChecks.length > 0) {
    checkHistoryHtml = `
      <div class="detail-section">
        <h3>最近核验记录</h3>
        <div class="check-records">
          ${renderRecentChecks(item.recentChecks)}
        </div>
      </div>
    `;
  } else if (hasPermission) {
    checkHistoryHtml = `
      <div class="detail-section">
        <h3>最近核验记录</h3>
        <div class="meta" style="padding:8px 0;color:#888">暂无核验记录，您可以在下方提交首次核验</div>
      </div>
    `;
  }

  let checkFormHtml = '';
  if (hasPermission) {
    checkFormHtml = `
      <div class="detail-section check-form-section">
        <h3>🔍 现场核验</h3>
        <form id="checkForm" class="check-form">
          <div class="form-item">
            <label class="form-label">核验结果 <span class="required">*</span></label>
            <div class="check-result-options">
              <label class="check-option"><input type="radio" name="checkResult" value="正常" checked> ✅ 正常</label>
              <label class="check-option"><input type="radio" name="checkResult" value="存放异常"> ⚠️ 存放异常</label>
              <label class="check-option"><input type="radio" name="checkResult" value="状态异常"> ❓ 状态异常</label>
              <label class="check-option"><input type="radio" name="checkResult" value="需修补"> 🔧 需修补</label>
              <label class="check-option"><input type="radio" name="checkResult" value="已借出中"> 📦 已借出中</label>
            </div>
          </div>
          <div class="form-item">
            <label class="form-label" for="actualLocation">实际存放点</label>
            <input type="text" id="actualLocation" name="actualLocation" placeholder="如与登记一致可留空，当前：${item.location || '未设置'}" value="${item.location || ''}">
          </div>
          <div class="form-item">
            <label class="form-label" for="wearNote">磨损备注</label>
            <textarea id="wearNote" name="wearNote" rows="2" placeholder="描述磨损情况，如与登记一致可留空">${item.wear || ''}</textarea>
          </div>
          <div class="form-item">
            <label class="checkbox-label">
              <input type="checkbox" id="needRepair" name="needRepair">
              <span>需要修补（勾选后将自动更新状态为"需修补"）</span>
            </label>
          </div>
          <div class="form-actions">
            <button type="submit" id="submitCheckBtn" class="primary-btn">提交核验记录</button>
          </div>
          <div id="checkFormMessage" class="form-message" style="display:none"></div>
        </form>
      </div>
    `;
  } else if (loggedIn) {
    checkFormHtml = `
      <div class="detail-section">
        <div class="meta warn" style="padding:12px;background:#fff8e1;border-radius:8px;border-left:4px solid #ffa000">
          ⚠️ 您的账号没有提交核验的权限，请联系管理员
        </div>
      </div>
    `;
  } else {
    checkFormHtml = `
      <div class="detail-section">
        <div class="login-hint-box">
          <div class="login-hint-icon">🔐</div>
          <div class="login-hint-text">
            <div class="login-hint-title">登录后可提交现场核验</div>
            <div class="meta">核验记录会自动写入道具日志，异常情况自动更新状态</div>
          </div>
          <a href="/login?redirect=${encodeURIComponent(window.location.pathname)}" class="login-hint-btn">登录系统</a>
        </div>
      </div>
    `;
  }

  let latestCheckBadge = '';
  if (item.latestCheck) {
    latestCheckBadge = `
      <div class="latest-check-info">
        <span class="meta">上次核验：</span>
        <span class="check-result-badge small ${getCheckResultClass(item.latestCheck.checkResult)}">${item.latestCheck.checkResult}</span>
        <span class="meta">${formatDateTime(item.latestCheck.at)}</span>
        ${item.latestCheck.operator ? `<span class="meta">· ${item.latestCheck.operator}</span>` : ''}
      </div>
    `;
  }

  content.innerHTML = `
    <div class="detail-header">
      <div class="detail-code">${item.code}</div>
      <div class="detail-status ${statusClass}">${item.status}</div>
    </div>
    <div class="detail-name">${item.name}</div>
    ${latestCheckBadge}

    <div class="detail-section">
      <h3>基本信息</h3>
      <div class="detail-grid">
        <div class="detail-item">
          <span class="detail-label">存放点</span>
          <span class="detail-value" id="displayLocation">${item.location || '-'}</span>
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
          <span class="detail-value" id="displayWear">${item.wear || '无'}</span>
        </div>
      </div>
    </div>

    ${maintenanceHtml}
    ${borrowingHtml}
    ${checkHistoryHtml}
    ${checkFormHtml}
  `;

  if (hasPermission) {
    bindCheckForm();
  }
}

function bindCheckForm() {
  const form = document.getElementById('checkForm');
  if (!form) return;

  form.onsubmit = async (e) => {
    e.preventDefault();
    const submitBtn = document.getElementById('submitCheckBtn');
    const messageEl = document.getElementById('checkFormMessage');

    const formData = new FormData(form);
    const checkResult = formData.get('checkResult');
    const actualLocation = formData.get('actualLocation');
    const wearNote = formData.get('wearNote');
    const needRepair = document.getElementById('needRepair').checked;

    if (!checkResult) {
      showMessage(messageEl, '请选择核验结果', 'error');
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = '提交中...';
    messageEl.style.display = 'none';

    try {
      const identifier = getIdentifierFromUrl();
      const res = await fetch(`/api/qrcode/${encodeURIComponent(identifier)}/check`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ checkResult, actualLocation, wearNote, needRepair })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || data.error || '提交失败');
      }

      showMessage(messageEl, '✅ 核验记录提交成功！', 'success');

      if (data.updatedItem) {
        const statusEl = document.querySelector('.detail-status');
        if (statusEl && data.updatedItem.status) {
          statusEl.textContent = data.updatedItem.status;
          statusEl.className = 'detail-status ' + getStatusClass(data.updatedItem.status);
        }
        const locEl = document.getElementById('displayLocation');
        if (locEl && data.updatedItem.location) {
          locEl.textContent = data.updatedItem.location;
        }
        const wearEl = document.getElementById('displayWear');
        if (wearEl && data.updatedItem.wear) {
          wearEl.textContent = data.updatedItem.wear;
        }
      }

      setTimeout(() => {
        loadItemDetail();
      }, 1500);

    } catch (err) {
      showMessage(messageEl, '提交失败：' + err.message, 'error');
      submitBtn.disabled = false;
      submitBtn.textContent = '提交核验记录';
    }
  };
}

function showMessage(el, text, type) {
  el.textContent = text;
  el.style.display = 'block';
  el.className = 'form-message ' + (type || '');
}

(async function initPage() {
  if (pageLoaded) return;
  pageLoaded = true;

  const header = document.querySelector('.qrcode-detail-header');
  if (header) {
    const userBar = document.createElement('div');
    userBar.id = 'qrcodeUserStatusBar';
    userBar.style.marginTop = '12px';
    userBar.style.paddingTop = '12px';
    userBar.style.borderTop = '1px solid rgba(255,255,255,0.2)';
    header.appendChild(userBar);
  }

  await initAuth();
  const userBar = document.getElementById('qrcodeUserStatusBar');
  if (userBar) {
    renderLoginStatusBar(userBar);
    applyPermissionGuards();
  }

  await loadItemDetail();
})();
