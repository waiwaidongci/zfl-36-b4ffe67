import { readFile } from "node:fs/promises";
import { join, dirname, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { stages } from "./constants.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8"
};

export function renderPage() {
  const stageOptions = stages.map(s => '<option>' + s + '</option>').join('');
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>鸬鹚捕鱼道具维护</title>
  <link rel="stylesheet" href="/public/style.css">
  <link rel="stylesheet" href="/public/qrcode-label.css">
</head>
<body>
  <header><div><h1>鸬鹚捕鱼道具维护</h1><div class="meta">道具建档、演示借用、归还和维护闭环</div></div><div class="header-actions"><div id="userStatusBar"></div><a href="/maintenance-calendar" class="nav-btn">📅 维护日历</a><a href="/reports" class="nav-btn">📊 运营报表</a><a href="/batches" class="nav-btn" data-perm="create_batch">📦 借用批次</a><a href="/backup" class="nav-btn" data-perm="view_backups">💾 数据备份</a><a href="/users" class="nav-btn" data-perm="manage_users">👥 用户管理</a><button id="reload">刷新</button></div></header>
  <main>
    <section>
      <form id="createForm"><h2>新增道具</h2><div id="fields"></div><label>初始状态</label><select name="status">${stageOptions}</select><button data-perm="create_item">保存道具</button></form>
      <form id="actionForm" style="margin-top:14px">
        <h2>创建演示借用单</h2>
        <div class="mode-switch">
          <label><input type="radio" name="borrowMode" value="single" checked> 单道具借用</label>
          <label><input type="radio" name="borrowMode" value="batch"> 批量借用（批次）</label>
        </div>
        <div id="singleMode">
          <label>选择道具</label>
          <select name="id" id="itemSelect"></select>
        </div>
        <div id="batchMode" style="display:none">
          <label>批次名称</label>
          <input name="batchName" placeholder="如：XX活动江面演示">
          <label>选择道具（可多选，按住 Ctrl/Cmd 或点击复选框）</label>
          <div id="multiSelectPanel" class="multi-select-panel"></div>
          <div class="multi-select-summary">
            <span>已选择 <strong id="selectedCount">0</strong> 件道具</span>
            <button type="button" id="selectAllBtn" class="secondary" data-perm="borrow_item">全选可借用</button>
            <button type="button" id="clearSelectionBtn" class="secondary">清空选择</button>
          </div>
        </div>
        <div id="extraFields"></div>
        <label>备注</label>
        <input name="remark" placeholder="选填，批次备注信息">
        <button id="submitBtn" data-perm="borrow_item">提交记录</button>
      </form>
      <div class="panel" id="returnPanel" style="margin-top:14px"><h2>归还登记</h2><div class="meta">加载中...</div></div>
      <div class="panel" id="repairPanel" style="margin-top:14px"><h2>修补工单</h2><div class="meta">加载中...</div></div>
      <div class="panel" id="importPanel" style="margin-top:14px">
        <h2>批量导入道具</h2>
        <details id="importHelp" class="import-help">
          <summary>使用说明</summary>
          <div class="help-content">
            <p><strong>CSV 格式要求：</strong></p>
            <ul>
              <li>第一行必须是表头：编号,名称,用途,材质,存放点</li>
              <li>编号仅允许字母、数字、连字符(-)和下划线(_)</li>
              <li>所有字段均为必填</li>
              <li>字段中包含逗号时请用双引号包裹，例如："渔网,三层"</li>
            </ul>
            <p><strong>示例：</strong></p>
<pre>编号,名称,用途,材质,存放点
CP-100,鸬鹚脚环,标识识别,铝合金,工具盒A
CP-101,木桨,划船演示,老杉木,器具架B
</pre>
            <p><strong>操作步骤：</strong></p>
            <ol>
              <li>粘贴 CSV 文本到下方文本框，或点击"上传CSV文件"</li>
              <li>点击"预览解析结果"</li>
              <li>检查预览数据和错误行</li>
              <li>确认无误后点击"确认导入"</li>
            </ol>
          </div>
        </details>
        <label>粘贴 CSV 文本</label>
        <textarea id="csvInput" placeholder="编号,名称,用途,材质,存放点&#10;CP-100,鸬鹚脚环,标识识别,铝合金,工具盒A"></textarea>
        <div class="import-toolbar">
          <button type="button" id="previewBtn" data-perm="import_items">预览解析结果</button>
          <label class="file-btn" data-perm="import_items">
            <input type="file" id="fileInput" accept=".csv,text/csv" style="display:none">
            上传CSV文件
          </label>
          <button type="button" id="clearBtn" class="secondary">清空</button>
        </div>
        <div id="previewResult" style="display:none;margin-top:12px">
          <div class="preview-summary"></div>
          <div id="newItemsSection" style="display:none">
            <h3>新增道具（<span class="new-count">0</span>条）</h3>
            <div class="preview-table-wrap">
              <table class="preview-table">
                <thead><tr><th>编号</th><th>名称</th><th>用途</th><th>材质</th><th>存放点</th></tr></thead>
                <tbody class="new-tbody"></tbody>
              </table>
            </div>
          </div>
          <div id="updateItemsSection" style="display:none">
            <h3 class="warn">更新已有道具（<span class="update-count">0</span>条有变更，<span class="unchanged-count">0</span>条无变更）</h3>
            <div class="update-list"></div>
          </div>
          <div id="errorSection" style="display:none">
            <h3 class="warn">错误行（<span class="error-count">0</span>条）</h3>
            <ul class="error-list"></ul>
          </div>
          <div id="fileDuplicateSection" style="display:none">
            <h3 class="warn">文件内重复编号（<span class="file-dup-count">0</span>条）</h3>
            <ul class="file-dup-list"></ul>
          </div>
          <div id="importModeSection" style="display:none;margin-top:16px;padding-top:16px;border-top:1px solid #e0e0e0">
            <h3 style="margin-bottom:12px">选择导入模式</h3>
            <div class="import-mode-options">
              <label class="import-mode-option">
                <input type="radio" name="importMode" value="insert_only" checked>
                <div class="mode-content">
                  <strong>仅新增</strong>
                  <span class="mode-desc">只导入新编号的道具，跳过已有编号</span>
                </div>
              </label>
              <label class="import-mode-option">
                <input type="radio" name="importMode" value="update_only">
                <div class="mode-content">
                  <strong>仅更新</strong>
                  <span class="mode-desc">只更新已有编号的道具，跳过新编号</span>
                </div>
              </label>
              <label class="import-mode-option">
                <input type="radio" name="importMode" value="insert_and_update">
                <div class="mode-content">
                  <strong>新增并更新</strong>
                  <span class="mode-desc">新编号创建新道具，已有编号更新基础档案</span>
                </div>
              </label>
            </div>
          </div>
          <div class="commit-bar">
            <button type="button" id="commitBtn" disabled data-perm="import_items">确认导入</button>
          </div>
        </div>
      </div>
    </section>
    <section>
      <div class="stats" id="stats"></div>
      <div id="reminders" class="reminders"></div>
      <div id="inventorySection" class="panel inventory-section"></div>
      <div class="toolbar"><select id="statusFilter"><option value="">全部状态</option>${stageOptions}</select><input id="search" placeholder="搜索编号或关键词"></div>
      <div class="panel"><h2>新增道具后可创建外出演示借用单，随后登记归还或维护备注。</h2><div class="grid" id="cards"></div></div>
    </section>
  </main>
  <script src="/public/qrcode.js"></script>
  <script type="module" src="/public/app.js"></script>
</body>
</html>`;
}

export async function serveStatic(req, res, url) {
  if (!url.pathname.startsWith("/public/")) return false;
  const relativePath = url.pathname.slice("/public".length);
  const filePath = join(__dirname, relativePath);
  const ext = extname(filePath);
  const mime = mimeTypes[ext];
  if (!mime) return false;
  try {
    const content = await readFile(filePath);
    res.writeHead(200, { "Content-Type": mime });
    res.end(content);
    return true;
  } catch {
    return false;
  }
}

export function renderQrcodeDetailPage(identifier) {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>道具详情 - 鸬鹚捕鱼道具维护</title>
  <link rel="stylesheet" href="/public/style.css">
  <link rel="stylesheet" href="/public/qrcode-detail.css">
</head>
<body class="qrcode-detail-page">
  <div class="qrcode-detail-container">
    <div class="qrcode-detail-header">
      <h1>道具详情</h1>
      <div class="qrcode-detail-meta">扫码查看道具信息</div>
    </div>
    <div id="qrcodeDetailContent" class="qrcode-detail-content">
      <div class="loading">加载中...</div>
    </div>
    <div class="qrcode-detail-footer">
      <div class="meta">鸬鹚捕鱼道具维护系统</div>
    </div>
  </div>
  <script type="module" src="/public/qrcode-detail.js"></script>
</body>
</html>`;
}

export function renderBatchesPage() {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>演示活动借用批次 - 鸬鹚捕鱼道具维护</title>
  <link rel="stylesheet" href="/public/style.css">
</head>
<body>
  <header>
    <div>
      <h1>演示活动借用批次</h1>
      <div class="meta">江面演示活动批量借用道具管理</div>
    </div>
    <div class="header-actions">
      <div id="userStatusBar"></div>
      <a href="/" class="nav-btn">🏠 返回首页</a>
      <button id="reload">刷新</button>
    </div>
  </header>
  <main>
    <section class="full-width">
      <div class="panel">
        <h2>批次统计</h2>
        <div id="batchStats" class="batch-stats">
          <div class="loading">加载中...</div>
        </div>
      </div>
      <div class="panel" style="margin-top:14px">
        <div class="toolbar">
          <h2 style="margin:0">借用批次列表</h2>
          <div>
            <select id="statusFilter">
              <option value="">全部状态</option>
              <option value="active">进行中</option>
              <option value="returned">已归还</option>
            </select>
            <input id="search" placeholder="搜索批次名称、活动、借用人">
          </div>
        </div>
        <div id="batchList" style="margin-top:12px">
          <div class="loading">加载中...</div>
        </div>
      </div>
    </section>
  </main>
  <script type="module" src="/public/batches.js"></script>
</body>
</html>`;
}

export function renderBatchDetailPage(batchId) {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>批次详情 - 鸬鹚捕鱼道具维护</title>
  <link rel="stylesheet" href="/public/style.css">
</head>
<body>
  <header>
    <div>
      <h1>批次详情</h1>
      <div class="meta" id="batchId">批次编号：加载中...</div>
    </div>
    <div class="header-actions">
      <div id="userStatusBar"></div>
      <a href="/batches" class="nav-btn">📦 返回批次列表</a>
      <a href="/" class="nav-btn">🏠 首页</a>
    </div>
  </header>
  <main>
    <section class="full-width">
      <div class="panel">
        <h2>批次信息</h2>
        <div id="batchInfo" class="batch-info">
          <div class="loading">加载中...</div>
        </div>
      </div>
      <div class="panel" style="margin-top:14px">
        <div class="toolbar">
          <h2 style="margin:0">未归还清单 <span class="pill warn" id="notReturnedCount" style="margin-left:8px">0</span></h2>
          <div>
            <button id="batchReturnBtn" class="secondary" data-perm="return_item" style="display:none">📦 批量归还</button>
          </div>
        </div>
        <div id="notReturnedList" style="margin-top:12px">
          <div class="loading">加载中...</div>
        </div>
      </div>
      <div class="panel" style="margin-top:14px">
        <h2>所有道具 <span class="pill" id="totalCount" style="margin-left:8px">0</span></h2>
        <div id="allItemsList" style="margin-top:12px">
          <div class="loading">加载中...</div>
        </div>
      </div>
      <div class="panel" style="margin-top:14px">
        <h2>批次操作日志</h2>
        <div id="batchLogs" class="logs" style="margin-top:12px">
          <div class="loading">加载中...</div>
        </div>
        <div style="margin-top:12px">
          <button id="addLogBtn" class="secondary" data-perm="add_batch_log">追加批次备注</button>
        </div>
      </div>
    </section>
  </main>
  <div id="batchReturnModal" class="modal" style="display:none">
    <div class="modal-content batch-return-modal">
      <div class="modal-header">
        <h3>📦 批次归还</h3>
        <span class="modal-close" id="batchReturnModalClose">&times;</span>
      </div>
      <div class="modal-body" id="batchReturnModalBody">
        <div class="loading">加载中...</div>
      </div>
    </div>
  </div>
  <script type="module" src="/public/batch-detail.js"></script>
</body>
</html>`;
}

export function renderReportsPage() {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>运营报表 - 鸬鹚捕鱼道具维护</title>
  <link rel="stylesheet" href="/public/style.css">
</head>
<body>
  <header>
    <div>
      <h1>运营报表</h1>
      <div class="meta">按日期范围统计道具使用情况</div>
    </div>
    <div class="header-actions">
      <div id="userStatusBar"></div>
      <a href="/" class="nav-btn">🏠 返回首页</a>
      <button id="reload">刷新</button>
    </div>
  </header>
  <main>
    <section class="full-width">
      <div class="panel">
        <h2>统计筛选</h2>
        <div class="report-filter">
          <div class="filter-row">
            <div class="filter-item">
              <label>开始日期</label>
              <input type="date" id="startDate">
            </div>
            <div class="filter-item">
              <label>结束日期</label>
              <input type="date" id="endDate">
            </div>
            <div class="filter-item filter-actions">
              <button id="queryBtn">查询统计</button>
              <button id="exportBtn" class="secondary">导出CSV</button>
            </div>
          </div>
          <div class="quick-date">
            <span class="meta">快捷选择：</span>
            <button type="button" class="quick-btn secondary small" data-range="7">近7天</button>
            <button type="button" class="quick-btn secondary small" data-range="30">近30天</button>
            <button type="button" class="quick-btn secondary small" data-range="90">近90天</button>
            <button type="button" class="quick-btn secondary small" data-range="all">全部</button>
          </div>
        </div>
      </div>

      <div class="panel" style="margin-top:14px">
        <div class="report-tab-bar">
          <button class="report-tab active" data-tab="item">道具维度</button>
          <button class="report-tab" data-tab="event">演示活动维度</button>
        </div>

        <div id="tabItem" class="report-tab-content">
          <h2>汇总统计</h2>
          <div id="reportSummary" class="report-summary">
            <div class="loading">加载中...</div>
          </div>

          <div style="margin-top:14px">
            <div class="toolbar">
              <h2 style="margin:0">道具明细</h2>
              <div>
                <input id="search" placeholder="搜索编号或名称">
              </div>
            </div>
            <div id="reportItems" style="margin-top:12px">
              <div class="loading">加载中...</div>
            </div>
          </div>
        </div>

        <div id="tabEvent" class="report-tab-content" style="display:none">
          <div class="toolbar">
            <h2 style="margin:0">演示活动统计</h2>
            <div>
              <input id="eventSearch" placeholder="搜索活动名称">
            </div>
          </div>
          <div id="reportEvents" style="margin-top:12px">
            <div class="loading">加载中...</div>
          </div>
        </div>
      </div>
    </section>
  </main>
  <script type="module" src="/public/reports.js"></script>
</body>
</html>`;
}

export function renderLoginPage() {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>登录 - 鸬鹚捕鱼道具维护</title>
  <link rel="stylesheet" href="/public/style.css">
</head>
<body class="login-page">
  <div class="login-container">
    <div class="login-box">
      <div class="login-header">
        <h1>鸬鹚捕鱼道具维护</h1>
        <div class="meta">请登录以继续使用系统</div>
      </div>
      <form id="loginForm" class="login-form">
        <label>用户名</label>
        <input name="username" type="text" placeholder="请输入用户名" required>
        <label>密码</label>
        <input name="password" type="password" placeholder="请输入密码" required>
        <div id="loginError" class="login-error" style="display:none"></div>
        <button type="submit">登 录</button>
        <div class="login-tips">
          <div class="meta">默认账号：</div>
          <div class="meta">管理员 admin / admin123</div>
          <div class="meta">维护员 maintainer / maintain123</div>
          <div class="meta">只读 viewer / view123</div>
        </div>
      </form>
    </div>
  </div>
  <script type="module" src="/public/auth.js"></script>
</body>
</html>`;
}

export function renderUsersPage() {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>用户管理 - 鸬鹚捕鱼道具维护</title>
  <link rel="stylesheet" href="/public/style.css">
  <style>
    .user-tab-bar { display:flex;gap:0;border-bottom:2px solid #e5e7eb;margin-bottom:16px; }
    .user-tab-btn { padding:8px 20px;border:none;background:none;cursor:pointer;font-size:14px;font-weight:500;color:#6b7785;border-bottom:2px solid transparent;margin-bottom:-2px;transition:all .15s; }
    .user-tab-btn:hover { color:#2b7de9; }
    .user-tab-btn.active { color:#2b7de9;border-bottom-color:#2b7de9; }
    .perm-checkbox { display:inline-flex;align-items:center;gap:4px;margin:3px 8px 3px 0;font-size:13px;cursor:pointer; }
    .perm-checkbox input { margin:0; }
    #permCheckboxes { display:flex;flex-wrap:wrap;gap:4px 0;margin-top:8px;max-height:240px;overflow-y:auto;border:1px solid #e5e7eb;border-radius:6px;padding:8px 12px; }
  </style>
</head>
<body>
  <header>
    <div>
      <h1>用户管理</h1>
      <div class="meta">管理系统用户账号和权限</div>
    </div>
    <div class="header-actions">
      <div id="userStatusBar"></div>
      <a href="/" class="nav-btn">🏠 返回首页</a>
      <button id="reload">刷新</button>
    </div>
  </header>
  <main>
    <section class="full-width">
      <div class="panel">
        <div class="user-tab-bar">
          <button class="user-tab-btn active" data-tab="users">👤 用户管理</button>
          <button class="user-tab-btn" data-tab="roles">🛡️ 角色管理</button>
        </div>
        <div id="userPanel">
          <div class="toolbar">
            <h2 style="margin:0">用户列表</h2>
            <div>
              <button id="addUserBtn" data-perm="manage_users">+ 新增用户</button>
              <button id="changePwdBtn" class="secondary">修改密码</button>
            </div>
          </div>
          <div id="userList" style="margin-top:12px">
            <div class="loading">加载中...</div>
          </div>
        </div>
        <div id="rolePanel" style="display:none">
          <div class="toolbar">
            <h2 style="margin:0">角色列表</h2>
            <div>
              <button id="addRoleBtn" data-perm="manage_users">+ 新增角色</button>
            </div>
          </div>
          <div id="roleList" style="margin-top:12px">
            <div class="loading">加载中...</div>
          </div>
        </div>
      </div>
    </section>
  </main>
  <div id="userModal" class="modal" style="display:none">
    <div class="modal-content">
      <div class="modal-header">
        <h3 id="modalTitle">新增用户</h3>
        <span class="modal-close" id="modalClose">&times;</span>
      </div>
      <form id="userForm" class="modal-body">
        <div id="userIdField" style="display:none">
          <label>用户ID</label>
          <input name="id" type="text" readonly>
        </div>
        <div id="usernameField">
          <label>用户名</label>
          <input name="username" type="text" placeholder="登录用户名" required>
        </div>
        <div>
          <label>显示名称</label>
          <input name="displayName" type="text" placeholder="显示名称" required>
        </div>
        <div>
          <label>角色</label>
          <div id="roleSelectContainer"></div>
        </div>
        <div id="passwordField">
          <label>密码</label>
          <input name="password" type="password" placeholder="登录密码">
        </div>
        <div id="pwdHint" class="meta">新增用户必填密码，修改用户时留空则不修改密码</div>
        <div class="modal-footer">
          <button type="button" class="secondary" id="modalCancel">取消</button>
          <button type="submit">保存</button>
        </div>
      </form>
    </div>
  </div>
  <div id="roleModal" class="modal" style="display:none">
    <div class="modal-content" style="max-width:560px">
      <div class="modal-header">
        <h3 id="roleModalTitle">新增角色</h3>
        <span class="modal-close" id="roleModalClose">&times;</span>
      </div>
      <form id="roleForm" class="modal-body">
        <div>
          <label>角色名称（英文标识）</label>
          <input name="roleName" type="text" placeholder="如 operator" required>
        </div>
        <div>
          <label>显示名称</label>
          <input name="roleLabel" type="text" placeholder="如 操作员" required>
        </div>
        <div>
          <label style="display:flex;align-items:center;gap:6px">
            <input type="checkbox" id="selectAllPerms"> 全选权限
          </label>
          <div id="permCheckboxes"></div>
        </div>
        <div class="modal-footer">
          <button type="button" class="secondary" id="roleModalCancel">取消</button>
          <button type="submit">保存</button>
        </div>
      </form>
    </div>
  </div>
  <div id="pwdModal" class="modal" style="display:none">
    <div class="modal-content">
      <div class="modal-header">
        <h3>修改密码</h3>
        <span class="modal-close" id="pwdModalClose">&times;</span>
      </div>
      <form id="pwdForm" class="modal-body">
        <div>
          <label>原密码</label>
          <input name="oldPassword" type="password" required>
        </div>
        <div>
          <label>新密码</label>
          <input name="newPassword" type="password" required minlength="6">
        </div>
        <div>
          <label>确认新密码</label>
          <input name="confirmPassword" type="password" required minlength="6">
        </div>
        <div id="pwdError" class="login-error" style="display:none"></div>
        <div class="modal-footer">
          <button type="button" class="secondary" id="pwdModalCancel">取消</button>
          <button type="submit">确认修改</button>
        </div>
      </form>
    </div>
  </div>
  <script type="module" src="/public/users.js"></script>
</body>
</html>`;
}

export function renderBackupPage() {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>数据备份与恢复 - 鸬鹚捕鱼道具维护</title>
  <link rel="stylesheet" href="/public/style.css">
</head>
<body>
  <header>
    <div>
      <h1>💾 数据备份与恢复</h1>
      <div class="meta">版本迁移 · 备份下载 · 安全恢复</div>
    </div>
    <div class="header-actions">
      <div id="userStatusBar"></div>
      <a href="/" class="nav-btn">🏠 返回首页</a>
      <button id="refreshBtn">刷新状态</button>
    </div>
  </header>
  <main>
    <section class="full-width">
      <div class="panel">
        <div class="toolbar">
          <h2 style="margin:0">📋 当前状态</h2>
          <span id="schemaBadge" class="pill">加载中...</span>
        </div>
        <div id="statusPanel" style="margin-top:12px">
          <div class="loading">加载中...</div>
        </div>
      </div>

      <div class="panel" style="margin-top:14px">
        <div class="toolbar">
          <h2 style="margin:0">⬇️ 下载备份</h2>
          <div>
            <button id="downloadBtn" class="" data-perm="download_backup">下载当前数据备份</button>
            <button id="createBackupBtn" class="secondary" data-perm="download_backup" style="margin-left:8px">创建服务器备份</button>
          </div>
        </div>
        <div class="meta" style="margin-top:10px">下载 JSON 格式完整备份文件，可用于恢复或离线存档。每次下载会在服务器自动创建带时间戳的快照备份。</div>
      </div>

      <div class="panel" style="margin-top:14px">
        <div class="toolbar">
          <h2 style="margin:0">📂 历史备份列表</h2>
          <div>
            <button id="cleanupBtn" class="secondary" data-perm="restore_backup">清理旧备份(保留10份)</button>
          </div>
        </div>
        <div id="backupList" style="margin-top:12px">
          <div class="loading">加载中...</div>
        </div>
      </div>

      <div class="panel" style="margin-top:14px;border-color:#b38a3a;border-width:2px">
        <h2 style="color:#9b6a1f">⚠️ 恢复数据（危险操作）</h2>
        <div class="meta" style="margin-bottom:14px">
          <strong>恢复流程说明：</strong>选择备份文件 → <strong>上传预检</strong>（自动解析、校验结构、检测重复编号、预览迁移结果）→ <strong>确认恢复</strong>（先自动备份当前数据再恢复，失败不破坏现有数据）。
        </div>

        <div id="restoreSection">
          <label>选择备份文件（JSON 格式）</label>
          <div class="upload-area" id="dropZone">
            <input type="file" id="fileInput" accept=".json,application/json" style="display:none">
            <div class="upload-hint">
              <div style="font-size:28px">📁</div>
              <div>点击选择文件或拖拽 JSON 文件到此处</div>
              <div class="meta" style="margin-top:6px">支持本系统导出的任意版本备份文件</div>
            </div>
            <div id="selectedFileInfo" style="display:none;margin-top:12px"></div>
          </div>

          <div id="precheckPanel" style="display:none;margin-top:16px">
            <div class="preview-summary-box" id="precheckSummary"></div>

            <div id="migrationPreview" style="display:none;margin-top:12px">
              <h3>🔄 迁移预览</h3>
              <div id="migrationInfo" class="meta"></div>
              <ul id="migrationWarningsList" style="margin:8px 0;padding-left:20px"></ul>
            </div>

            <div id="duplicatePanel" style="display:none;margin-top:12px">
              <h3 class="warn">🔢 重复编号检测</h3>
              <ul id="duplicateList" class="dup-list"></ul>
            </div>

            <div id="validationPanel" style="margin-top:12px">
              <h3>✅ 校验结果</h3>
              <div id="validationInfo"></div>
              <ul id="errorList" class="error-list" style="display:none"></ul>
              <ul id="warningList" class="dup-list" style="display:none"></ul>
            </div>

            <div id="dangerFlagsPanel" style="display:none;margin-top:12px">
              <h3>⚠️ 注意事项</h3>
              <ul id="dangerFlagsList" style="margin:0;padding-left:20px"></ul>
            </div>

            <div class="commit-bar" style="margin-top:16px;padding-top:14px;border-top:1px solid var(--line)">
              <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
                <label class="checkbox-label" style="margin:0">
                  <input type="checkbox" id="confirmCheckbox">
                  <span>我已理解：恢复将覆盖<strong>全部现有数据</strong>，操作前将自动创建当前数据备份</span>
                </label>
              </div>
              <div style="margin-top:12px;display:flex;gap:10px">
                <button id="restoreBtn" disabled data-perm="restore_backup" style="background:#9b4937">确认恢复数据</button>
                <button type="button" id="resetBtn" class="secondary">取消 / 选择其他文件</button>
              </div>
            </div>
          </div>

          <div id="restoreResult" style="display:none;margin-top:16px"></div>
        </div>
      </div>
    </section>
  </main>

  <div id="confirmModal" class="modal" style="display:none">
    <div class="modal-content">
      <div class="modal-header">
        <h3 id="modalTitle">确认操作</h3>
        <span class="modal-close" id="modalClose">&times;</span>
      </div>
      <div class="modal-body" id="modalBody"></div>
      <div class="modal-footer">
        <button type="button" class="secondary" id="modalCancel">取消</button>
        <button type="button" id="modalConfirm">确认</button>
      </div>
    </div>
  </div>

  <script type="module" src="/public/backup.js"></script>
</body>
</html>`;
}

export function renderMaintenanceCalendarPage() {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>维护日历 - 鸬鹚捕鱼道具维护</title>
  <link rel="stylesheet" href="/public/style.css">
</head>
<body>
  <header>
    <div>
      <h1>📅 维护日历</h1>
      <div class="meta">按月查看所有道具维护计划安排</div>
    </div>
    <div class="header-actions">
      <div id="userStatusBar"></div>
      <a href="/" class="nav-btn">🏠 返回首页</a>
      <button id="reloadBtn">刷新</button>
    </div>
  </header>
  <main>
    <section class="full-width">
      <div class="panel">
        <div class="calendar-toolbar">
          <div class="calendar-nav">
            <button id="prevMonthBtn" class="secondary small">◀ 上月</button>
            <h2 id="monthTitle" style="margin:0 16px;min-width:160px;text-align:center">加载中...</h2>
            <button id="nextMonthBtn" class="secondary small">下月 ▶</button>
            <button id="todayBtn" class="small" style="margin-left:8px">今天</button>
          </div>
          <div class="calendar-legend">
            <span class="legend-item"><span class="legend-dot overdue"></span>已逾期</span>
            <span class="legend-item"><span class="legend-dot today"></span>今天</span>
            <span class="legend-item"><span class="legend-dot soon"></span>7天内</span>
            <span class="legend-item"><span class="legend-dot normal"></span>计划中</span>
          </div>
        </div>
      </div>

      <div class="panel" style="margin-top:14px">
        <div class="calendar-toolbar" style="margin-bottom:14px">
          <div class="calendar-summary" id="calendarSummary">
            <span class="summary-pill overdue">逾期：<strong id="overdueCount">0</strong></span>
            <span class="summary-pill today">今天：<strong id="todayCount">0</strong></span>
            <span class="summary-pill soon">7天内：<strong id="soonCount">0</strong></span>
            <span class="summary-pill normal">本月总计：<strong id="totalCount">0</strong></span>
          </div>
          <div>
            <select id="responsibleFilter" style="min-width:180px">
              <option value="">全部负责人</option>
            </select>
          </div>
        </div>
        <div id="calendarGrid" class="calendar-grid">
          <div class="loading">加载中...</div>
        </div>
      </div>

      <div class="panel" style="margin-top:14px">
        <div class="toolbar">
          <h2 style="margin:0">📋 本月维护清单</h2>
          <input id="listSearch" placeholder="搜索编号、名称或负责人">
        </div>
        <div id="maintenanceList" style="margin-top:12px">
          <div class="loading">加载中...</div>
        </div>
      </div>
    </section>
  </main>

  <div id="planModal" class="modal" style="display:none">
    <div class="modal-content">
      <div class="modal-header">
        <h3 id="planModalTitle">维护计划</h3>
        <span class="modal-close" id="planModalClose">&times;</span>
      </div>
      <div class="modal-body" id="planModalBody">
        <div class="loading">加载中...</div>
      </div>
    </div>
  </div>

  <script type="module" src="/public/maintenance-calendar.js"></script>
</body>
</html>`;
}
