import { PERMISSIONS } from "../services/auth.js";

export const TARGET_SCHEMA_VERSION = 2;

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

export function migrate_v1_to_v2(db) {
  const warnings = [];
  const info = {};
  let changed = false;

  const fromVersion = db.schemaVersion || 1;
  info.fromVersion = fromVersion;
  info.toVersion = TARGET_SCHEMA_VERSION;

  if (!Array.isArray(db.roles)) {
    db.roles = JSON.parse(JSON.stringify(DEFAULT_ROLES));
    warnings.push("roles 字段不存在，已初始化为默认系统角色");
    changed = true;
  } else {
    for (const defRole of DEFAULT_ROLES) {
      const existing = db.roles.find(r => r.id === defRole.id);
      if (!existing) {
        db.roles.push(JSON.parse(JSON.stringify(defRole)));
        warnings.push(`系统角色 ${defRole.id} 缺失，已自动补充`);
        changed = true;
      } else {
        if (!existing.isSystem) {
          existing.isSystem = true;
          changed = true;
        }
      }
    }
  }

  const existingMig = Array.isArray(db._migrations) ? db._migrations : [];
  if (!existingMig.some(m => m.version === TARGET_SCHEMA_VERSION)) {
    db._migrations = existingMig;
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

  return { changed, warnings, info };
}
