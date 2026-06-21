import {
  loadDb,
  saveDb,
  send,
  sendFile,
  createBackup,
  listBackups,
  readBackup,
  validateBackupData,
  validateDatabaseObject,
  restoreFromBackupData,
  cleanupOldBackups,
  getMigrationStatus,
  getLastLoadInfo,
  tryParseJson,
  TARGET_SCHEMA_VERSION,
  ROOT_DIR,
  resolveBackupPath
} from "../db.js";
import { requirePermission, getCurrentUser } from "./auth.js";
import { PERMISSIONS } from "../services/auth.js";
import { applyMigrations, needsMigration, ensureIntegrity } from "../migrations/index.js";
import { join } from "node:path";

function formatSize(bytes) {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(2) + " MB";
}

function assertSafeBackupFilename(fileName, backupDir) {
  try {
    return resolveBackupPath(ROOT_DIR, fileName);
  } catch (err) {
    err.statusCode = 400;
    throw err;
  }
}

function backupFilename(label) {
  const d = new Date();
  const p = n => String(n).padStart(2, "0");
  const ts = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
  return `cormorant-props-${label || "backup"}-${ts}.json`;
}

export async function handleBackup(req, res, url) {
  if (url.pathname === "/api/backup/info" && req.method === "GET") {
    const user = await requirePermission(req, res, PERMISSIONS.VIEW_BACKUPS);
    if (!user) return;

    const status = await getMigrationStatus();
    const loadInfo = getLastLoadInfo();
    const backups = await listBackups(ROOT_DIR);

    return send(res, 200, {
      schema: {
        currentVersion: status.currentVersion || 0,
        targetVersion: status.targetVersion,
        needsMigration: status.needsMigration,
        migrations: status.migrations || [],
        recovery: status.recovery
      },
      startup: loadInfo ? {
        loadedAt: loadInfo.loadedAt,
        fresh: loadInfo.fresh,
        beforeVersion: loadInfo.beforeVersion,
        finalVersion: loadInfo.finalVersion,
        recovery: loadInfo.recovery,
        backupCreated: loadInfo.backupCreated,
        warnings: loadInfo.warnings,
        validation: loadInfo.validation
      } : null,
      backups: backups.map(b => ({
        file: b.file,
        size: b.size,
        sizeText: formatSize(b.size),
        mtime: b.mtime,
        createdAt: b.createdAt,
        schemaVersion: b.schemaVersion,
        tag: b.tag,
        valid: b.valid
      })),
      backupCount: backups.length,
      targetVersion: TARGET_SCHEMA_VERSION
    });
  }

  if (url.pathname === "/api/backup/download" && req.method === "GET") {
    const user = await requirePermission(req, res, PERMISSIONS.DOWNLOAD_BACKUP);
    if (!user) return;

    const db = await loadDb();
    const snapshotBackup = await createBackup(ROOT_DIR, `user-${user.username}-download`);

    const wrapper = {
      backupMeta: {
        createdAt: new Date().toISOString(),
        generatedBy: user.username,
        schemaVersion: db.schemaVersion || 0,
        generator: "user-download",
        snapshotFile: snapshotBackup ? snapshotBackup.file : null
      },
      ...db
    };

    const content = JSON.stringify(wrapper, null, 2);
    const fname = backupFilename(`v${db.schemaVersion || 0}`);
    return sendFile(res, 200, content, fname, "application/json");
  }

  if (url.pathname.startsWith("/api/backup/file/") && req.method === "GET") {
    const user = await requirePermission(req, res, PERMISSIONS.DOWNLOAD_BACKUP);
    if (!user) return;

    const backupDir = join(ROOT_DIR, "data", "backups");
    const fileName = decodeURIComponent(url.pathname.slice("/api/backup/file/".length));
    try {
      assertSafeBackupFilename(fileName, backupDir);
      const data = await readBackup(ROOT_DIR, fileName);
      const content = JSON.stringify(data, null, 2);
      return sendFile(res, 200, content, fileName, "application/json");
    } catch (err) {
      if (err.statusCode) {
        return send(res, err.statusCode, { error: err.code || "invalid_filename", message: err.message });
      }
      return send(res, 404, { error: "backup_not_found", message: err.message });
    }
  }

  if (url.pathname === "/api/backup/create" && req.method === "POST") {
    const user = await requirePermission(req, res, PERMISSIONS.DOWNLOAD_BACKUP);
    if (!user) return;

    const tag = `manual-${user.username}`;
    try {
      const result = await createBackup(ROOT_DIR, tag);
      if (!result) {
        return send(res, 400, { error: "no_data", message: "当前没有可备份的数据" });
      }
      return send(res, 201, {
        file: result.file,
        size: result.size,
        sizeText: formatSize(result.size),
        createdAt: result.createdAt,
        schemaVersion: result.schemaVersion
      });
    } catch (err) {
      return send(res, 500, { error: "backup_failed", message: err.message });
    }
  }

  if (url.pathname === "/api/backup/precheck" && req.method === "POST") {
    const user = await requirePermission(req, res, PERMISSIONS.RESTORE_BACKUP);
    if (!user) return;

    try {
      const content = await reqBodyText(req);
      if (!content || content.trim().length === 0) {
        return send(res, 400, { error: "empty_content", message: "上传内容为空" });
      }

      const maxBytes = 50 * 1024 * 1024;
      if (Buffer.byteLength(content, "utf8") > maxBytes) {
        return send(res, 400, { error: "too_large", message: `文件过大，上限 ${formatSize(maxBytes)}` });
      }

      const parseResult = tryParseJson(content);
      if (!parseResult.ok) {
        return send(res, 400, {
          error: "invalid_json",
          message: "JSON 解析失败: " + parseResult.error,
          canRestore: false
        });
      }

      const rawData = parseResult.data;
      const isWrapped = rawData && rawData.backupMeta && typeof rawData.backupMeta === "object";
      const actualData = isWrapped ? (() => {
        const stripped = { ...rawData };
        delete stripped.backupMeta;
        return stripped;
      })() : rawData;

      const rawValidation = validateDatabaseObject(actualData);

      const normalized = JSON.parse(JSON.stringify(actualData));
      const integrity = ensureIntegrity(normalized);

      const originalVersion = typeof normalized.schemaVersion === "number" ? normalized.schemaVersion : 0;
      const willMigrate = needsMigration({ schemaVersion: originalVersion });

      let migratedPreview = null;
      let migrationWarnings = [...integrity.warnings];
      const finalCandidate = normalized;

      const postIntegrityValidation = validateDatabaseObject(finalCandidate);

      if (willMigrate) {
        try {
          const toMigrate = JSON.parse(JSON.stringify(finalCandidate));
          const mres = applyMigrations(toMigrate);
          migrationWarnings = migrationWarnings.concat(mres.warnings);
          const postV = validateDatabaseObject(toMigrate);
          migratedPreview = {
            finalVersion: mres.finalVersion,
            warnings: mres.warnings,
            steps: mres.steps.map(s => ({ from: s.from, to: s.to, warningsCount: (s.warnings || []).length })),
            postValidation: postV
          };
          finalCandidate.schemaVersion = mres.finalVersion;
        } catch (migErr) {
          migrationWarnings.push("预览迁移失败: " + migErr.message);
        }
      }

      const finalValidation = migratedPreview ? (migratedPreview.postValidation || postIntegrityValidation) : postIntegrityValidation;
      const canRestore = finalValidation.valid;

      return send(res, 200, {
        canRestore,
        parseOk: true,
        isWrapped,
        backupMeta: isWrapped ? rawData.backupMeta : null,
        originalVersion,
        willMigrate,
        targetVersion: TARGET_SCHEMA_VERSION,
        validation: rawValidation,
        normalized: {
          applied: integrity.normalized,
          warnings: integrity.warnings,
          postValidation: postIntegrityValidation
        },
        summary: {
          items: actualData.items ? actualData.items.length : 0,
          inventories: actualData.inventories ? actualData.inventories.length : 0,
          repairOrders: actualData.repairOrders ? actualData.repairOrders.length : 0,
          borrowBatches: actualData.borrowBatches ? actualData.borrowBatches.length : 0,
          users: actualData.users ? actualData.users.length : 0,
          sessions: actualData.sessions ? actualData.sessions.length : 0,
          bytes: Buffer.byteLength(content, "utf8"),
          bytesText: formatSize(Buffer.byteLength(content, "utf8"))
        },
        duplicateCodes: findDuplicateCodes(actualData),
        migrationWarnings,
        migratedPreview,
        dangerFlags: buildDangerFlags(rawValidation, actualData, { willMigrate, integrityApplied: integrity.normalized, postIntegrityValid: postIntegrityValidation.valid })
      });

    } catch (err) {
      if (err.statusCode) {
        return send(res, err.statusCode, { error: err.code || "bad_request", message: err.message });
      }
      return send(res, 500, { error: "precheck_failed", message: err.message });
    }
  }

  if (url.pathname === "/api/backup/restore" && req.method === "POST") {
    const user = await requirePermission(req, res, PERMISSIONS.RESTORE_BACKUP);
    if (!user) return;

    try {
      const content = await reqBodyText(req);
      if (!content || content.trim().length === 0) {
        return send(res, 400, { error: "empty_content", message: "上传内容为空", restored: false });
      }

      const parseResult = tryParseJson(content);
      if (!parseResult.ok) {
        return send(res, 400, { error: "invalid_json", message: "JSON 解析失败: " + parseResult.error, restored: false });
      }

      const rawData = parseResult.data;
      const isWrapped = rawData && rawData.backupMeta && typeof rawData.backupMeta === "object";
      const actualData = isWrapped ? (() => {
        const stripped = { ...rawData };
        delete stripped.backupMeta;
        return stripped;
      })() : rawData;

      const rawValidation = validateDatabaseObject(actualData);
      const integrity = ensureIntegrity(actualData);

      const willMigrate = needsMigration({ schemaVersion: actualData.schemaVersion || 0 });
      let finalData = actualData;
      let migrationResult = null;
      let normalization = {
        integrityApplied: integrity.normalized,
        integrityWarnings: integrity.warnings,
        willMigrate
      };

      if (willMigrate) {
        const mres = applyMigrations(finalData);
        migrationResult = {
          finalVersion: mres.finalVersion,
          warnings: mres.warnings,
          steps: mres.steps.map(s => ({ from: s.from, to: s.to })),
          changed: mres.changed
        };
        normalization.migrationApplied = true;
        normalization.migrationWarnings = mres.warnings;
      } else {
        migrationResult = {
          finalVersion: finalData.schemaVersion || TARGET_SCHEMA_VERSION,
          warnings: integrity.warnings,
          steps: [],
          changed: integrity.normalized
        };
      }

      const validation = validateDatabaseObject(finalData);
      if (validation.errors.length > 0) {
        return send(res, 400, {
          error: "validation_failed",
          message: `数据验证失败，共 ${validation.errors.length} 个错误（经过规范化和迁移后仍存在，请修复后重试）`,
          errors: validation.errors,
          warnings: validation.warnings,
          normalization,
          rawValidation,
          restored: false
        });
      }

      const currentDb = await loadDb();
      const preSnapshotData = JSON.parse(JSON.stringify(currentDb));

      const restoreResult = await restoreFromBackupData(ROOT_DIR, finalData);

      if (!restoreResult.restored) {
        return send(res, 500, {
          error: "restore_failed",
          message: restoreResult.error || "写入失败",
          restored: false,
          preserved: restoreResult.preserved !== false,
          preBackup: restoreResult.preBackup,
          normalization
        });
      }

      const restoredCheck = await loadDb({ force: true });
      const postValidation = validateDatabaseObject(restoredCheck);

      return send(res, 200, {
        restored: true,
        preserved: true,
        preBackup: restoreResult.preBackup,
        wroteBytes: restoreResult.bytes,
        wroteChecksum: restoreResult.checksum,
        schemaVersion: restoredCheck.schemaVersion,
        migration: migrationResult,
        normalization,
        rawValidation,
        postValidation,
        restoredBy: user.username,
        restoredAt: new Date().toISOString(),
        summary: {
          items: restoredCheck.items ? restoredCheck.items.length : 0,
          users: restoredCheck.users ? restoredCheck.users.length : 0
        }
      });

    } catch (err) {
      if (err.statusCode) {
        return send(res, err.statusCode, { error: err.code || "bad_request", message: err.message, restored: false });
      }
      return send(res, 500, { error: "restore_failed", message: err.message, restored: false });
    }
  }

  if (url.pathname === "/api/backup/cleanup" && req.method === "POST") {
    const user = await requirePermission(req, res, PERMISSIONS.RESTORE_BACKUP);
    if (!user) return;

    const input = await safeBody(req, {});
    const keep = Math.min(Math.max(parseInt(input.keep, 10) || 10, 3), 100);
    const result = await cleanupOldBackups(ROOT_DIR, keep);
    return send(res, 200, result);
  }

  const deleteMatch = url.pathname.match(/^\/api\/backup\/file\/([^/]+)$/);
  if (deleteMatch && req.method === "DELETE") {
    const user = await requirePermission(req, res, PERMISSIONS.RESTORE_BACKUP);
    if (!user) return;
    try {
      const fs = await import("node:fs/promises");
      const backupDir = join(ROOT_DIR, "data", "backups");
      const fileName = decodeURIComponent(deleteMatch[1]);
      const full = assertSafeBackupFilename(fileName, backupDir);
      await fs.unlink(full);
      return send(res, 200, { deleted: true, file: fileName });
    } catch (err) {
      if (err.statusCode) {
        return send(res, err.statusCode, { error: err.code || "delete_failed", message: err.message });
      }
      return send(res, 500, { error: "delete_failed", message: err.message });
    }
  }

  return null;
}

async function reqBodyText(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

async function safeBody(req, fallback) {
  try {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const buf = Buffer.concat(chunks);
    if (buf.length === 0) return fallback;
    return JSON.parse(buf.toString("utf8"));
  } catch {
    return fallback;
  }
}

function findDuplicateCodes(db) {
  if (!Array.isArray(db.items)) return [];
  const map = new Map();
  db.items.forEach((it, i) => {
    if (!it.code) return;
    if (!map.has(it.code)) map.set(it.code, []);
    map.get(it.code).push({ index: i, code: it.code, name: it.name || "(无名称)" });
  });
  return Array.from(map.entries())
    .filter(([_, arr]) => arr.length > 1)
    .map(([code, arr]) => ({ code, occurrences: arr }));
}

function buildDangerFlags(validation, data, ctx = {}) {
  const { willMigrate = false, integrityApplied = false, postIntegrityValid = false } = ctx;
  const flags = [];
  if (!data || !Array.isArray(data.items) || data.items.length === 0) {
    flags.push({ level: "critical", code: "EMPTY_ITEMS", message: "备份中不包含任何道具数据" });
  }
  if (!data || !Array.isArray(data.users) || data.users.length === 0) {
    flags.push({ level: "warn", code: "EMPTY_USERS", message: "备份中不包含用户，将恢复为默认用户", autoFix: willMigrate || integrityApplied });
  }
  const dupCodes = findDuplicateCodes(data);
  if (dupCodes.length > 0) {
    flags.push({
      level: "warn",
      code: "DUPLICATE_CODES",
      message: `检测到 ${dupCodes.length} 组重复编号，恢复时将自动重命名（保留第一个，其余追加 -DUPx 后缀）`,
      autoFix: true
    });
  }
  if (validation && validation.warnings && validation.warnings.length > 10) {
    flags.push({ level: "info", code: "MANY_WARNINGS", message: `验证共 ${validation.warnings.length} 条警告，部分字段缺失将使用默认值`, autoFix: true });
  }
  if (typeof data.schemaVersion !== "number") {
    flags.push({ level: "info", code: "NO_SCHEMA_VERSION", message: "备份无 schemaVersion，将视为 v0 进行迁移", autoFix: willMigrate });
  }
  if (postIntegrityValid && integrityApplied) {
    flags.push({ level: "success", code: "NORMALIZATION_OK", message: "完整性规范化后数据合法，可安全恢复" });
  }
  return flags;
}
