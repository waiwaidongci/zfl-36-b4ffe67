import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  readDatabase,
  writeDatabase,
  createBackup,
  validateDatabaseObject,
  listBackups
} from "../services/storage.js";
import { seed } from "../data/seed.js";
import { migrate_v0_to_v1 } from "./v001_to_v1.js";
import { migrate_v1_to_v2, TARGET_SCHEMA_VERSION as V2_TARGET } from "./v002_to_v2.js";
import { migrate_v2_to_v3, TARGET_SCHEMA_VERSION as V3_TARGET } from "./v003_to_v3.js";
import { ensureIntegrity } from "./v001_to_v1.js";
import { PERMISSIONS } from "../services/auth.js";

const TARGET_SCHEMA_VERSION = V3_TARGET;

const DEFAULT_ROLES = [
  {
    id: "admin",
    name: "admin",
    label: "管理员",
    permissions: Object.values(PERMISSIONS),
    isSystem: true,
    createdAt: "2026-01-01T00:00:00.000Z"
  },
  {
    id: "maintainer",
    name: "maintainer",
    label: "维护员",
    permissions: [
      PERMISSIONS.ADD_LOG,
      PERMISSIONS.RETURN_ITEM,
      PERMISSIONS.COMPLETE_MAINTENANCE,
      PERMISSIONS.CREATE_INVENTORY,
      PERMISSIONS.CREATE_REPAIR_ORDER,
      PERMISSIONS.UPDATE_REPAIR_ORDER,
      PERMISSIONS.COMPLETE_REPAIR_ORDER,
      PERMISSIONS.REINSPECT_REPAIR_ORDER,
      PERMISSIONS.ADD_BATCH_LOG,
      PERMISSIONS.VIEW_BACKUPS,
      PERMISSIONS.DOWNLOAD_BACKUP
    ],
    isSystem: true,
    createdAt: "2026-01-01T00:00:00.000Z"
  },
  {
    id: "viewer",
    name: "viewer",
    label: "只读用户",
    permissions: [PERMISSIONS.VIEW_BACKUPS],
    isSystem: true,
    createdAt: "2026-01-01T00:00:00.000Z"
  }
];

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = join(__dirname, "..");

export { TARGET_SCHEMA_VERSION, ensureIntegrity };

const MIGRATIONS = [
  { from: 0, to: 1, run: migrate_v0_to_v1 },
  { from: 1, to: 2, run: migrate_v1_to_v2 },
  { from: 2, to: 3, run: migrate_v2_to_v3 }
];

export function getMigrations() {
  return [...MIGRATIONS];
}

export function currentVersion(db) {
  return db && typeof db.schemaVersion === "number" ? db.schemaVersion : 0;
}

export function needsMigration(db) {
  return currentVersion(db) < TARGET_SCHEMA_VERSION;
}

export function applyMigrations(db) {
  let allWarnings = [];
  let allChanged = false;
  const steps = [];

  for (const mig of MIGRATIONS) {
    const ver = currentVersion(db);
    if (ver === mig.from && ver < mig.to) {
      const result = mig.run(db);
      if (result.warnings) allWarnings = allWarnings.concat(result.warnings);
      if (result.changed) allChanged = true;
      steps.push({ from: mig.from, to: mig.to, ...result });
    }
  }

  return {
    changed: allChanged,
    warnings: allWarnings,
    steps,
    finalVersion: currentVersion(db)
  };
}

export async function loadAndMigrate() {
  const readResult = await readDatabase(ROOT_DIR);

  if (readResult === null) {
    const fresh = {
      schemaVersion: TARGET_SCHEMA_VERSION,
      _migrations: [{
        version: TARGET_SCHEMA_VERSION,
        appliedAt: new Date().toISOString(),
        fromVersion: 0,
        seed: true,
        warnings: []
      }],
      ...seed,
      users: undefined
    };
    const seeded = {
      ...fresh,
      users: undefined
    };
    migrate_v0_to_v1(seeded);
    migrate_v1_to_v2(seeded);
    migrate_v2_to_v3(seeded);
    await writeDatabase(ROOT_DIR, seeded);
    return {
      fresh: true,
      db: seeded,
      steps: [],
      warnings: [],
      recovery: null,
      backupCreated: null
    };
  }

  const db = readResult.data;
  const recovery = readResult.source === "backup"
    ? { fromBackup: readResult.backupFile, error: readResult.recoverError }
    : null;

  const beforeVersion = currentVersion(db);

  let backupCreated = null;
  if (needsMigration(db) || recovery) {
    try {
      backupCreated = await createBackup(
        ROOT_DIR,
        recovery ? `pre-migration-recovered-from-${readResult.backupFile}` : `pre-migration-v${beforeVersion}`
      );
    } catch (backupErr) {
      // backup failure shouldn't block migration
    }
  }

  const result = applyMigrations(db);

  if (recovery && !result.changed) {
    result.changed = true;
  }

  const vres = validateDatabaseObject(db);
  if (vres.errors.length > 0) {
    result.warnings.push(`迁移后验证发现 ${vres.errors.length} 个错误: ${vres.errors.join("; ")}`);
  }

  if (result.changed) {
    await writeDatabase(ROOT_DIR, db);
  }

  return {
    fresh: false,
    db,
    steps: result.steps,
    warnings: result.warnings,
    finalVersion: result.finalVersion,
    beforeVersion,
    recovery,
    backupCreated,
    validation: vres
  };
}

export async function getMigrationStatus() {
  const readResult = await readDatabase(ROOT_DIR);
  if (readResult === null) {
    return { exists: false, needsInit: true, targetVersion: TARGET_SCHEMA_VERSION };
  }
  const db = readResult.data;
  const ver = currentVersion(db);
  const backups = await listBackups(ROOT_DIR);
  return {
    exists: true,
    currentVersion: ver,
    targetVersion: TARGET_SCHEMA_VERSION,
    needsMigration: needsMigration(db),
    migrations: db._migrations || [],
    recovery: readResult.source === "backup" ? readResult.backupFile : null,
    backupCount: backups.length,
    latestBackup: backups[0] || null,
    validation: validateDatabaseObject(db)
  };
}

export { ROOT_DIR };
