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
  <header><div><h1>鸬鹚捕鱼道具维护</h1><div class="meta">道具建档、演示借用、归还和维护闭环</div></div><div class="header-actions"><a href="/batches" class="nav-btn">📦 借用批次</a><button id="reload">刷新</button></div></header>
  <main>
    <section>
      <form id="createForm"><h2>新增道具</h2><div id="fields"></div><label>初始状态</label><select name="status">${stageOptions}</select><button>保存道具</button></form>
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
            <button type="button" id="selectAllBtn" class="secondary">全选可借用</button>
            <button type="button" id="clearSelectionBtn" class="secondary">清空选择</button>
          </div>
        </div>
        <div id="extraFields"></div>
        <label>备注</label>
        <input name="remark" placeholder="选填，批次备注信息">
        <button id="submitBtn">提交记录</button>
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
          <button type="button" id="previewBtn">预览解析结果</button>
          <label class="file-btn">
            <input type="file" id="fileInput" accept=".csv,text/csv" style="display:none">
            上传CSV文件
          </label>
          <button type="button" id="clearBtn" class="secondary">清空</button>
        </div>
        <div id="previewResult" style="display:none;margin-top:12px">
          <div class="preview-summary"></div>
          <h3>解析成功（<span class="valid-count">0</span>条）</h3>
          <div class="preview-table-wrap">
            <table class="preview-table">
              <thead><tr><th>编号</th><th>名称</th><th>用途</th><th>材质</th><th>存放点</th></tr></thead>
              <tbody class="preview-tbody"></tbody>
            </table>
          </div>
          <div id="errorSection" style="display:none">
            <h3 class="warn">错误行（<span class="error-count">0</span>条）</h3>
            <ul class="error-list"></ul>
          </div>
          <div id="duplicateSection" style="display:none">
            <h3 class="warn">重复编号（<span class="dup-count">0</span>条）</h3>
            <ul class="dup-list"></ul>
          </div>
          <div class="commit-bar">
            <button type="button" id="commitBtn" disabled>确认导入</button>
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
        <h2>未归还清单 <span class="pill warn" id="notReturnedCount" style="margin-left:8px">0</span></h2>
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
          <button id="addLogBtn" class="secondary">追加批次备注</button>
        </div>
      </div>
    </section>
  </main>
  <script type="module" src="/public/batch-detail.js"></script>
</body>
</html>`;
}
