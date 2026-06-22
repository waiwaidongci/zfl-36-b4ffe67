import { PERMISSIONS } from "../services/auth.js";

export const TARGET_SCHEMA_VERSION = 3;

function buildFirstRound(order) {
  return {
    round: 1,
    processingSteps: order.processingSteps || "",
    materialConsumption: order.materialConsumption || "",
    completionDate: order.completionDate || "",
    acceptanceResult: order.acceptanceResult || "",
    acceptanceDate: order.completionDate || "",
    acceptedBy: "",
    reinspectionResult: "",
    reinspectionDate: "",
    reinspectedBy: "",
    note: ""
  };
}

export function migrate_v2_to_v3(db) {
  const warnings = [];
  const info = {};
  let changed = false;

  const fromVersion = db.schemaVersion || 2;
  info.fromVersion = fromVersion;
  info.toVersion = TARGET_SCHEMA_VERSION;

  if (!Array.isArray(db.repairOrders)) {
    db.repairOrders = [];
    changed = true;
  }

  let migratedCount = 0;
  for (const order of db.repairOrders) {
    let orderChanged = false;

    if (!Array.isArray(order.rounds)) {
      order.rounds = [buildFirstRound(order)];
      orderChanged = true;
      migratedCount++;
    }

    if (typeof order.currentRound !== "number") {
      order.currentRound = 1;
      orderChanged = true;
    }

    if (orderChanged) {
      changed = true;
    }
  }

  if (migratedCount > 0) {
    warnings.push(`已为 ${migratedCount} 个修补工单添加多轮处理记录（rounds）和当前轮次（currentRound）字段`);
  }

  const roles = db.roles || [];
  for (const role of roles) {
    if (!role.permissions.includes(PERMISSIONS.REINSPECT_REPAIR_ORDER)) {
      if (role.id === "admin" || role.id === "maintainer") {
        role.permissions.push(PERMISSIONS.REINSPECT_REPAIR_ORDER);
        changed = true;
        warnings.push(`已为角色 ${role.id} 添加复验权限`);
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
  info.migratedOrders = migratedCount;

  return { changed, warnings, info };
}
