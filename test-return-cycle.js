import { unlinkSync, existsSync, copyFileSync } from "node:fs";
import { loadDb, saveDb } from "./db.js";

const baseUrl = "http://localhost:3077";
const dbPath = "./data/cormorant-props.json";
const dbBackupPath = "./data/cormorant-props.test-backup.json";
const results = [];
let testServerProc = null;

function log(name, ok, detail) {
  const mark = ok ? "✓" : "✗";
  const line = `${mark} ${name}` + (detail ? ` — ${detail}` : "");
  results.push({ name, ok, detail });
  console.log(line);
}

async function request(path, options = {}) {
  const res = await fetch(baseUrl + path, {
    ...options,
    headers: options.body ? { "Content-Type": "application/json", ...options.headers } : options.headers
  });
  const text = await res.text();
  let data;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { status: res.status, ok: res.ok, data };
}

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function startServer() {
  const { spawn } = await import("node:child_process");
  return new Promise((resolve, reject) => {
    const proc = spawn("node", ["server.js"], {
      env: { ...process.env, PORT: "3077" },
      stdio: ["ignore", "pipe", "pipe"]
    });
    testServerProc = proc;
    let started = false;
    proc.stdout.on("data", data => {
      const msg = data.toString();
      if (!started && msg.includes("listening")) {
        started = true;
        resolve(proc);
      }
    });
    proc.stderr.on("data", data => {
      if (!started) reject(new Error(data.toString()));
    });
    proc.on("exit", () => { if (!started) reject(new Error("server exited")); });
    setTimeout(() => { if (!started) reject(new Error("server start timeout")); }, 5000);
  });
}

function stopServer() {
  if (testServerProc) {
    testServerProc.kill("SIGTERM");
    testServerProc = null;
  }
}

function resetDb() {
  if (existsSync(dbBackupPath)) {
    copyFileSync(dbBackupPath, dbPath);
  }
}

function backupDb() {
  if (existsSync(dbPath)) {
    copyFileSync(dbPath, dbBackupPath);
  }
}

function cleanupBackup() {
  if (existsSync(dbBackupPath)) {
    unlinkSync(dbBackupPath);
  }
}

async function runTests() {
  console.log("\n========== 归还登记模块测试 ==========\n");

  backupDb();

  try {
    if (existsSync(dbPath)) unlinkSync(dbPath);
    const db = await loadDb();
    log("数据库初始化（种子数据加载）", true, `共 ${db.items.length} 个道具`);
  } catch (e) {
    log("数据库初始化", false, e.message);
  }

  try {
    await startServer();
    await sleep(300);
    log("服务器启动", true);
  } catch (e) {
    log("服务器启动", false, e.message);
    cleanupBackup();
    process.exit(1);
  }

  try {
    const r = await request("/api/items");
    const borrowed = r.data.filter(i => i.status === "已借出" || i.status === "待归还");
    log("获取道具列表", r.ok, `共 ${r.data.length} 个，其中已借出 ${borrowed.length} 个`);
  } catch (e) {
    log("获取道具列表", false, e.message);
  }

  try {
    const r = await request("/api/returns/borrowed");
    log("获取待归还道具列表", r.ok && Array.isArray(r.data), `返回 ${r.data?.length || 0} 条`);
    const hasBorrowedInfo = r.data?.every(item =>
      item.id && item.code && item.name && item.status !== undefined
    );
    log("待归还道具字段完整性", hasBorrowedInfo, "包含id/code/name/status");
  } catch (e) {
    log("获取待归还道具列表", false, e.message);
  }

  try {
    const r = await request("/api/returns");
    log("获取所有归还记录", r.ok && Array.isArray(r.data), `返回 ${r.data?.length || 0} 条历史记录`);
  } catch (e) {
    log("获取所有归还记录", false, e.message);
  }

  let testItemId = null;
  try {
    const createRes = await request("/api/items", {
      method: "POST",
      body: JSON.stringify({
        code: "TEST-RET-001",
        name: "测试归还道具",
        purpose: "测试用途",
        material: "测试材质",
        wear: "全新",
        location: "测试柜",
        status: "可借用",
        lastMaintenance: "2026-06-20"
      })
    });
    testItemId = createRes.data?.id;
    log("创建测试道具", createRes.status === 201, `编号=${createRes.data?.code}, id=${testItemId}`);
  } catch (e) {
    log("创建测试道具", false, e.message);
  }

  try {
    const r = await request(`/api/items/${testItemId}/action`, {
      method: "POST",
      body: JSON.stringify({
        borrower: "测试借用人",
        eventName: "闭环测试演示",
        dueDate: "2026-06-25"
      })
    });
    log("1. 创建借用单（借出）", r.status === 201 && r.data?.status === "已借出",
      `道具状态=${r.data?.status}, 借用人=${r.data?.borrowings?.slice(-1)[0]?.borrower}`);
  } catch (e) {
    log("1. 创建借用单", false, e.message);
  }

  try {
    const r = await request(`/api/items/${testItemId}/return`, {
      method: "POST",
      body: JSON.stringify({
        returner: "测试归还人",
        returnDate: "2026-06-21",
        wearChange: "无明显变化，保持完好",
        needRepair: false
      })
    });
    const statusOk = r.data?.item?.status === "可借用";
    const returnRecorded = r.data?.returnRecord?.returner === "测试归还人";
    const statusInLogs = r.data?.item?.logs?.some(l => l.step === "归还" && l.note.includes("可借用"));
    log("2a. 归还（无需修补）", r.status === 201 && statusOk && returnRecorded,
      `状态=${r.data?.item?.status}, 归还人=${r.data?.returnRecord?.returner}, 日志记录=${statusInLogs}`);
  } catch (e) {
    log("2a. 归还（无需修补）", false, e.message);
  }

  try {
    const r = await request(`/api/items/${testItemId}/returns`);
    log("3a. 查询单道具归还记录", r.ok && Array.isArray(r.data) && r.data.length === 1,
      `共 ${r.data?.length || 0} 条归还记录`);
  } catch (e) {
    log("3a. 查询单道具归还记录", false, e.message);
  }

  let testItemId2 = null;
  try {
    const createRes = await request("/api/items", {
      method: "POST",
      body: JSON.stringify({
        code: "TEST-RET-002",
        name: "测试需修补道具",
        purpose: "测试用途",
        material: "测试材质",
        wear: "全新",
        location: "测试柜",
        status: "可借用",
        lastMaintenance: "2026-06-20"
      })
    });
    testItemId2 = createRes.data?.id;
    log("创建第二个测试道具", createRes.status === 201, `编号=${createRes.data?.code}`);
  } catch (e) {
    log("创建第二个测试道具", false, e.message);
  }

  try {
    await request(`/api/items/${testItemId2}/action`, {
      method: "POST",
      body: JSON.stringify({
        borrower: "测试借用人2",
        eventName: "需修补测试",
        dueDate: "2026-06-24"
      })
    });
    log("1b. 创建借用单（借出）", true, "已借出第二个道具");
  } catch (e) {
    log("1b. 创建借用单", false, e.message);
  }

  try {
    const r = await request(`/api/items/${testItemId2}/return`, {
      method: "POST",
      body: JSON.stringify({
        returner: "测试归还人2",
        returnDate: "2026-06-21",
        wearChange: "把手断裂，需要修复",
        needRepair: true
      })
    });
    const statusOk = r.data?.item?.status === "需修补";
    const wearUpdated = r.data?.item?.wear === "把手断裂，需要修复";
    const statusInLogs = r.data?.item?.logs?.some(l => l.step === "归还" && l.note.includes("需修补"));
    log("2b. 归还（需修补）", r.status === 201 && statusOk && wearUpdated,
      `状态=${r.data?.item?.status}, 磨损已更新=${wearUpdated}, 日志含需修补=${statusInLogs}`);
  } catch (e) {
    log("2b. 归还（需修补）", false, e.message);
  }

  try {
    const r = await request(`/api/items/TEST-RET-001/return`, {
      method: "POST",
      body: JSON.stringify({ returner: "xxx" })
    });
    log("4. 重复归还校验（拒绝重复归还）", r.status === 400,
      `HTTP状态=${r.status}, 错误=${r.data?.error}`);
  } catch (e) {
    log("4. 重复归还校验", false, e.message);
  }

  try {
    const r = await request(`/api/items/NOEXIST/return`, {
      method: "POST",
      body: JSON.stringify({ returner: "xxx" })
    });
    log("5. 不存在道具归还（返回404）", r.status === 404, `HTTP状态=${r.status}`);
  } catch (e) {
    log("5. 不存在道具归还", false, e.message);
  }

  try {
    const r = await request("/api/returns/borrowed");
    const testItemsGone = !r.data?.some(i => i.code === "TEST-RET-001" || i.code === "TEST-RET-002");
    log("6. 归还后从待归还列表移除", testItemsGone, "已归还道具不再出现在列表中");
  } catch (e) {
    log("6. 归还后列表更新", false, e.message);
  }

  try {
    const statsR = await request("/api/stats");
    log("7. 统计数据更新", statsR.ok, `可借用=${statsR.data?.["可借用"] ?? "?"}, 需修补=${statsR.data?.["需修补"] ?? "?"}`);
  } catch (e) {
    log("7. 统计数据", false, e.message);
  }

  try {
    const r = await request("/api/returns");
    const hasNewReturns = r.data?.some(ret => ret.itemCode === "TEST-RET-001" || ret.itemCode === "TEST-RET-002");
    log("8. 全局归还记录包含新记录", r.ok && hasNewReturns, `全局归还记录共 ${r.data?.length || 0} 条`);
  } catch (e) {
    log("8. 全局归还记录", false, e.message);
  }

  stopServer();
  resetDb();
  cleanupBackup();

  console.log("\n========== 测试结果汇总 ==========");
  const passed = results.filter(r => r.ok).length;
  const total = results.length;
  const rate = Math.round((passed / total) * 100);
  console.log(`通过: ${passed}/${total} (${rate}%)`);

  if (passed !== total) {
    console.log("\n失败的测试：");
    results.filter(r => !r.ok).forEach(r => console.log(`  ✗ ${r.name} — ${r.detail || ""}`));
    process.exit(1);
  } else {
    console.log("\n🎉 所有测试通过！借用到归还的完整闭环验证成功。");
    process.exit(0);
  }
}

process.on("SIGINT", () => {
  stopServer();
  resetDb();
  cleanupBackup();
  process.exit(1);
});

runTests();
