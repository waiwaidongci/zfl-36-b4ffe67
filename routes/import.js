import { loadDb, saveDb, body, send } from "../db.js";
import { parseCSV, buildItem, findDuplicates, analyzeDuplicateItems, updateItemFields } from "../lib/csvParser.js";
import { requirePermission } from "./auth.js";
import { PERMISSIONS } from "../services/auth.js";

export const IMPORT_MODES = {
  INSERT_ONLY: "insert_only",
  UPDATE_ONLY: "update_only",
  INSERT_AND_UPDATE: "insert_and_update"
};

export async function handleImport(req, res, url) {
  if (req.method === "POST" && url.pathname === "/api/import/preview") {
    const user = await requirePermission(req, res, PERMISSIONS.IMPORT_ITEMS);
    if (!user) return;
    const input = await body(req);
    const csvText = input.csvText || "";

    if (!csvText.trim()) {
      return send(res, 400, { error: "CSV内容不能为空" });
    }

    const { success, errors } = parseCSV(csvText);
    const db = await loadDb();
    const duplicates = findDuplicates(success, db.items);

    const dupItemsFromFile = duplicates.filter(d => d.reason === "导入数据中重复");
    const dupItemsFromDb = duplicates.filter(d => d.reason === "编号已存在于数据库");

    const duplicateCodesFromFile = new Set(dupItemsFromFile.map(d => d.code));
    const validForInsert = success.filter(item => !duplicateCodesFromFile.has(item.code));

    const analyzedDuplicates = analyzeDuplicateItems(success, dupItemsFromDb, db.items);
    const duplicateCodesFromDb = new Set(analyzedDuplicates.map(d => d.code));

    const newItems = validForInsert.filter(item => !duplicateCodesFromDb.has(item.code));
    const existingItems = validForInsert.filter(item => duplicateCodesFromDb.has(item.code));

    return send(res, 200, {
      newCount: newItems.length,
      updateCount: analyzedDuplicates.filter(d => d.hasChanges).length,
      unchangedCount: analyzedDuplicates.filter(d => !d.hasChanges).length,
      fileDuplicateCount: dupItemsFromFile.length,
      errorCount: errors.length + dupItemsFromFile.length,
      newItems: newItems,
      updateItems: analyzedDuplicates,
      errors: errors,
      fileDuplicates: dupItemsFromFile,
      modes: Object.values(IMPORT_MODES)
    });
  }

  if (req.method === "POST" && url.pathname === "/api/import/commit") {
    const user = await requirePermission(req, res, PERMISSIONS.IMPORT_ITEMS);
    if (!user) return;
    const input = await body(req);
    const { items = [], mode = IMPORT_MODES.INSERT_ONLY } = input;

    if (!Array.isArray(items) || items.length === 0) {
      return send(res, 400, { error: "没有可导入的数据" });
    }

    if (!Object.values(IMPORT_MODES).includes(mode)) {
      return send(res, 400, { error: "无效的导入模式" });
    }

    const db = await loadDb();
    const existingCodes = new Set(db.items.map(i => i.code));
    const existingByCode = new Map(db.items.map(i => [i.code, i]));

    const inserted = [];
    const updated = [];
    const unchanged = [];
    const skipped = [];

    for (const item of items) {
      if (!item.code) {
        skipped.push({ code: item.code, reason: "编号为空" });
        continue;
      }

      const exists = existingCodes.has(item.code);

      if (mode === IMPORT_MODES.INSERT_ONLY) {
        if (exists) {
          skipped.push({ code: item.code, reason: "编号已存在（仅新增模式）" });
          continue;
        }
        const built = buildItem(item);
        db.items.unshift(built);
        existingCodes.add(built.code);
        inserted.push(built);
      } else if (mode === IMPORT_MODES.UPDATE_ONLY) {
        if (!exists) {
          skipped.push({ code: item.code, reason: "编号不存在（仅更新模式）" });
          continue;
        }
        const existingItem = existingByCode.get(item.code);
        const result = updateItemFields(existingItem, item, user.displayName);
        if (result.updated) {
          updated.push(result.item);
        } else {
          unchanged.push(result.item);
        }
      } else if (mode === IMPORT_MODES.INSERT_AND_UPDATE) {
        if (!exists) {
          const built = buildItem(item);
          db.items.unshift(built);
          existingCodes.add(built.code);
          inserted.push(built);
        } else {
          const existingItem = existingByCode.get(item.code);
          const result = updateItemFields(existingItem, item, user.displayName);
          if (result.updated) {
            updated.push(result.item);
          } else {
            unchanged.push(result.item);
          }
        }
      }
    }

    await saveDb(db);

    return send(res, 200, {
      inserted: inserted.length,
      updated: updated.length,
      unchanged: unchanged.length,
      skipped: skipped.length,
      insertedItems: inserted,
      updatedItems: updated,
      unchangedItems: unchanged,
      skippedItems: skipped,
      mode
    });
  }

  return null;
}
