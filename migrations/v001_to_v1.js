import { defaultUsers } from "../data/seed.js";
import { hashPassword, cleanExpiredSessions } from "../services/auth.js";

export const TARGET_SCHEMA_VERSION = 1;

function ensureId(item, prefix, used) {
  if (item.id) {
    used.add(item.id);
    return item.id;
  }
  let n = 1;
  let candidate;
  do {
    candidate = `${prefix}-${String(n).padStart(3, "0")}`;
    n++;
  } while (used.has(candidate));
  used.add(candidate);
  return candidate;
}

function deduplicateCodes(items, warnings) {
  const seen = new Map();
  items.forEach((it, idx) => {
    if (!it.code) return;
    if (!seen.has(it.code)) {
      seen.set(it.code, [idx]);
    } else {
      seen.get(it.code).push(idx);
    }
  });
  for (const [code, indices] of seen) {
    if (indices.length > 1) {
      warnings.push(`检测到重复编号 ${code}，共 ${indices.length} 处，已自动重命名`);
      for (let i = 1; i < indices.length; i++) {
        const item = items[indices[i]];
        let suffix = 1;
        let newCode;
        do {
          newCode = `${code}-DUP${suffix}`;
          suffix++;
        } while (seen.has(newCode));
        item._originalCode = code;
        item.code = newCode;
        seen.set(newCode, [indices[i]]);
      }
    }
  }
  return items;
}

function ensureItemDefaults(items, warnings) {
  items.forEach((it, idx) => {
    let defs = 0;
    if (!it.id) { it.id = it.code || `ITEM-${idx + 1}`; defs++; }
    if (it.name === undefined || it.name === null || it.name === "") {
      it.name = `未命名道具_${idx + 1}`;
      warnings.push(`items[${idx}] name 缺失，已设为默认值`);
      defs++;
    }
    if (it.purpose === undefined) { it.purpose = ""; defs++; }
    if (it.material === undefined) { it.material = ""; defs++; }
    if (it.wear === undefined) { it.wear = "无"; defs++; }
    if (it.location === undefined) { it.location = ""; defs++; }
    if (it.lastMaintenance === undefined) { it.lastMaintenance = ""; defs++; }
    if (it.status === undefined) { it.status = "可借用"; warnings.push(`items[${idx}] status 缺失，已设为"可借用"`); defs++; }
    if (it.maintenancePlan === undefined) { it.maintenancePlan = null; defs++; }
    if (!Array.isArray(it.borrowings)) { it.borrowings = []; defs++; }
    it.borrowings.forEach(b => {
      if (b.batchId === undefined) b.batchId = null;
    });
    if (!Array.isArray(it.returns)) { it.returns = []; defs++; }
    it.returns.forEach(r => {
      if (!r.id) r.id = `CP-RET-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    });
    if (!Array.isArray(it.logs)) { it.logs = []; defs++; }
    if (!Array.isArray(it.tasks)) { it.tasks = []; defs++; }
  });
  return items;
}

function ensureBatchDefaults(bb, warnings) {
  const used = new Set();
  bb.forEach((b, idx) => {
    if (!b.id) { b.id = ensureId(b, "BATCH", used); warnings.push(`borrowBatches[${idx}] id 缺失，已自动生成`); }
    if (!b.name) { b.name = b.eventName || `批次_${idx + 1}`; }
    if (!Array.isArray(b.itemIds)) { b.itemIds = []; warnings.push(`borrowBatches[${idx}] itemIds 缺失，已初始化为空数组`); }
    if (!Array.isArray(b.logs)) { b.logs = []; }
    if (!b.createdAt) b.createdAt = new Date().toISOString();
  });
  return bb;
}

function ensureRepairDefaults(ro, warnings) {
  const used = new Set();
  ro.forEach((r, idx) => {
    if (!r.id) { r.id = ensureId(r, "CP-REP", used); warnings.push(`repairOrders[${idx}] id 缺失，已自动生成`); }
    if (!r.status) { r.status = "待处理"; }
    if (!r.createdAt) r.createdAt = new Date().toISOString();
    if (!Array.isArray(r.logs)) r.logs = [];
  });
  return ro;
}

function ensureInventoryDefaults(inv, warnings) {
  const used = new Set();
  inv.forEach((i, idx) => {
    if (!i.id) { i.id = ensureId(i, "INV", used); warnings.push(`inventories[${idx}] id 缺失，已自动生成`); }
    if (!Array.isArray(i.results)) { i.results = []; }
    if (i.notes === undefined || i.notes === null) { i.notes = ""; }
  });
  return inv;
}

export function ensureIntegrity(db, options = {}) {
  const warnings = [];
  let normalized = false;
  if (db && typeof db === "object") {
    if (!Array.isArray(db.items)) { db.items = []; normalized = true; }
    const before = JSON.stringify(db.items.map(i => i && i.code));
    deduplicateCodes(db.items, warnings);
    ensureItemDefaults(db.items, warnings);
    if (JSON.stringify(db.items.map(i => i && i.code)) !== before) normalized = true;
    for (const col of ["inventories", "repairOrders", "borrowBatches"]) {
      if (!Array.isArray(db[col])) { db[col] = []; normalized = true; }
    }
    ensureInventoryDefaults(db.inventories, warnings);
    ensureRepairDefaults(db.repairOrders, warnings);
    ensureBatchDefaults(db.borrowBatches, warnings);
    if (!Array.isArray(db.users)) { normalized = true; }
    if (!Array.isArray(db.sessions)) { db.sessions = []; normalized = true; }
  }
  return { normalized, warnings };
}

export function migrate_v0_to_v1(db, options = {}) {
  const warnings = [];
  const info = {};
  let changed = false;

  const fromVersion = db.schemaVersion || 0;
  info.fromVersion = fromVersion;
  info.toVersion = TARGET_SCHEMA_VERSION;

  if (!Array.isArray(db.items)) {
    warnings.push("items 字段不存在或不是数组，已初始化为空数组");
    db.items = [];
    changed = true;
  }

  const beforeCount = db.items.length;
  deduplicateCodes(db.items, warnings);
  ensureItemDefaults(db.items, warnings);
  if (db.items.length > beforeCount || warnings.some(w => w.includes("items"))) changed = true;

  for (const col of ["inventories", "repairOrders", "borrowBatches"]) {
    if (!Array.isArray(db[col])) {
      db[col] = [];
      warnings.push(`${col} 字段不存在，已初始化为空数组`);
      changed = true;
    }
  }

  ensureInventoryDefaults(db.inventories, warnings);
  ensureRepairDefaults(db.repairOrders, warnings);
  ensureBatchDefaults(db.borrowBatches, warnings);
  changed = true;

  if (!Array.isArray(db.users)) {
    db.users = defaultUsers.map(u => ({
      ...u,
      passwordHash: hashPassword(u.password),
      createdAt: u.createdAt || new Date().toISOString()
    }));
    db.users.forEach(u => delete u.password);
    warnings.push("users 字段不存在，已初始化为默认用户");
    changed = true;
  }

  if (!Array.isArray(db.sessions)) {
    db.sessions = [];
    warnings.push("sessions 字段不存在，已初始化为空数组");
    changed = true;
  }

  const cleaned = cleanExpiredSessions(db);
  if (cleaned > 0) {
    warnings.push(`已清理 ${cleaned} 个过期会话`);
    changed = true;
  }

  const existingMig = Array.isArray(db._migrations) ? db._migrations : [];
  db._migrations = existingMig;

  if (!db._migrations.some(m => m.version === TARGET_SCHEMA_VERSION)) {
    db._migrations.push({
      version: TARGET_SCHEMA_VERSION,
      appliedAt: new Date().toISOString(),
      fromVersion,
      warnings: [...warnings]
    });
    changed = true;
  }

  db.schemaVersion = TARGET_SCHEMA_VERSION;
  info.finalVersion = TARGET_SCHEMA_VERSION;
  info.warningsCount = warnings.length;
  info.appliedMigrations = db._migrations.length;

  return { changed, warnings, info };
}
