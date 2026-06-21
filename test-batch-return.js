import { unlinkSync, existsSync, copyFileSync } from "node:fs";
import { loadDb, saveDb } from "./db.js";

const baseUrl = "http://localhost:3078";
const dbPath = "./data/cormorant-props.json";
const dbBackupPath = "./data/cormorant-props.batch-test-backup.json";
const results = [];
let testServerProc = null;
let authToken = null;

function log(name, ok, detail) {
  const mark = ok ? "✓" : "✗";
  const line = `${mark} ${name}` + (detail ? ` — ${detail}` : "");
  results.push({ name, ok, detail });
  console.log(line);
}

async function request(path, options = {}) {
  const headers = { ...options.headers };
  if (authToken) {
    headers["Cookie"] = `auth_token=${authToken}`;
  }
  if (options.body) {
    headers["Content-Type"] = "application/json";
  }
  const res = await fetch(baseUrl + path, {
    ...options,
    headers
  });
  const text = await res.text();
  let data;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { status: res.status, ok: res.ok, data };
}

async function login() {
  const res = await request("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ username: "admin", password: "admin123" })
  });
  if (res.ok && res.data?.token) {
    authToken = res.data.token;
    return true;
  }
  return false;
}

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function startServer() {
  const { spawn } = await import("node:child_process");
  return new Promise((resolve, reject) => {
    const proc = spawn("node", ["server.js"], {
      env: { ...process.env, PORT: "3078" },
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
  console.log("\n========== 批次归还模块测试 ==========\n");

  backupDb();

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
    const loginOk = await login();
    log("登录认证", loginOk, `用户: admin`);
  } catch (e) {
    log("登录认证", false, e.message);
    stopServer();
    cleanupBackup();
    process.exit(1);
  }

  let testItemIds = [];
  let testBatchId = null;

  try {
    for (let i = 1; i <= 4; i++) {
      const createRes = await request("/api/items", {
        method: "POST",
        body: JSON.stringify({
          code: `TEST-BATCH-${i.toString().padStart(3, "0")}`,
          name: `批次归还测试道具${i}`,
          purpose: "测试用途",
          material: "测试材质",
          wear: "全新",
          location: "测试柜",
          status: "可借用",
          lastMaintenance: "2026-06-20"
        })
      });
      testItemIds.push(createRes.data?.id);
    }
    log("创建4个测试道具", true, `IDs: ${testItemIds.join(", ")}`);
  } catch (e) {
    log("创建测试道具", false, e.message);
  }

  try {
    const r = await request("/api/batches", {
      method: "POST",
      body: JSON.stringify({
        itemIds: testItemIds,
        name: "批次归还测试批次",
        eventName: "批次归还测试演示",
        borrower: "测试借用人",
        dueDate: "2026-06-25",
        remark: "用于测试批次归还功能"
      })
    });
    testBatchId = r.data?.id;
    const allBorrowed = r.data?.items?.every(i => i.status === "已借出");
    log("创建测试借用批次", r.status === 201 && allBorrowed,
      `批次ID: ${testBatchId}, 道具数: ${r.data?.totalCount}`);
  } catch (e) {
    log("创建测试借用批次", false, e.message);
  }

  try {
    const r = await request(`/api/batches/${testBatchId}`);
    const notReturned = r.data?.notReturnedCount;
    log("获取批次详情（未归还）", r.ok && notReturned === 4,
      `未归还道具数: ${notReturned}, 总道具数: ${r.data?.totalCount}`);
  } catch (e) {
    log("获取批次详情", false, e.message);
  }

  try {
    const r = await request(`/api/batches/${testBatchId}/return`, {
      method: "POST",
      body: JSON.stringify({
        returnDate: "2026-06-21",
        returner: "测试归还人",
        generalWear: "整体使用正常，无明显损坏",
        items: [
          { itemId: testItemIds[0], wearChange: "", needRepair: false, note: "" },
          { itemId: testItemIds[1], wearChange: "把手有轻微划痕", needRepair: false, note: "使用时不小心碰到" },
          { itemId: testItemIds[2], wearChange: "网眼破损", needRepair: true, note: "需要修补网眼" }
        ]
      })
    });

    const processedOk = r.data?.processedCount === 3;
    const batchUpdated = r.data?.batch?.notReturnedCount === 1;

    log("1. 批量归还3件道具（部分归还）",
      r.status === 201 && processedOk && batchUpdated,
      `处理数: ${r.data?.processedCount}, 剩余未归还: ${r.data?.batch?.notReturnedCount}`);

    const item0 = r.data?.items?.find(i => i.itemId === testItemIds[0]);
    const item1 = r.data?.items?.find(i => i.itemId === testItemIds[1]);
    const item2 = r.data?.items?.find(i => i.itemId === testItemIds[2]);

    log("1a. 道具0状态更新为可借用", item0?.status === "可借用",
      `状态: ${item0?.status}`);
    log("1b. 道具1使用通用磨损+差异备注",
      item1?.status === "可借用" && item1?.returnRecord?.note === "使用时不小心碰到",
      `状态: ${item1?.status}, 备注: ${item1?.returnRecord?.note}`);
    log("1c. 道具2标记为需修补",
      item2?.status === "需修补" && item2?.returnRecord?.wearChange === "网眼破损",
      `状态: ${item2?.status}, 磨损: ${item2?.returnRecord?.wearChange}`);
  } catch (e) {
    log("1. 批量归还3件道具", false, e.message);
  }

  try {
    const r = await request(`/api/batches/${testBatchId}`);
    const notReturned = r.data?.notReturnedCount;
    const returned = r.data?.returnedCount;
    log("2. 批次详情更新（部分归还后）",
      r.ok && notReturned === 1 && returned === 3,
      `已归还: ${returned}, 未归还: ${notReturned}`);
  } catch (e) {
    log("2. 批次详情更新", false, e.message);
  }

  try {
    const allItems = await request("/api/items");
    const item = allItems.data?.find(i => i.id === testItemIds[0] || i.code === testItemIds[0]);
    const hasReturnLog = item?.logs?.some(l =>
      l.step === "归还" && l.note.includes("批次归还")
    );

    const allReturns = await request("/api/returns");
    const itemReturn = allReturns.data?.find(r =>
      (r.itemId === testItemIds[0] || r.itemCode === testItemIds[0]) && r.batchId === testBatchId
    );
    const hasBatchId = !!itemReturn;

    log("3. 道具日志记录批次归还",
      hasReturnLog && hasBatchId,
      `包含批次归还日志: ${hasReturnLog}, 归还记录带batchId: ${hasBatchId}`);
  } catch (e) {
    log("3. 道具日志检查", false, e.message);
  }

  try {
    const r = await request(`/api/batches/${testBatchId}`);
    const hasBatchReturnLog = r.data?.logs?.some(l =>
      l.step === "批次归还" && l.note.includes("3件道具")
    );
    log("4. 批次日志记录批量归还操作", hasBatchReturnLog,
      `包含批次归还日志: ${hasBatchReturnLog}`);
  } catch (e) {
    log("4. 批次日志检查", false, e.message);
  }

  try {
    const r = await request("/api/returns/borrowed");
    const remaining = r.data?.filter(i => testItemIds.includes(i.id));
    log("5. 待归还列表只剩余1件道具",
      r.ok && remaining.length === 1,
      `剩余待归还: ${remaining.length}件`);
  } catch (e) {
    log("5. 待归还列表检查", false, e.message);
  }

  try {
    const r = await request("/api/returns");
    const batchReturns = r.data?.filter(ret => ret.batchId === testBatchId);
    log("6. 全局归还记录包含批量归还记录",
      r.ok && batchReturns.length === 3,
      `批次归还记录数: ${batchReturns.length}`);
  } catch (e) {
    log("6. 全局归还记录检查", false, e.message);
  }

  try {
    const r = await request(`/api/batches/${testBatchId}/return`, {
      method: "POST",
      body: JSON.stringify({
        returnDate: "2026-06-22",
        returner: "测试归还人2",
        generalWear: "",
        items: [
          { itemId: testItemIds[3], wearChange: "正常归还", needRepair: false, note: "最后一件" }
        ]
      })
    });
    log("7. 归还最后1件道具（完成批次）",
      r.status === 201 && r.data?.batch?.allReturned === true,
      `批次完成: ${r.data?.batch?.allReturned}, 已归还: ${r.data?.batch?.returnedCount}/${r.data?.batch?.totalCount}`);
  } catch (e) {
    log("7. 完成批次归还", false, e.message);
  }

  try {
    const r = await request(`/api/batches/${testBatchId}`);
    log("8. 批次状态更新为已完成",
      r.ok && r.data?.allReturned === true && r.data?.notReturnedCount === 0,
      `allReturned: ${r.data?.allReturned}, 未归还: ${r.data?.notReturnedCount}`);
  } catch (e) {
    log("8. 批次状态检查", false, e.message);
  }

  try {
    const r = await request(`/api/batches/${testBatchId}/return`, {
      method: "POST",
      body: JSON.stringify({
        returnDate: "2026-06-22",
        returner: "测试",
        items: [{ itemId: testItemIds[0] }]
      })
    });
    log("9. 已归还道具重复归还被拒绝",
      r.status === 400 && r.data?.error === "items_unavailable",
      `HTTP状态: ${r.status}, 错误: ${r.data?.error}`);
  } catch (e) {
    log("9. 重复归还校验", false, e.message);
  }

  try {
    const r = await request(`/api/batches/INVALID-BATCH/return`, {
      method: "POST",
      body: JSON.stringify({
        returnDate: "2026-06-22",
        returner: "测试",
        items: [{ itemId: testItemIds[0] }]
      })
    });
    log("10. 不存在批次返回404",
      r.status === 404 && r.data?.error === "batch_not_found",
      `HTTP状态: ${r.status}, 错误: ${r.data?.error}`);
  } catch (e) {
    log("10. 不存在批次校验", false, e.message);
  }

  try {
    const r = await request(`/api/batches/${testBatchId}/return`, {
      method: "POST",
      body: JSON.stringify({
        returnDate: "2026-06-22",
        returner: "测试",
        items: []
      })
    });
    log("11. 空道具列表返回400",
      r.status === 400 && r.data?.error === "no_items",
      `HTTP状态: ${r.status}, 错误: ${r.data?.error}`);
  } catch (e) {
    log("11. 空道具列表校验", false, e.message);
  }

  try {
    const r = await request("/api/batches");
    const batch = r.data?.find(b => b.id === testBatchId);
    log("12. 批次列表统计更新",
      r.ok && batch?.allReturned === true && batch?.notReturnedCount === 0,
      `批次状态: ${batch?.allReturned ? "已完成" : "进行中"}, 未归还: ${batch?.notReturnedCount}`);
  } catch (e) {
    log("12. 批次列表统计检查", false, e.message);
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
    console.log("\n🎉 所有批次归还测试通过！");
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
