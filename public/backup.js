import { PERMISSIONS, hasPermission } from "./auth.js";
import { serializeUser, extractToken, setupUserBar } from "./auth.js";

const API = {
  me: "/api/auth/me",
  info: "/api/backup/info",
  download: "/api/backup/download",
  create: "/api/backup/create",
  precheck: "/api/backup/precheck",
  restore: "/api/backup/restore",
  cleanup: "/api/backup/cleanup",
  file: (name) => `/api/backup/file/${encodeURIComponent(name)}`
};

let currentUser = null;
let precheckResult = null;
let selectedFileContent = null;
let selectedFileName = "";

function $(id) { return document.getElementById(id); }

async function apiGet(url) {
  const res = await fetch(url, { headers: authHeaders() });
  const text = await res.text();
  let data = null;
  try { data = JSON.parse(text); } catch { data = text; }
  if (!res.ok) throw new Error(data && data.message ? data.message : `HTTP ${res.status}`);
  return data;
}

async function apiPost(url, body, opts = {}) {
  const isJson = !(body instanceof FormData) && !(body instanceof String || typeof body === "string") && !(body instanceof ArrayBuffer);
  const headers = authHeaders();
  if (isJson) {
    headers["Content-Type"] = "application/json; charset=utf-8";
  }
  const res = await fetch(url, {
    method: "POST",
    headers,
    body: isJson ? JSON.stringify(body) : body
  });
  const text = await res.text();
  let data = null;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }
  if (!res.ok && !opts.allowError) {
    throw new Error(data && data.message ? data.message : `HTTP ${res.status}`);
  }
  return { ok: res.ok, status: res.status, data };
}

function authHeaders() {
  const token = extractToken();
  const headers = {};
  if (token) headers["Authorization"] = "Bearer " + token;
  return headers;
}

function can(perm) {
  if (!currentUser || !currentUser.role) return false;
  return hasPermission(currentUser.role, perm);
}

function applyPermissions() {
  document.querySelectorAll("[data-perm]").forEach(el => {
    const perm = el.getAttribute("data-perm");
    if (!can(perm)) {
      el.style.display = "none";
    }
  });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function fmtSize(bytes) {
  if (!bytes && bytes !== 0) return "-";
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(2) + " MB";
}

function fmtDate(iso) {
  if (!iso) return "-";
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    const p = n => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
  } catch { return iso; }
}

async function initAuth() {
  try {
    const data = await apiGet(API.me);
    currentUser = data.user;
    await setupUserBar("userStatusBar");
    applyPermissions();
  } catch (err) {
    if (window.location.pathname !== "/login") {
      window.location.href = "/login";
    }
  }
}

async function loadStatus() {
  const panel = $("statusPanel");
  const badge = $("schemaBadge");
  try {
    const info = await apiGet(API.info);
    renderSchemaBadge(badge, info);
    renderStatus(panel, info);
    renderBackupList($("backupList"), info);
  } catch (err) {
    panel.innerHTML = `<div class="warn">加载状态失败: ${escapeHtml(err.message)}</div>`;
    badge.textContent = "加载失败";
    badge.className = "pill pill-warn";
  }
}

function renderSchemaBadge(el, info) {
  const cur = info.schema ? info.schema.currentVersion : 0;
  const target = info.schema ? info.schema.targetVersion : cur;
  const needs = info.schema && info.schema.needsMigration;
  el.textContent = needs ? `v${cur} → v${target}（待迁移）` : `v${cur} / 目标 v${target}`;
  el.className = needs ? "pill pill-warn" : "pill pill-ok";
}

function renderStatus(panel, info) {
  const s = info.schema || {};
  const startup = info.startup || null;
  const migs = s.migrations || [];

  let rows = `
    <div class="batch-stats" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px">
      <div class="stat"><span class="meta">数据版本</span><strong>v${s.currentVersion || 0}</strong>
        <div class="meta">目标版本 v${s.targetVersion}</div></div>
      <div class="stat"><span class="meta">备份数量</span><strong>${info.backupCount || 0}</strong>
        <div class="meta">共 ${info.backupCount || 0} 个历史文件</div></div>
      <div class="stat"><span class="meta">迁移记录</span><strong>${migs.length}</strong>
        <div class="meta">已执行 ${migs.length} 次迁移</div></div>
      <div class="stat"><span class="meta">数据恢复</span><strong>${s.recovery ? "✓ 自动恢复" : "正常"}</strong>
        ${s.recovery ? `<div class="meta warn">从备份 ${escapeHtml(s.recovery)} 恢复</div>` : `<div class="meta">无需恢复</div>`}</div>
    </div>`;

  if (startup && (startup.warnings || startup.backupCreated)) {
    rows += `<div style="margin-top:12px">`;
    if (startup.backupCreated) {
      rows += `<div class="meta" style="margin-top:6px">✓ 启动时创建迁移前备份: <code>${escapeHtml(startup.backupCreated.file || "")}</code></div>`;
    }
    if (startup.warnings && startup.warnings.length > 0) {
      rows += `<h3 style="margin:12px 0 6px">迁移警告 (${startup.warnings.length})</h3><ul class="dup-list">`;
      for (const w of startup.warnings.slice(0, 20)) {
        rows += `<li>${escapeHtml(w)}</li>`;
      }
      if (startup.warnings.length > 20) {
        rows += `<li class="meta">... 以及 ${startup.warnings.length - 20} 条更多</li>`;
      }
      rows += `</ul>`;
    }
    rows += `</div>`;
  }

  if (startup && startup.validation) {
    const v = startup.validation;
    rows += `<div style="margin-top:12px">`;
    if (v.errors && v.errors.length > 0) {
      rows += `<h3 class="warn" style="margin:12px 0 6px">校验错误 (${v.errors.length})</h3><ul class="error-list">`;
      for (const e of v.errors.slice(0, 10)) rows += `<li>${escapeHtml(e)}</li>`;
      rows += `</ul>`;
    }
    if (v.info) {
      rows += `<div style="margin-top:8px" class="meta">数据统计: `;
      const parts = [];
      for (const [k, val] of Object.entries(v.info)) {
        if (typeof val === "number") {
          parts.push(`${escapeHtml(k)}=${val}`);
        }
      }
      rows += parts.join(", ");
      rows += `</div>`;
    }
    rows += `</div>`;
  }

  panel.innerHTML = rows;
}

function renderBackupList(container, info) {
  const backups = info.backups || [];
  if (backups.length === 0) {
    container.innerHTML = `<div class="meta">暂无备份记录，点击上方"创建服务器备份"按钮可手动创建</div>`;
    return;
  }
  let html = `<div class="preview-table-wrap">
    <table class="preview-table">
      <thead><tr>
        <th>文件名</th><th>版本</th><th>大小</th><th>创建时间</th><th>标签</th><th>操作</th>
      </tr></thead><tbody>`;
  for (const b of backups) {
    const tagBadge = b.tag ? `<span class="pill" style="margin-left:4px">${escapeHtml(b.tag)}</span>` : "";
    const verBadge = typeof b.schemaVersion === "number" ? `v${b.schemaVersion}` : "未知";
    const validBadge = b.valid ? `<span class="pill pill-ok">✓ 有效</span>` : `<span class="pill pill-warn">✗ 损坏</span>`;
    html += `<tr>
      <td><code style="font-size:12px">${escapeHtml(b.file)}</code></td>
      <td>${verBadge}</td>
      <td>${b.sizeText || fmtSize(b.size)}</td>
      <td>${fmtDate(b.createdAt || b.mtime)}</td>
      <td>${tagBadge} ${validBadge}</td>
      <td>
        ${can(PERMISSIONS.DOWNLOAD_BACKUP) ? `<button type="button" class="secondary small download-backup" data-file="${escapeHtml(b.file)}" style="padding:5px 10px;font-size:12px">下载</button>` : ""}
        ${can(PERMISSIONS.RESTORE_BACKUP) ? `<button type="button" class="secondary small delete-backup" data-file="${escapeHtml(b.file)}" style="padding:5px 10px;font-size:12px;background:#9b4937;margin-left:4px">删除</button>` : ""}
      </td>
    </tr>`;
  }
  html += `</tbody></table></div>`;
  container.innerHTML = html;
  container.querySelectorAll(".download-backup").forEach(btn => {
    btn.addEventListener("click", () => downloadBackupFile(btn.dataset.file));
  });
  container.querySelectorAll(".delete-backup").forEach(btn => {
    btn.addEventListener("click", () => deleteBackupFile(btn.dataset.file));
  });
}

async function downloadBackupFile(name) {
  window.location.href = API.file(name);
}

async function deleteBackupFile(name) {
  if (!confirm(`确定删除备份文件 ${name}？此操作不可撤销。`)) return;
  try {
    const url = API.file(name);
    const res = await fetch(url, { method: "DELETE", headers: authHeaders() });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.message || "删除失败");
    toast(`已删除 ${name}`, "ok");
    loadStatus();
  } catch (err) {
    toast("删除失败: " + err.message, "err");
  }
}

async function handleDownload() {
  try {
    toast("正在生成备份...", "info");
    const token = extractToken();
    const url = API.download;
    const headers = authHeaders();
    const res = await fetch(url, { headers });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const blob = await res.blob();
    const disp = res.headers.get("Content-Disposition") || "";
    let fname = `cormorant-props-backup-${Date.now()}.json`;
    const m = disp.match(/filename="?([^";]+)"?/);
    if (m) fname = decodeURIComponent(m[1]);
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = fname;
    document.body.appendChild(a);
    a.click();
    URL.revokeObjectURL(a.href);
    a.remove();
    toast("备份已下载: " + fname, "ok");
    loadStatus();
  } catch (err) {
    toast("下载失败: " + err.message, "err");
  }
}

async function handleCreateBackup() {
  try {
    const r = await apiPost(API.create, {});
    if (r.ok) {
      toast(`已创建备份: ${r.data.file}`, "ok");
      loadStatus();
    } else {
      throw new Error(r.data.message || "创建失败");
    }
  } catch (err) {
    toast("创建失败: " + err.message, "err");
  }
}

async function handleCleanup() {
  if (!confirm("将只保留最近 10 份备份，确认清理？")) return;
  try {
    const r = await apiPost(API.cleanup, { keep: 10 });
    if (r.ok) {
      toast(`清理完成：删除 ${r.data.removed} 份，保留 ${r.data.kept} 份`, "ok");
      loadStatus();
    }
  } catch (err) {
    toast("清理失败: " + err.message, "err");
  }
}

function setupFileInput() {
  const dropZone = $("dropZone");
  const fileInput = $("fileInput");

  dropZone.addEventListener("click", () => fileInput.click());

  fileInput.addEventListener("change", e => {
    if (e.target.files && e.target.files[0]) handleFile(e.target.files[0]);
  });

  ["dragenter", "dragover"].forEach(ev => {
    dropZone.addEventListener(ev, e => {
      e.preventDefault();
      dropZone.style.borderColor = "var(--accent)";
      dropZone.style.background = "#f0f7ec";
    });
  });
  ["dragleave", "drop"].forEach(ev => {
    dropZone.addEventListener(ev, e => {
      e.preventDefault();
      dropZone.style.borderColor = "";
      dropZone.style.background = "";
    });
  });
  dropZone.addEventListener("drop", e => {
    const f = e.dataTransfer.files && e.dataTransfer.files[0];
    if (f) handleFile(f);
  });
}

async function handleFile(file) {
  if (!file.name.toLowerCase().endsWith(".json")) {
    toast("请选择 JSON 格式的备份文件", "err");
    return;
  }
  const maxSize = 50 * 1024 * 1024;
  if (file.size > maxSize) {
    toast(`文件过大 (${fmtSize(file.size)})，上限 ${fmtSize(maxSize)}`, "err");
    return;
  }
  selectedFileName = file.name;
  $("selectedFileInfo").style.display = "block";
  $("selectedFileInfo").innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center">
    <div><strong>📄 ${escapeHtml(file.name)}</strong>
      <div class="meta">大小: ${fmtSize(file.size)} · 修改: ${fmtDate(file.lastModified ? new Date(file.lastModified).toISOString() : null)}</div>
    </div>
    <div class="meta" id="precheckingHint">正在预检...</div></div>`;

  try {
    const text = await file.text();
    selectedFileContent = text;
    await runPrecheck(text);
  } catch (err) {
    $("selectedFileInfo").innerHTML = `<div class="warn">读取文件失败: ${escapeHtml(err.message)}</div>`;
  }
}

async function runPrecheck(content) {
  const precheckPanel = $("precheckPanel");
  try {
    const r = await apiPost(API.precheck, content);
    precheckResult = r.data;
    renderPrecheck(r.data);
    precheckPanel.style.display = "block";
    const info = $("selectedFileInfo");
    info.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center">
    <div><strong>📄 ${escapeHtml(selectedFileName)}</strong>
      <div class="meta">已完成预检，下方显示结果</div>
    </div>
    <span class="pill ${r.ok && r.data.canRestore ? "pill-ok" : "pill-warn"}">${r.data.canRestore ? "✓ 可恢复" : "✗ 有错误"}</span>
  </div>`;
  } catch (err) {
    precheckPanel.style.display = "block";
    $("precheckSummary").className = "preview-summary-box";
    $("precheckSummary").innerHTML = `<div class="warn"><strong>预检请求失败:</strong> ${escapeHtml(err.message)}</div>`;
    $("migrationPreview").style.display = "none";
    $("duplicatePanel").style.display = "none";
    $("validationPanel").style.display = "none";
    $("dangerFlagsPanel").style.display = "none";
    document.getElementById("restoreBtn").disabled = true;
  }
}

function renderPrecheck(data) {
  const sum = $("precheckSummary");
  sum.className = "preview-summary-box";
  const sm = data.summary || {};
  const canRestore = data.canRestore;
  const versionLine = data.isWrapped && data.backupMeta
    ? `源版本 v${data.originalVersion}${data.willMigrate ? ` → 迁移至 v${data.targetVersion}` : ""}（备份生成: ${fmtDate(data.backupMeta.createdAt)}，生成者: ${escapeHtml(data.backupMeta.generatedBy || data.backupMeta.generator || "未知")}）`
    : `源版本 v${data.originalVersion}${data.willMigrate ? ` → 迁移至 v${data.targetVersion}` : ""}（无 backupMeta 包装）`;

  sum.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
    <div>
      <strong style="font-size:16px">${canRestore ? "✓ 备份文件可用" : "⚠ 备份文件存在问题"}</strong>
      <div class="meta" style="margin-top:4px">${versionLine}</div>
    </div>
    <div class="meta">大小: ${sm.bytesText || fmtSize(sm.bytes)} ·
      道具 <strong>${sm.items || 0}</strong> /
      批次 <strong>${sm.borrowBatches || 0}</strong> /
      工单 <strong>${sm.repairOrders || 0}</strong> /
      盘点 <strong>${sm.inventories || 0}</strong> /
      用户 <strong>${sm.users || 0}</strong>
    </div>
  </div>`;
  if (!canRestore) sum.style.borderColor = "var(--warn)";

  const mprev = $("migrationPreview");
  if (data.willMigrate && data.migratedPreview) {
    mprev.style.display = "block";
    $("migrationInfo").innerHTML = `将从 v${data.originalVersion} 迁移至 v${data.migratedPreview.finalVersion}，共 ${data.migratedPreview.steps.length} 步迁移。`;
    const ul = $("migrationWarningsList");
    ul.innerHTML = "";
    if (data.migrationWarnings && data.migrationWarnings.length > 0) {
      for (const w of data.migrationWarnings.slice(0, 30)) {
        const li = document.createElement("li");
        li.className = "meta";
        li.textContent = w;
        ul.appendChild(li);
      }
      if (data.migrationWarnings.length > 30) {
        const li = document.createElement("li");
        li.className = "meta";
        li.textContent = `... 以及 ${data.migrationWarnings.length - 30} 条更多警告`;
        ul.appendChild(li);
      }
    } else {
      const li = document.createElement("li");
      li.className = "meta";
      li.textContent = "迁移无警告。";
      ul.appendChild(li);
    }
  } else {
    mprev.style.display = "none";
  }

  const dupPanel = $("duplicatePanel");
  const dups = data.duplicateCodes || [];
  if (dups.length > 0) {
    dupPanel.style.display = "block";
    const ul = $("duplicateList");
    ul.innerHTML = "";
    for (const d of dups) {
      const li = document.createElement("li");
      li.innerHTML = `<strong>${escapeHtml(d.code)}</strong> 出现 ${d.occurrences.length} 次：` +
        d.occurrences.map(o => `第${o.index + 1}项「${escapeHtml(o.name)}」`).join("、") +
        `<div class="meta">恢复时将自动重命名为 ${escapeHtml(d.code)}-DUP1、${escapeHtml(d.code)}-DUP2 …</div>`;
      ul.appendChild(li);
    }
  } else {
    dupPanel.style.display = "none";
  }

  const valPanel = $("validationPanel");
  const v = data.validation || {};
  $("validationInfo").innerHTML = v.errors.length === 0
    ? `<span class="pill pill-ok">✓ 结构校验通过</span> <span class="meta">共 ${Object.keys(v.info || {}).length} 项数据统计</span>`
    : `<span class="pill pill-warn">✗ 发现 ${v.errors.length} 个错误</span>`;
  const errs = $("errorList");
  const warns = $("warningList");
  if (v.errors && v.errors.length > 0) {
    errs.style.display = "block";
    errs.innerHTML = v.errors.slice(0, 30).map(e => `<li>${escapeHtml(e)}</li>`).join("");
  } else {
    errs.style.display = "none";
  }
  if (v.warnings && v.warnings.length > 0) {
    warns.style.display = "block";
    warns.innerHTML = v.warnings.slice(0, 30).map(e => `<li>${escapeHtml(e)}</li>`).join("");
  } else {
    warns.style.display = "none";
  }

  const dangerPanel = $("dangerFlagsPanel");
  const flags = data.dangerFlags || [];
  if (flags.length > 0) {
    dangerPanel.style.display = "block";
    const ul = $("dangerFlagsList");
    ul.innerHTML = "";
    for (const f of flags) {
      const li = document.createElement("li");
      const label = f.level === "critical" ? "【严重】" : f.level === "warn" ? "【警告】" : "【提示】";
      const cls = f.level === "critical" ? "warn" : f.level === "warn" ? "" : "meta";
      li.className = cls;
      li.innerHTML = `<strong>${label}</strong> ${escapeHtml(f.message)}`;
      ul.appendChild(li);
    }
  } else {
    dangerPanel.style.display = "none";
  }

  const restoreBtn = document.getElementById("restoreBtn");
  const hasCritical = flags.some(f => f.level === "critical");
  restoreBtn.disabled = !canRestore || hasCritical;
  if (restoreBtn.disabled) {
    restoreBtn.title = hasCritical ? "存在严重问题，无法恢复" : !canRestore ? "校验未通过，无法恢复" : "";
  }
  document.getElementById("confirmCheckbox").checked = false;
}

function setupConfirmCheckbox() {
  const cb = $("confirmCheckbox");
  const btn = $("restoreBtn");
  cb.addEventListener("change", () => {
    if (precheckResult && precheckResult.canRestore) {
      const flags = precheckResult.dangerFlags || [];
      const hasCritical = flags.some(f => f.level === "critical");
      btn.disabled = !cb.checked || hasCritical;
    }
  });
}

async function handleRestore() {
  if (!precheckResult || !precheckResult.canRestore) return;
  const confirmCk = $("confirmCheckbox");
  if (!confirmCk.checked) return;

  const btn = $("restoreBtn");
  const origText = btn.textContent;
  btn.disabled = true;
  btn.textContent = "正在恢复...";

  try {
    const r = await apiPost(API.restore, selectedFileContent);
    const panel = $("restoreResult");
    panel.style.display = "block";
    if (r.ok && r.data.restored) {
      const d = r.data;
      panel.innerHTML = `<div style="padding:16px;border:2px solid #a5d6a7;border-radius:8px;background:#e8f5e9">
        <h3 style="margin:0;color:#2e7d32">✅ 恢复成功</h3>
        <div style="margin-top:10px" class="meta">
          <div>恢复后数据版本: <strong>v${d.schemaVersion}</strong></div>
          <div>写入校验和: <code>${escapeHtml(d.wroteChecksum.slice(0, 16))}...</code> (${d.wroteBytes} bytes)</div>
          <div>操作人: ${escapeHtml(d.restoredBy)} · 时间: ${fmtDate(d.restoredAt)}</div>
          ${d.migration ? `<div>迁移: v${d.migration.steps[0]?.from || 0} → v${d.migration.finalVersion} · ${d.migration.warnings?.length || 0} 条警告</div>` : ""}
          <div>自动创建的恢复前备份: <code>${escapeHtml(d.preBackup ? d.preBackup.file : "(无)")}</code></div>
          <div>恢复后数据统计: 道具 <strong>${d.summary?.items || 0}</strong> · 用户 <strong>${d.summary?.users || 0}</strong></div>
        </div>
        <div style="margin-top:12px"><button type="button" class="secondary" onclick="location.reload()">刷新页面以加载新数据</button></div>
      </div>`;
      toast("恢复成功，请刷新页面", "ok");
    } else {
      const d = r.data || {};
      panel.innerHTML = `<div style="padding:16px;border:2px solid #ef9a9a;border-radius:8px;background:#fbe9e7">
        <h3 style="margin:0;color:#c62828">❌ 恢复失败</h3>
        <div style="margin-top:10px">
          <div class="warn">${escapeHtml(d.message || "未知错误")}</div>
          ${d.preBackup ? `<div class="meta" style="margin-top:6px">💾 已自动创建恢复前备份: <code>${escapeHtml(d.preBackup.file || "")}</code></div>` : ""}
          ${d.preserved !== false ? `<div class="meta" style="margin-top:4px">✅ 现有数据未被破坏</div>` : `<div class="warn" style="margin-top:4px">⚠️ 写入可能中断，请检查数据完整性</div>`}
          ${d.errors ? `<ul class="error-list" style="margin-top:8px">${d.errors.slice(0, 10).map(e => `<li>${escapeHtml(e)}</li>`).join("")}</ul>` : ""}
        </div>
      </div>`;
      toast("恢复失败: " + (d.message || "未知错误"), "err");
    }
  } catch (err) {
    const panel = $("restoreResult");
    panel.style.display = "block";
    panel.innerHTML = `<div style="padding:16px;border:2px solid #ef9a9a;border-radius:8px;background:#fbe9e7">
      <h3 style="margin:0;color:#c62828">❌ 恢复请求失败</h3>
      <div class="warn" style="margin-top:10px">${escapeHtml(err.message)}</div>
    </div>`;
    toast("恢复失败: " + err.message, "err");
  } finally {
    btn.textContent = origText;
  }
}

function handleReset() {
  $("fileInput").value = "";
  $("selectedFileInfo").style.display = "none";
  $("precheckPanel").style.display = "none";
  $("restoreResult").style.display = "none";
  $("confirmCheckbox").checked = false;
  $("restoreBtn").disabled = true;
  precheckResult = null;
  selectedFileContent = null;
  selectedFileName = "";
}

function toast(msg, kind = "info") {
  let box = document.getElementById("global-toast");
  if (!box) {
    box = document.createElement("div");
    box.id = "global-toast";
    Object.assign(box.style, {
      position: "fixed", top: "20px", right: "20px", zIndex: "9999",
      padding: "12px 18px", borderRadius: "8px", color: "#fff",
      fontWeight: "700", maxWidth: "400px", boxShadow: "0 4px 14px rgba(0,0,0,0.15)"
    });
    document.body.appendChild(box);
  }
  const colors = { ok: "#526f43", err: "#9b4937", info: "#3a6b8c" };
  box.style.background = colors[kind] || colors.info;
  box.textContent = msg;
  box.style.display = "block";
  clearTimeout(box._t);
  box._t = setTimeout(() => { box.style.display = "none"; }, 3500);
}

async function main() {
  await initAuth();
  if (!currentUser) return;
  if (!can(PERMISSIONS.VIEW_BACKUPS)) {
    document.querySelector("main").innerHTML = `<div class="panel" style="grid-column:1/-1">
      <div class="warn" style="font-size:18px">权限不足：您没有查看备份与恢复的权限。</div>
    </div>`;
    return;
  }
  loadStatus();
  $("refreshBtn").addEventListener("click", loadStatus);
  $("downloadBtn").addEventListener("click", handleDownload);
  $("createBackupBtn").addEventListener("click", handleCreateBackup);
  $("cleanupBtn").addEventListener("click", handleCleanup);
  $("restoreBtn").addEventListener("click", handleRestore);
  $("resetBtn").addEventListener("click", handleReset);
  setupFileInput();
  setupConfirmCheckbox();
}

document.addEventListener("DOMContentLoaded", main);
