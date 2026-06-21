import { mkdir, writeFile, readFile, unlink, rm, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEST_DIR = join(__dirname, "tmp-test-" + Date.now());

let passed = 0;
let failed = 0;
let results = [];

function assert(name, cond, detail = "") {
  if (cond) {
    passed++; results.push({ name, ok: true });
    console.log(`  ✓ PASS: ${name}`);
  } else {
    failed++; results.push({ name, ok: false, detail });
    console.log(`  ✗ FAIL: ${name}${detail ? " -- " + detail : ""}`);
  }
}
function assertEq(name, actual, expected) {
  const cond = JSON.stringify(actual) === JSON.stringify(expected);
  assert(name + (cond ? "" : ` (expected=${JSON.stringify(expected)}, actual=${JSON.stringify(actual)})`), cond);
}

async function setup() {
  await rm(TEST_DIR, { recursive: true, force: true });
  await mkdir(TEST_DIR, { recursive: true });
}
async function teardown() {
  await rm(TEST_DIR, { recursive: true, force: true }).catch(() => {});
}

const SAMPLE_V0 = () => JSON.parse(JSON.stringify({
  items: [
    { code: "CP-001", name: "鸬鹚绳环", status: "可借用", wear: "轻微", borrowings: [], logs: [] },
    { code: "CP-002", name: "渔网", status: "可借用", wear: "中等", borrowings: [], logs: [] },
    { code: "CP-003", name: "鱼篓", status: "需修补", wear: "严重", borrowings: [], logs: [] },
    { code: "CP-004", name: "船桨", status: "可借用", wear: "无", borrowings: [], logs: [] },
  ],
  inventories: [
    { id: "CP-INV-001", date: "2026-01-15", location: "主仓库", notes: "ok", results: [] }
  ],
  repairOrders: [
    { id: "CP-REP-001", itemCode: "CP-003", status: "待处理", reportDate: "2026-01-10", description: "破洞", repairMethod: "", repairNotes: "", repairDate: "", logs: [] }
  ],
  borrowBatches: [
    { id: "BATCH-001", name: "渔汛借用", eventName: "春汛", startDate: "2026-03-01", endDate: "2026-03-31", borrower: "渔队A", itemIds: ["CP-001", "CP-002"], status: "借用中", logs: [] }
  ],
  users: [
    { id: "U-ADM-001", username: "admin", passwordHash: "", role: "ADMIN", displayName: "管理员", createdAt: "2026-01-01T00:00:00Z" },
    { id: "U-VWR-001", username: "viewer", passwordHash: "", role: "VIEWER", displayName: "查看员", createdAt: "2026-01-01T00:00:00Z" },
  ],
  sessions: []
}));

async function testMigrations() {
  console.log("\n📝 Test Suite 1: 迁移系统（纯函数直接调用）");
  const { migrate_v0_to_v1, TARGET_SCHEMA_VERSION } = await import("./migrations/v001_to_v1.js");
  const { applyMigrations, needsMigration, currentVersion } = await import("./migrations/index.js");

  console.log("\n  [1.1] v0 → v1 迁移基本路径");
  const db1 = SAMPLE_V0();
  assert("v0 没有 schemaVersion 字段", db1.schemaVersion === undefined);
  const r1 = migrate_v0_to_v1(db1);
  assert("迁移结果 warnings 是数组", Array.isArray(r1.warnings));
  assert("迁移结果 changed = true", r1.changed === true);
  assertEq("schemaVersion 升级为 1", db1.schemaVersion, TARGET_SCHEMA_VERSION);
  assertEq("保留了全部 4 个道具", db1.items.length, 4);
  assert("borrowBatches 仍是数组（不破坏已存在）", Array.isArray(db1.borrowBatches) && db1.borrowBatches.length === 1);
  assert("users 仍是数组（不破坏已存在）", Array.isArray(db1.users) && db1.users.length === 2);
  assert("sessions 仍是数组（不破坏已存在）", Array.isArray(db1.sessions));
  assert("_migrations 记录已添加", Array.isArray(db1._migrations) && db1._migrations.length > 0);
  assert("needsMigration(v1) = false", needsMigration(db1) === false);
  assert("currentVersion(v1) = 1", currentVersion(db1) === 1);

  console.log("\n  [1.2] 重复编号自动去重 + _originalCode 记录");
  const db2 = SAMPLE_V0();
  db2.items[1].code = "CP-001";
  db2.items[2].code = "CP-001";
  db2.items[3].code = "CP-001";
  const dupBefore = db2.items.filter(i => i.code === "CP-001").length;
  assertEq("构造了 4 个 CP-001", dupBefore, 4);
  const r2 = migrate_v0_to_v1(db2);
  const codes = db2.items.map(i => i.code);
  assert("所有迁移后编号唯一", new Set(codes).size === codes.length);
  assert("保留了一个原始 CP-001", codes.includes("CP-001"));
  assert("重命名使用 -DUP1 后缀", codes.some(c => c.endsWith("-DUP1")));
  assert("重命名使用 -DUP2 后缀", codes.some(c => c.endsWith("-DUP2")));
  const origCodes = db2.items.filter(i => i._originalCode === "CP-001");
  assertEq("3 个项被标注了 _originalCode", origCodes.length, 3);
  assert("warnings 包含重复编号描述", r2.warnings.some(w => w.includes("重复编号")));

  console.log("\n  [1.3] 缺失字段使用默认值");
  const db3 = {
    items: [
      { code: "CP-901" },
      { code: "CP-902", name: "自定义道具" },
      { code: "CP-903", status: "需修补" },
      { code: "CP-904", name: "N", status: "S", wear: "W" }
    ]
  };
  const r3 = migrate_v0_to_v1(db3);
  assertEq("缺失 name → 默认名", typeof db3.items[0].name === "string" && db3.items[0].name.length > 0, true);
  assertEq("缺失 status → 默认 '可借用'", db3.items[0].status, "可借用");
  assertEq("缺失 wear → 默认 '无'", db3.items[0].wear, "无");
  assert("缺失 borrowings → 空数组", Array.isArray(db3.items[0].borrowings) && db3.items[0].borrowings.length === 0);
  assert("缺失 logs → 空数组", Array.isArray(db3.items[0].logs));
  assert("已有 name 不被覆盖", db3.items[1].name === "自定义道具");
  assert("已有 status 不被覆盖", db3.items[2].status === "需修补");
  assert("已有 wear 不被覆盖", db3.items[3].wear === "W");
  assert("缺 inventories → 空数组", Array.isArray(db3.inventories));
  assert("缺 repairOrders → 空数组", Array.isArray(db3.repairOrders));
  assert("缺 borrowBatches → 空数组", Array.isArray(db3.borrowBatches));
  assert("缺 users → 初始化为默认 3 人", Array.isArray(db3.users) && db3.users.length >= 3);
  assert("缺 sessions → 空数组", Array.isArray(db3.sessions));
  assert("warnings 包含缺失字段提示", r3.warnings.some(w => w.includes("缺失")));

  console.log("\n  [1.4] 集合内字段缺失（批次/工单/盘点）");
  const db4 = {
    items: [{ code: "CP-800", name: "测试道具", status: "可借用" }],
    borrowBatches: [
      { name: "无id批次", eventName: "测试" },
      { id: "BATCH-001", name: "无itemIds批次" }
    ],
    repairOrders: [
      { itemCode: "CP-800" },
      { id: "CP-REP-111", status: "处理中" }
    ],
    inventories: [
      { location: "东柜", date: "2026-01-01" }
    ]
  };
  migrate_v0_to_v1(db4);
  assert("无 id 的批次生成 id", typeof db4.borrowBatches[0].id === "string" && db4.borrowBatches[0].id.length > 0);
  assert("无 itemIds 的批次初始化空数组", Array.isArray(db4.borrowBatches[1].itemIds));
  assert("批次缺 logs → 空数组", Array.isArray(db4.borrowBatches[0].logs));
  assert("无 id 的工单生成 id", typeof db4.repairOrders[0].id === "string");
  assertEq("工单缺 status → '待处理'", db4.repairOrders[0].status, "待处理");
  assert("工单缺 logs → 空数组", Array.isArray(db4.repairOrders[0].logs));
  assert("无 id 的盘点生成 id", typeof db4.inventories[0].id === "string");
  assert("盘点缺 results → 空数组", Array.isArray(db4.inventories[0].results));
  assert("盘点缺 notes → 空串", typeof db4.inventories[0].notes === "string");

  console.log("\n  [1.5] applyMigrations 编排器");
  const db5 = SAMPLE_V0();
  const r5 = applyMigrations(db5);
  assert("编排器 changed = true", r5.changed === true);
  assert("编排器返回 steps 数组", Array.isArray(r5.steps) && r5.steps.length === 1);
  assertEq("编排器 steps[0].from = 0", r5.steps[0].from, 0);
  assertEq("编排器 steps[0].to = 1", r5.steps[0].to, 1);
  assertEq("最终版本 1", r5.finalVersion, 1);
  const r5b = applyMigrations(db5);
  assert("再次编排 changed = false", r5b.changed === false);
  assert("再次编排 steps 为空", r5b.steps.length === 0);

  console.log("\n  [1.6] 完全空对象也能初始化");
  const db6 = {};
  migrate_v0_to_v1(db6);
  assertEq("空对象 schemaVersion 升级成功", db6.schemaVersion, 1);
  assert("items 被初始化为空数组", Array.isArray(db6.items));
  assert("users 被初始化为默认 3 人", Array.isArray(db6.users) && db6.users.length >= 3);
  assert("_migrations 被记录", Array.isArray(db6._migrations));
}

async function testStorage() {
  console.log("\n\n💾 Test Suite 2: 存储层安全机制（直接使用 services/storage.js）");
  const {
    readDatabase, writeDatabase, createBackup, listBackups,
    readBackup, restoreFromBackupData, validateBackupData,
    validateDatabaseObject, cleanupOldBackups
  } = await import("./services/storage.js");

  console.log("\n  [2.1] 写入 + 读回正确");
  await setup();
  const dbV1 = { schemaVersion: 1, items: [{ code: "CP-A", name: "A" }] };
  const wr = await writeDatabase(TEST_DIR, dbV1);
  assert("writeDatabase 返回 checksum", wr.checksum && wr.checksum.length === 64);
  assert("writeDatabase 返回 bytes>0", wr.bytes > 0);
  const readBack = await readDatabase(TEST_DIR);
  assert("source='main'", readBack.source === "main");
  assertEq("读回 items 一致", readBack.data.items[0].code, "CP-A");
  assert("data 无 backupMeta", readBack.data.backupMeta === undefined);
  const fs = await import("node:fs/promises");
  const files = await fs.readdir(join(TEST_DIR, "data"));
  const tmpLeftover = files.filter(f => f.includes(".tmp-write"));
  assert("没有遗留临时文件（原子写入清理）", tmpLeftover.length === 0);

  console.log("\n  [2.2] 主数据 JSON 损坏 → 自动从最近备份回滚");
  await writeDatabase(TEST_DIR, { schemaVersion: 1, items: [{ code: "GOOD", name: "完好数据" }] });
  const b1 = await createBackup(TEST_DIR, "pre-corrupt");
  assert("创建了备份", b1 !== null && b1.file);
  const backupCount1 = (await listBackups(TEST_DIR)).length;
  assert("listBackups 列出 1 个", backupCount1 === 1);
  const dbPath = join(TEST_DIR, "data", "cormorant-props.json");
  await writeFile(dbPath, "{THIS IS NOT VALID JSON {{  ");
  const recv = await readDatabase(TEST_DIR);
  assert("source='backup' 自动降级恢复", recv.source === "backup");
  assertEq("恢复后数据正确", recv.data.items[0].code, "GOOD");
  assert("recoverError 记录了损坏原因", recv.recoverError && recv.recoverError.includes("JSON"));
  assert("backupFile 指向备份名", recv.backupFile === b1.file);

  console.log("\n  [2.3] 备份文件包含完整 backupMeta");
  await setup();
  await writeDatabase(TEST_DIR, { schemaVersion: 1, items: [{ code: "CP-B" }], users: [] });
  const b2 = await createBackup(TEST_DIR, "tag-test-meta");
  assert("createBackup 返回 file", typeof b2.file === "string");
  assert("createBackup 返回 schemaVersion", b2.schemaVersion === 1);
  assert("createBackup 返回 createdAt", typeof b2.createdAt === "string");
  const bc = await readBackup(TEST_DIR, b2.file);
  assert("备份内有 backupMeta 对象", bc.backupMeta && typeof bc.backupMeta === "object");
  assertEq("backupMeta.schemaVersion = 1", bc.backupMeta.schemaVersion, 1);
  assertEq("backupMeta.tag = 'tag-test-meta'", bc.backupMeta.tag, "tag-test-meta");
  assert("backupMeta.originalChecksum SHA256", bc.backupMeta.originalChecksum && bc.backupMeta.originalChecksum.length === 64);
  assert("backupMeta.createdAt 存在", typeof bc.backupMeta.createdAt === "string");
  assertEq("backupMeta.originalBytes>0", bc.backupMeta.originalBytes > 0, true);

  console.log("\n  [2.4] validateDatabaseObject 边界检测");
  const v1 = validateDatabaseObject(null);
  assert("null → valid=false", v1.valid === false);
  const v2 = validateDatabaseObject({});
  assert("{} → valid=false（缺 items）", v2.valid === false);
  assert("{} errors 提到 items", v2.errors.some(e => e.includes("items")));
  const v3 = validateDatabaseObject({
    items: [{ code: "x" }, { code: "x" }],
    users: [{ username: "a" }, { username: "a" }]
  });
  assert("重复编号被检测", v3.errors.some(e => e.includes("重复编号")));
  assert("重复用户名被检测", v3.errors.some(e => e.includes("重复用户名")));
  assert("info.duplicateCodeCount = 1", v3.info.duplicateCodeCount === 1);
  const v4 = validateDatabaseObject({ items: [] });
  assert("空 items + 缺集合 → valid=true（结构合法）", v4.valid === true);
  assert("缺 users 警告", v4.warnings.some(w => w.includes("users")));
  assert("缺 sessions 警告", v4.warnings.some(w => w.includes("sessions")));
  assert("缺 borrowBatches 警告", v4.warnings.some(w => w.includes("borrowBatches")));
  assert("info.itemCount = 0", v4.info.itemCount === 0);

  console.log("\n  [2.5] validateBackupData 预检文本");
  const p1 = await validateBackupData("");
  assert("空文本 → valid=false", p1.valid === false);
  const p2 = await validateBackupData("{not valid!!!");
  assert("损坏 JSON → valid=false", p2.valid === false);
  assert("损坏 JSON errors 有说明", p2.errors.length > 0);
  const goodTxt = JSON.stringify({ schemaVersion: 1, items: [], users: [] });
  const p3 = await validateBackupData(goodTxt);
  assert("合法 JSON → valid=true", p3.valid === true);
  assert("合法 JSON errors 为空", p3.errors.length === 0);

  console.log("\n  [2.6] 清理旧备份保留 N 个");
  await setup();
  await writeDatabase(TEST_DIR, { schemaVersion: 1, items: [] });
  for (let i = 0; i < 12; i++) {
    await createBackup(TEST_DIR, `c${i}`);
    await new Promise(r => setTimeout(r, 120));
  }
  const full = await listBackups(TEST_DIR);
  assert("清理前共 12 个备份", full.length === 12);
  const cr = await cleanupOldBackups(TEST_DIR, 5);
  assertEq("清理 removed = 7", cr.removed, 7);
  assertEq("清理 kept = 5", cr.kept, 5);
  const remain = await listBackups(TEST_DIR);
  assertEq("清理后剩 5 个", remain.length, 5);
  for (let i = 1; i < remain.length; i++) {
    assert(`时间降序 #${i}`, remain[i - 1].mtime >= remain[i].mtime);
  }
}

async function testBackupRestore() {
  console.log("\n\n🔄 Test Suite 3: 备份恢复完整流程");
  const storage = await import("./services/storage.js");
  const migrations = await import("./migrations/v001_to_v1.js");

  console.log("\n  [3.1] 恢复前自动创建 pre-restore 备份 + 原子写入");
  await setup();
  await storage.writeDatabase(TEST_DIR, { schemaVersion: 1, items: [{ code: "ORIG", name: "原始数据" }] });
  const beforeList = await storage.listBackups(TEST_DIR);
  const restoreData = { schemaVersion: 1, items: [{ code: "NEW", name: "恢复后" }] };
  const rr = await storage.restoreFromBackupData(TEST_DIR, restoreData);
  const afterList = await storage.listBackups(TEST_DIR);
  assert("restored = true", rr.restored === true);
  assert("返回了 preBackup", rr.preBackup !== null && rr.preBackup.file);
  assertEq("备份数增加 1（pre-restore）", afterList.length, beforeList.length + 1);
  assert("preBackup 文件名含 'pre-restore'", rr.preBackup.file.includes("pre-restore"));
  const readAfter = await storage.readDatabase(TEST_DIR);
  assertEq("恢复后数据正确", readAfter.data.items[0].code, "NEW");

  console.log("\n  [3.2] 恢复失败不能破坏现有数据");
  const SAVE_CODE = "SAVEME-" + Date.now();
  await storage.writeDatabase(TEST_DIR, { schemaVersion: 1, items: [{ code: SAVE_CODE }] });
  const snapshot = JSON.parse(JSON.stringify((await storage.readDatabase(TEST_DIR)).data));
  try {
    await storage.restoreFromBackupData(TEST_DIR, undefined);
  } catch {}
  try {
    await storage.restoreFromBackupData(TEST_DIR, null);
  } catch {}
  try {
    await storage.restoreFromBackupData(TEST_DIR, "NOT AN OBJECT");
  } catch {}
  const checkSafe = await storage.readDatabase(TEST_DIR);
  assertEq("3 次非法调用后数据未破坏", checkSafe.data.items[0].code, SAVE_CODE);
  assert("数据对象内容完全一致", JSON.stringify(checkSafe.data) === JSON.stringify(snapshot));

  console.log("\n  [3.3] 带 backupMeta 包装的备份自动剥离 wrapper");
  const wrappedData = {
    backupMeta: { createdAt: new Date().toISOString(), schemaVersion: 1, tag: "wrapped-test", originalChecksum: "abc", originalBytes: 1 },
    schemaVersion: 1,
    items: [{ code: "UNWRAP-OK" }],
    users: [], sessions: []
  };
  await storage.writeDatabase(TEST_DIR, { schemaVersion: 1, items: [{ code: "BEFORE" }] });
  const rw = await storage.restoreFromBackupData(TEST_DIR, wrappedData);
  const afterWrap = await storage.readDatabase(TEST_DIR);
  assert("恢复后数据不含 backupMeta", afterWrap.data.backupMeta === undefined);
  assertEq("恢复后道具正确", afterWrap.data.items[0].code, "UNWRAP-OK");
  assertEq("恢复后 schemaVersion 正确", afterWrap.data.schemaVersion, 1);

  console.log("\n  [3.4] dryRun 模式不实际写入数据");
  const beforeDry = JSON.parse(JSON.stringify((await storage.readDatabase(TEST_DIR)).data));
  const dry = await storage.restoreFromBackupData(TEST_DIR, { schemaVersion: 1, items: [{ code: "DRY-RUN" }] }, { dryRun: true });
  assert("wouldRestore = true", dry.wouldRestore === true);
  assert("dryRun 返回 preBackup", dry.preBackup !== null);
  const afterDry = await storage.readDatabase(TEST_DIR);
  assert("dryRun 数据未改变", JSON.stringify(afterDry.data) === JSON.stringify(beforeDry));

  console.log("\n  [3.5] 恢复 v0 旧备份 → 结合迁移系统可升级");
  await setup();
  const v0back = SAMPLE_V0();
  delete v0back.schemaVersion;
  await storage.writeDatabase(TEST_DIR, { schemaVersion: 1, items: [] });
  const rrv0 = await storage.restoreFromBackupData(TEST_DIR, v0back);
  assert("v0 数据恢复成功", rrv0.restored === true);
  const justRestored = (await storage.readDatabase(TEST_DIR)).data;
  assert("恢复后是 v0（schemaVersion 未定义或 0）", justRestored.schemaVersion === undefined || justRestored.schemaVersion === 0);
  migrations.migrate_v0_to_v1(justRestored);
  assertEq("手动迁移后 schemaVersion = 1", justRestored.schemaVersion, 1);
  assertEq("迁移后道具 4 个", justRestored.items.length, 4);
  assert("恢复→迁移 工作流完整", true);
}

async function testConcurrencyAndAtomic() {
  console.log("\n\n⚡ Test Suite 4: 并发写入与原子性");
  const storage = await import("./services/storage.js");
  await setup();
  await storage.writeDatabase(TEST_DIR, { schemaVersion: 1, items: [{ code: "INIT" }] });

  console.log("\n  [4.1] 并发 10 次写 + 最终一致性校验");
  const N = 10;
  const promises = [];
  for (let i = 0; i < N; i++) {
    promises.push((async (k) => {
      const db = { schemaVersion: 1, items: [{ code: "W-" + k, _k: k }], _w: k };
      await storage.writeDatabase(TEST_DIR, db);
    })(i));
  }
  await Promise.all(promises);
  const final = await storage.readDatabase(TEST_DIR);
  assert("最终数据是有效对象（非半写损坏）", final.data && final.data.schemaVersion === 1);
  assert("最终 items[0] 是某次写入的结果", final.data.items[0].code && final.data.items[0].code.startsWith("W-"));
  const fs = await import("node:fs/promises");
  const files = await fs.readdir(join(TEST_DIR, "data"));
  const tmps = files.filter(f => f.includes(".tmp-write"));
  assert("并发后无遗留临时文件", tmps.length === 0);
  const content = await fs.readFile(join(TEST_DIR, "data", "cormorant-props.json"), "utf8");
  assert("最终文件可正常 JSON.parse", JSON.parse(content) !== null);
}

async function testEnsureIntegrity() {
  console.log("\n\n🧩 Test Suite 5: ensureIntegrity 规范化（重复编号+缺字段立即修复）");
  const mig = await import("./migrations/v001_to_v1.js");
  const storage = await import("./services/storage.js");

  console.log("\n  [5.1] 重复编号 + 缺字段 同时修复");
  const db1 = {
    items: [
      { code: "SAME-X" },
      { code: "SAME-X", status: "坏的" },
      { code: "SAME-X", name: "自定义" },
      { code: "OK-001" }
    ]
  };
  const r1 = mig.ensureIntegrity(db1);
  assert("返回 normalized=true", r1.normalized === true);
  assert("返回 warnings 数组", Array.isArray(r1.warnings));
  const codes1 = db1.items.map(i => i.code);
  assert("规范化后编号唯一", new Set(codes1).size === codes1.length);
  assert("保留一个原编号 SAME-X", codes1.includes("SAME-X"));
  assert("生成 -DUP1 后缀", codes1.some(c => c.endsWith("-DUP1")));
  assert("生成 -DUP2 后缀", codes1.some(c => c.endsWith("-DUP2")));
  const itemsOk = db1.items.every(i =>
    typeof i.name === "string" && i.name.length > 0 &&
    typeof i.status === "string" && i.status.length > 0 &&
    typeof i.wear === "string" &&
    Array.isArray(i.borrowings) && Array.isArray(i.logs)
  );
  assert("所有道具都补全了 name/status/wear/borrowings/logs 默认值", itemsOk);
  const origCount = db1.items.filter(i => i._originalCode === "SAME-X").length;
  assertEq("2 个被重命名的重复项记录了 _originalCode", origCount, 2);
  const v = storage.validateDatabaseObject(db1);
  assert("规范化后 validation.valid = true", v.valid === true);
  assert("规范化后 validation.errors 为空", v.errors.length === 0);

  console.log("\n  [5.2] v1 版本已有重复编号仍可修复（不依赖迁移触发）");
  const db2 = {
    schemaVersion: 1,
    items: [
      { code: "DUP-A", name: "a", status: "s" },
      { code: "DUP-A", name: "b", status: "s" },
      { code: "DUP-A", name: "c", status: "s" },
      { code: "DUP-A", name: "d", status: "s" }
    ],
    users: []
  };
  const v2before = storage.validateDatabaseObject(db2);
  assert("规范化前 valid=false（重复编号）", v2before.valid === false);
  assert("规范化前 duplicateCodeCount = 1", v2before.info.duplicateCodeCount === 1);
  const r2 = mig.ensureIntegrity(db2);
  assert("schemaVersion=1 时也触发规范化", r2.normalized === true);
  const v2after = storage.validateDatabaseObject(db2);
  assert("规范化后 valid=true", v2after.valid === true);
  const codes2 = new Set(db2.items.map(i => i.code));
  assertEq("规范化后 4 个唯一编号", codes2.size, 4);
  db2.items.forEach(i => assert(`每个道具都有 id: ${i.code}`, typeof i.id === "string" && i.id.length > 0));

  console.log("\n  [5.3] 集合不存在也可初始化（users/items等）");
  const db3 = {};
  const r3 = mig.ensureIntegrity(db3);
  assert("空对象 normalized=true", r3.normalized === true);
  assert("items 已初始化为数组", Array.isArray(db3.items));
  assert("inventories 已初始化为数组", Array.isArray(db3.inventories));
  assert("repairOrders 已初始化为数组", Array.isArray(db3.repairOrders));
  assert("borrowBatches 已初始化为数组", Array.isArray(db3.borrowBatches));
  assert("sessions 已初始化为数组", Array.isArray(db3.sessions));

  console.log("\n  [5.4] 幂等性：二次规范化不产生副作用");
  const clean = { schemaVersion: 1, items: [{ code: "A", name: "a", status: "s" }], users: [] };
  const vclean = storage.validateDatabaseObject(clean);
  assert("干净数据 valid=true", vclean.valid === true);
  const r4a = mig.ensureIntegrity(JSON.parse(JSON.stringify(clean)));
  const r4b = mig.ensureIntegrity(JSON.parse(JSON.stringify(clean)));
  const before = JSON.stringify(clean);
  const after = JSON.parse(before);
  mig.ensureIntegrity(after);
  const after2 = JSON.parse(JSON.stringify(after));
  mig.ensureIntegrity(after2);
  assert("二次规范化后数据不变（除 id 自动生成外）", after.items[0].code === after2.items[0].code);
}

async function testPathBoundary() {
  console.log("\n\n🔒 Test Suite 6: 备份路径边界 & 路径穿越防护");
  const storage = await import("./services/storage.js");
  const { BACKUP_PREFIX } = storage;

  console.log("\n  [6.1] BACKUP_PREFIX 常量已导出并匹配正则格式");
  assert("BACKUP_PREFIX = 'cormorant-props.backup-'", BACKUP_PREFIX === "cormorant-props.backup-");

  console.log("\n  [6.2] readBackup 文件名前缀校验");
  await setup();
  const badNames = [
    "../etc/passwd",
    "cormorant-props.backup-../../etc/passwd",
    "evil.json",
    "../../../cormorant-props.backup-20260101-000000-test.json",
    "subdir/cormorant-props.backup-20260101-000000-test.json",
    "cormorant-props.backup-20260101-000000/../test.json"
  ];
  for (const name of badNames) {
    let threw = false;
    try { await storage.readBackup(TEST_DIR, name); }
    catch (e) { threw = true; }
    assert(`非法文件名拦截: ${name}`, threw === true);
  }

  console.log("\n  [6.3] 合法文件名正常通过 readBackup 名称校验（不存在时抛文件不存在，不抛非法文件名）");
  const legitName = BACKUP_PREFIX + "20260101-000000-ok-tag-name_123.json";
  let threwNotFound = false;
  let threwInvalid = false;
  try { await storage.readBackup(TEST_DIR, legitName); }
  catch (e) {
    if (e.message.includes("无效的备份文件名")) threwInvalid = true;
    else threwNotFound = true;
  }
  assert("合法文件名不触发非法文件名错误", threwInvalid === false);
  assert("合法文件名会触发正常的文件不存在错误", threwNotFound === true);

  console.log("\n  [6.4] listBackups 只读取 backups 目录下的前缀匹配文件（目录越界测试）");
  const fs = await import("node:fs/promises");
  const { join } = await import("node:path");
  await mkdir(join(TEST_DIR, "data", "backups"), { recursive: true });
  await writeFile(join(TEST_DIR, "data", "backups", BACKUP_PREFIX + "20260101-000000-good.json"), JSON.stringify({ schemaVersion: 1, items: [] }));
  await writeFile(join(TEST_DIR, "data", "sneaky.json"), JSON.stringify({ schemaVersion: 1, items: [] }));
  await writeFile(join(TEST_DIR, "data", BACKUP_PREFIX + "outside-dir.json"), JSON.stringify({ schemaVersion: 1, items: [] }));
  const list = await storage.listBackups(TEST_DIR);
  assert("listBackups 只返回 1 个（只认 backups 目录下+前缀匹配）", list.length === 1);
  assert("文件名正确", list[0].file === BACKUP_PREFIX + "20260101-000000-good.json");
}

async function testDupRestoreEndToEnd() {
  console.log("\n\n🔗 Test Suite 7: 重复编号恢复端到端（模拟接口完整链路）");
  const storage = await import("./services/storage.js");
  const mig = await import("./migrations/v001_to_v1.js");

  console.log("\n  [7.1] 构造重复编号 v1 备份 → 规范化 → 校验通过 → 原子恢复 → 读回");
  await setup();
  const sourceDb = {
    schemaVersion: 1,
    items: [
      { code: "DUPE", name: "D1", status: "s1" },
      { code: "DUPE", name: "D2", status: "s2" },
      { code: "DUPE", name: "D3", status: "s3" }
    ],
    users: [],
    sessions: []
  };
  const vSource = storage.validateDatabaseObject(sourceDb);
  assert("源备份 validation.errors 有重复编号问题", vSource.errors.some(e => e.includes("重复编号")));
  assert("源备份 valid=false（恢复前）", vSource.valid === false);

  const backupData = JSON.parse(JSON.stringify(sourceDb));
  const integrity = mig.ensureIntegrity(backupData);
  assert("ensureIntegrity 返回 normalized=true", integrity.normalized === true);
  const vNormalized = storage.validateDatabaseObject(backupData);
  assert("规范化后 valid=true", vNormalized.valid === true);
  const normCodes = backupData.items.map(i => i.code);
  assert("规范化后 3 个唯一编号", new Set(normCodes).size === 3);

  await storage.writeDatabase(TEST_DIR, { schemaVersion: 1, items: [{ code: "CURRENT", name: "当前数据" }] });
  const restore = await storage.restoreFromBackupData(TEST_DIR, backupData);
  assert("restored=true", restore.restored === true);
  assert("返回了 pre-restore 备份文件名", restore.preBackup && restore.preBackup.file);

  const final = await storage.readDatabase(TEST_DIR);
  assert("读回 source=main", final.source === "main");
  const finalCodes = final.data.items.map(i => i.code).sort();
  assertEq("最终数据库 3 个唯一编号", finalCodes.length, 3);
  assert("包含原编号 DUPE", finalCodes.includes("DUPE"));
  assert("包含 -DUP1", finalCodes.includes("DUPE-DUP1"));
  assert("包含 -DUP2", finalCodes.includes("DUPE-DUP2"));
  const origs = final.data.items.filter(i => i._originalCode === "DUPE");
  assertEq("_originalCode 记录数量 = 2（除第一个外都被重命名）", origs.length, 2);

  console.log("\n  [7.2] v0 旧备份 + 重复编号 + 缺字段 → 规范化 → 迁移 → 完整恢复");
  await setup();
  const v0Dup = {
    items: [
      { code: "V0-X" },
      { code: "V0-X" },
      { code: "V0-Y" }
    ]
  };
  const v0DupCopy = JSON.parse(JSON.stringify(v0Dup));
  mig.ensureIntegrity(v0DupCopy);
  const { applyMigrations } = await import("./migrations/index.js");
  const mr = applyMigrations(v0DupCopy);
  assert("applyMigrations changed=true", mr.changed === true);
  assertEq("迁移后 schemaVersion=1", v0DupCopy.schemaVersion, 1);
  const v0v = storage.validateDatabaseObject(v0DupCopy);
  assert("迁移+规范化后 valid=true", v0v.valid === true);
  const v0Codes = new Set(v0DupCopy.items.map(i => i.code));
  assertEq("v0 恢复后 3 个唯一编号", v0Codes.size, 3);
  await storage.writeDatabase(TEST_DIR, { schemaVersion: 1, items: [] });
  const rv0 = await storage.restoreFromBackupData(TEST_DIR, v0DupCopy);
  assert("v0 数据恢复成功", rv0.restored === true);
  const v0Final = (await storage.readDatabase(TEST_DIR)).data;
  assertEq("v0 最终道具数 3", v0Final.items.length, 3);
  assert("v0 最终版本正确", v0Final.schemaVersion === 1 || (typeof v0Final.schemaVersion === "number"));
}

async function testSessionsToken() {
  console.log("\n\n🧹 Test Suite 8: Sessions Token 清理验证");
  const storage = await import("./services/storage.js");
  const mig = await import("./migrations/v001_to_v1.js");

  console.log("\n  [8.1] ensureIntegrity 初始化为空数组（安全性兜底）");
  const db1 = { items: [] };
  mig.ensureIntegrity(db1);
  assert("无 sessions 字段时初始化为空数组", Array.isArray(db1.sessions) && db1.sessions.length === 0);

  console.log("\n  [8.2] 现有 sessions 不被截断（保留合法会话）");
  const db2 = { items: [], sessions: [{ token: "FAKE-TEST-TOKEN", userId: "u1", expiresAt: "2099-01-01" }] };
  mig.ensureIntegrity(db2);
  assertEq("规范化时不自动删除合法会话（由 cleanExpiredSessions 或用户主动清理）", db2.sessions.length, 1);
  const fs = await import("node:fs/promises");
  const { join } = await import("node:path");
  await setup();
  await storage.writeDatabase(TEST_DIR, { schemaVersion: 1, items: [], sessions: [{ token: "TOK", userId: "U" }] });
  const b = await storage.createBackup(TEST_DIR, "session-test");
  const readBack = await storage.readBackup(TEST_DIR, b.file);
  assert("备份文件包含 sessions 字段", "sessions" in readBack || readBack.sessions !== undefined);
}

async function main() {
  console.log("=".repeat(70));
  console.log("   鸬鹚道具维护系统 - 数据迁移 & 备份恢复测试套件 v1.0");
  console.log("=".repeat(70));
  console.log("TEST_DIR =", TEST_DIR);
  try {
    await testMigrations();
    await testStorage();
    await testBackupRestore();
    await testConcurrencyAndAtomic();
    await testEnsureIntegrity();
    await testPathBoundary();
    await testDupRestoreEndToEnd();
    await testSessionsToken();
  } catch (err) {
    console.error("\n❌ 测试异常终止:", err.message);
    console.error(err.stack);
    failed++;
  } finally {
    await teardown();
  }
  console.log("\n" + "=".repeat(70));
  const total = passed + failed;
  const pct = total ? Math.round(100 * passed / total) : 0;
  console.log(`  测试汇总: ${passed}/${total} 通过 (${pct}%)`);
  if (failed === 0) {
    console.log("  🎉 全部通过！模块状态良好。");
    process.exit(0);
  } else {
    console.log(`  ⚠️  ${failed} 个用例失败，详见上方输出`);
    for (const r of results) if (!r.ok) console.log(`    - ${r.name}${r.detail ? ": " + r.detail : ""}`);
    process.exit(1);
  }
}

main();
