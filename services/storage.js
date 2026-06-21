import { mkdir, readFile, writeFile, rename, unlink, stat, readdir, copyFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join, basename, resolve } from "node:path";
import { createHash } from "node:crypto";

const BACKUP_PREFIX = "cormorant-props.backup-";
const TMP_SUFFIX = ".tmp-write";
export { BACKUP_PREFIX, TMP_SUFFIX };
const BACKUP_NAME_RE = /^cormorant-props\.backup-[0-9]{8}-[0-9]{6}(?:-[A-Za-z0-9._-]+)?\.json$/;
const PATH_SEP_RE = /[/\\]/;

let writeLock = Promise.resolve();

function acquireLock() {
  let release;
  const next = new Promise(resolve => {
    release = resolve;
  });
  const current = writeLock;
  writeLock = next;
  return current.then(() => release);
}

function timestampLabel() {
  const d = new Date();
  const p = n => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

function checksum(data) {
  return createHash("sha256").update(data).digest("hex");
}

function invalidBackupName(message = "无效的备份文件名") {
  const err = new Error(message);
  err.code = "invalid_filename";
  return err;
}

export function resolveBackupPath(rootDir, fileName) {
  const { backupDir } = resolveDbPaths(rootDir);
  if (typeof fileName !== "string" || fileName.length === 0) {
    throw invalidBackupName("无效的备份文件名：不能为空");
  }
  if (PATH_SEP_RE.test(fileName) || fileName.includes("..")) {
    throw invalidBackupName("无效的备份文件名：包含路径分隔符或目录穿越");
  }
  if (!fileName.startsWith(BACKUP_PREFIX) || !BACKUP_NAME_RE.test(fileName)) {
    throw invalidBackupName("无效的备份文件名格式");
  }
  if (basename(fileName) !== fileName) {
    throw invalidBackupName("无效的备份文件名：必须是纯文件名");
  }

  const resolvedBackupDir = resolve(backupDir);
  const full = resolve(join(backupDir, fileName));
  if (full !== join(resolvedBackupDir, fileName)) {
    throw invalidBackupName("无效的备份文件名：路径越界");
  }
  return full;
}

export function resolveDbPaths(rootDir) {
  const dbPath = join(rootDir, "data", "cormorant-props.json");
  const backupDir = join(rootDir, "data", "backups");
  return { dbPath, backupDir };
}

export async function ensureDirs(rootDir) {
  const { dbPath, backupDir } = resolveDbPaths(rootDir);
  await mkdir(dirname(dbPath), { recursive: true });
  await mkdir(backupDir, { recursive: true });
  return { dbPath, backupDir };
}

export async function readRawJson(filePath) {
  const content = await readFile(filePath, "utf8");
  return JSON.parse(content);
}

export function tryParseJson(text) {
  try {
    return { ok: true, data: JSON.parse(text) };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

async function readWithFallback(filePath, backupDir) {
  try {
    const text = await readFile(filePath, "utf8");
    const parsed = tryParseJson(text);
    if (parsed.ok) {
      return { source: "main", data: parsed.data, raw: text };
    }
    throw new Error("主数据文件 JSON 损坏: " + parsed.error);
  } catch (mainErr) {
    const dir = dirname(filePath);
    const searchDirs = [];
    searchDirs.push(dir);
    if (backupDir && backupDir !== dir) searchDirs.push(backupDir);
    for (const sdir of searchDirs) {
      try {
        const files = await readdir(sdir);
        const backups = files
          .filter(f => f.startsWith(BACKUP_PREFIX))
          .sort()
          .reverse();
        for (const b of backups) {
          try {
            const bp = join(sdir, b);
            const text = await readFile(bp, "utf8");
            const parsed = tryParseJson(text);
            if (parsed.ok) {
              const stripped = { ...parsed.data };
              delete stripped.backupMeta;
              return { source: "backup", data: stripped, raw: text, backupFile: b, recoverFromDir: sdir, recoverError: mainErr.message };
            }
          } catch {}
        }
      } catch {}
    }
    throw mainErr;
  }
}

export async function readDatabase(rootDir) {
  const { dbPath, backupDir } = resolveDbPaths(rootDir);
  await ensureDirs(rootDir);
  if (!existsSync(dbPath)) {
    return null;
  }
  return readWithFallback(dbPath, backupDir);
}

export async function writeDatabase(rootDir, data) {
  const release = await acquireLock();
  try {
    const { dbPath } = resolveDbPaths(rootDir);
    await ensureDirs(rootDir);
    const serialized = JSON.stringify(data, null, 2);
    const tmpPath = dbPath + TMP_SUFFIX + "." + process.pid + "." + Date.now();
    await writeFile(tmpPath, serialized, "utf8");
    const written = await readFile(tmpPath, "utf8");
    if (written !== serialized) {
      await unlink(tmpPath).catch(() => {});
      throw new Error("写入验证失败：临时文件内容不匹配");
    }
    await rename(tmpPath, dbPath);
    return { path: dbPath, checksum: checksum(serialized), bytes: serialized.length };
  } finally {
    release();
  }
}

export async function createBackup(rootDir, tag = "") {
  const { dbPath, backupDir } = resolveDbPaths(rootDir);
  await ensureDirs(rootDir);
  if (!existsSync(dbPath)) {
    return null;
  }
  const label = timestampLabel();
  const suffix = tag ? `-${tag}` : "";
  const backupFile = `${BACKUP_PREFIX}${label}${suffix}.json`;
  const backupPath = join(backupDir, backupFile);
  const content = await readFile(dbPath, "utf8");
  const parsed = tryParseJson(content);
  if (!parsed.ok) {
    throw new Error("备份失败：源数据 JSON 损坏: " + parsed.error);
  }
  const wrapper = {
    backupMeta: {
      createdAt: new Date().toISOString(),
      tag: tag || null,
      schemaVersion: parsed.data.schemaVersion || 0,
      originalChecksum: checksum(content),
      originalBytes: content.length
    },
    ...parsed.data
  };
  await writeFile(backupPath, JSON.stringify(wrapper, null, 2), "utf8");
  const finalSize = (await stat(backupPath)).size;
  const backups = await listBackups(rootDir);
  return {
    file: backupFile,
    path: backupPath,
    size: finalSize,
    createdAt: wrapper.backupMeta.createdAt,
    schemaVersion: wrapper.backupMeta.schemaVersion,
    count: backups.length
  };
}

export async function listBackups(rootDir) {
  const { backupDir } = resolveDbPaths(rootDir);
  if (!existsSync(backupDir)) return [];
  const files = await readdir(backupDir);
  const results = [];
  for (const f of files) {
    if (!f.startsWith(BACKUP_PREFIX) || !f.endsWith(".json")) continue;
    try {
      const full = resolveBackupPath(rootDir, f);
      const s = await stat(full);
      const content = await readFile(full, "utf8");
      const parsed = tryParseJson(content);
      results.push({
        file: f,
        path: full,
        size: s.size,
        mtime: s.mtime.toISOString(),
        schemaVersion: parsed.ok && parsed.data.backupMeta ? parsed.data.backupMeta.schemaVersion : (parsed.ok ? (parsed.data.schemaVersion || 0) : null),
        createdAt: parsed.ok && parsed.data.backupMeta ? parsed.data.backupMeta.createdAt : s.mtime.toISOString(),
        tag: parsed.ok && parsed.data.backupMeta ? parsed.data.backupMeta.tag : null,
        valid: parsed.ok
      });
    } catch {
      // skip
    }
  }
  return results.sort((a, b) => b.mtime.localeCompare(a.mtime));
}

export async function readBackup(rootDir, fileName) {
  const full = resolveBackupPath(rootDir, fileName);
  const content = await readFile(full, "utf8");
  const parsed = tryParseJson(content);
  if (!parsed.ok) {
    throw new Error("备份文件 JSON 损坏: " + parsed.error);
  }
  return parsed.data;
}

export async function restoreFromBackupData(rootDir, backupData, options = {}) {
  const { validateOnly = false, dryRun = false } = options;
  if (!backupData || typeof backupData !== "object") {
    throw new Error("备份数据格式无效：必须是对象");
  }
  const stripped = { ...backupData };
  delete stripped.backupMeta;
  if (validateOnly) {
    return { valid: true, schemaVersion: stripped.schemaVersion || 0 };
  }
  const preBackup = await createBackup(rootDir, "pre-restore");
  if (dryRun) {
    return { wouldRestore: true, preBackup, schemaVersion: stripped.schemaVersion || 0 };
  }
  try {
    const result = await writeDatabase(rootDir, stripped);
    return { restored: true, ...result, preBackup, schemaVersion: stripped.schemaVersion || 0 };
  } catch (writeErr) {
    return { restored: false, error: writeErr.message, preBackup, preserved: true };
  }
}

export async function validateBackupData(rawText) {
  if (typeof rawText !== "string" || rawText.trim().length === 0) {
    return { valid: false, errors: ["备份内容为空"] };
  }
  const parsed = tryParseJson(rawText);
  if (!parsed.ok) {
    return { valid: false, errors: ["JSON 解析失败: " + parsed.error] };
  }
  return validateDatabaseObject(parsed.data);
}

function isNonEmptyArray(v, name, errors) {
  if (!Array.isArray(v)) {
    errors.push(`${name} 必须是数组`);
    return false;
  }
  return true;
}

export function validateDatabaseObject(db) {
  const errors = [];
  const warnings = [];
  const info = {};

  if (!db || typeof db !== "object") {
    return { valid: false, errors: ["数据根必须是对象"], warnings: [], info: {} };
  }

  const schemaVersion = typeof db.schemaVersion === "number" ? db.schemaVersion : 0;
  info.schemaVersion = schemaVersion;

  if (!Array.isArray(db.items)) {
    errors.push("缺少必需字段 items（道具数组）");
  } else {
    info.itemCount = db.items.length;
    const codes = new Map();
    db.items.forEach((it, i) => {
      if (!it || typeof it !== "object") {
        errors.push(`items[${i}] 不是有效对象`);
        return;
      }
      const code = it.code;
      if (!code) {
        warnings.push(`items[${i}] 缺少编号 code 字段`);
      } else if (typeof code !== "string") {
        errors.push(`items[${i}].code 不是字符串`);
      } else {
        if (codes.has(code)) {
          codes.get(code).push(i);
          errors.push(`重复编号: ${code} 出现在 items[${codes.get(code).join(", ")}]`);
        } else {
          codes.set(code, [i]);
        }
      }
      const missingFields = [];
      if (it.name === undefined) missingFields.push("name");
      if (it.status === undefined) missingFields.push("status");
      if (missingFields.length > 0) {
        warnings.push(`items[${i}] 缺少字段: ${missingFields.join(", ")}（将使用默认值迁移）`);
      }
    });
    info.duplicateCodeCount = Array.from(codes.values()).filter(v => v.length > 1).length;
  }

  for (const col of ["inventories", "repairOrders", "borrowBatches", "users", "sessions"]) {
    if (db[col] !== undefined && !Array.isArray(db[col])) {
      errors.push(`${col} 必须是数组`);
    } else if (Array.isArray(db[col])) {
      info[col + "Count"] = db[col].length;
    } else {
      warnings.push(`${col} 不存在（将初始化为空数组）`);
    }
  }

  if (Array.isArray(db.borrowBatches)) {
    db.borrowBatches.forEach((b, i) => {
      if (b && !Array.isArray(b.itemIds)) {
        warnings.push(`borrowBatches[${i}] 缺少 itemIds 数组字段`);
      }
    });
  }

  if (Array.isArray(db.users)) {
    const usernames = new Set();
    db.users.forEach((u, i) => {
      if (!u || typeof u !== "object") {
        errors.push(`users[${i}] 无效`);
        return;
      }
      if (!u.username) {
        warnings.push(`users[${i}] 缺少 username`);
      } else {
        if (usernames.has(u.username)) {
          errors.push(`重复用户名: ${u.username}`);
        }
        usernames.add(u.username);
      }
    });
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    info
  };
}

export async function cleanupOldBackups(rootDir, keepN = 20) {
  const backups = await listBackups(rootDir);
  if (backups.length <= keepN) return { removed: 0, kept: backups.length };
  const toRemove = backups.slice(keepN);
  for (const b of toRemove) {
    await unlink(b.path).catch(() => {});
  }
  return { removed: toRemove.length, kept: keepN };
}
