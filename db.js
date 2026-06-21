import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { seed, defaultUsers } from "./data/seed.js";
import { hashPassword, cleanExpiredSessions } from "./services/auth.js";
import {
  writeDatabase,
  createBackup,
  listBackups,
  readBackup,
  validateBackupData,
  validateDatabaseObject,
  restoreFromBackupData,
  cleanupOldBackups,
  ensureDirs,
  resolveDbPaths,
  resolveBackupPath,
  tryParseJson,
  BACKUP_PREFIX
} from "./services/storage.js";
import {
  loadAndMigrate,
  getMigrationStatus,
  ROOT_DIR,
  TARGET_SCHEMA_VERSION
} from "./migrations/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const dbPath = join(__dirname, "data", "cormorant-props.json");

export { dbPath };
export {
  createBackup,
  listBackups,
  readBackup,
  validateBackupData,
  validateDatabaseObject,
  restoreFromBackupData,
  cleanupOldBackups,
  getMigrationStatus,
  ensureDirs,
  resolveDbPaths,
  resolveBackupPath,
  TARGET_SCHEMA_VERSION,
  ROOT_DIR,
  BACKUP_PREFIX,
  tryParseJson
};

export function legacyMigrateDb(db) {
  let changed = false;
  if (!Array.isArray(db.borrowBatches)) {
    db.borrowBatches = [];
    changed = true;
  }
  for (const item of db.items) {
    if (!Array.isArray(item.borrowings)) {
      item.borrowings = [];
      changed = true;
    }
    for (const b of item.borrowings) {
      if (b.batchId === undefined) {
        b.batchId = null;
        changed = true;
      }
    }
  }
  if (!Array.isArray(db.users)) {
    db.users = defaultUsers.map(u => ({
      ...u,
      passwordHash: hashPassword(u.password),
      createdAt: u.createdAt || new Date().toISOString()
    }));
    db.users.forEach(u => delete u.password);
    changed = true;
  }
  if (!Array.isArray(db.sessions)) {
    db.sessions = [];
    changed = true;
  }
  const cleaned = cleanExpiredSessions(db);
  if (cleaned > 0) {
    changed = true;
  }
  return changed;
}

let cachedDb = null;
let cacheTime = 0;
const CACHE_TTL_MS = 500;
let lastLoadInfo = null;

function cacheGet() {
  if (cachedDb && Date.now() - cacheTime < CACHE_TTL_MS) {
    return cachedDb;
  }
  return null;
}

function cacheSet(db) {
  cachedDb = db;
  cacheTime = Date.now();
}

function cacheInvalidate() {
  cachedDb = null;
  cacheTime = 0;
}

export async function loadDb(options = {}) {
  const { force = false } = options;
  if (!force) {
    const cached = cacheGet();
    if (cached) return cached;
  }
  const result = await loadAndMigrate();
  lastLoadInfo = {
    loadedAt: new Date().toISOString(),
    fresh: result.fresh,
    beforeVersion: result.beforeVersion,
    finalVersion: result.finalVersion,
    recovery: result.recovery,
    backupCreated: result.backupCreated,
    warnings: result.warnings,
    validation: result.validation
  };
  cacheSet(result.db);
  return result.db;
}

export function getLastLoadInfo() {
  return lastLoadInfo;
}

export async function saveDb(db, options = {}) {
  const { createSnapshot = false, tag = "" } = options;
  if (typeof db.schemaVersion !== "number") {
    db.schemaVersion = TARGET_SCHEMA_VERSION;
  }
  const result = await writeDatabase(ROOT_DIR, db);
  cacheSet(db);
  if (createSnapshot) {
    try {
      await createBackup(ROOT_DIR, tag || "snapshot");
    } catch {
      // ignore backup failure
    }
  }
  return result;
}

export async function body(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const buf = Buffer.concat(chunks);
  if (buf.length === 0) return {};
  const text = buf.toString("utf8");
  try {
    return JSON.parse(text);
  } catch (err) {
    const error = new Error("请求体 JSON 解析失败: " + err.message);
    error.statusCode = 400;
    error.code = "INVALID_JSON";
    throw error;
  }
}

export async function bodyRaw(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

export function send(res, status, data) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data, null, 2));
}

export function sendFile(res, status, content, filename, contentType = "application/json") {
  res.writeHead(status, {
    "Content-Type": `${contentType}; charset=utf-8`,
    "Content-Disposition": `attachment; filename="${encodeURIComponent(filename)}"`,
    "Content-Length": Buffer.byteLength(content, "utf8")
  });
  res.end(content);
}

export function html(res, text) {
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(text);
}

export function newId() {
  return "CP-" + Date.now();
}

export function newBatchId() {
  return "BATCH-" + Date.now();
}

export function newUserId() {
  return "USER-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8);
}

export function summarize(item) {
  const logCount = (item.logs || []).length + (item.tasks || []).reduce((n, t) => n + (t.logs || []).length, 0);
  return { ...item, logCount };
}
