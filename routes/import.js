import { loadDb, saveDb, body, send } from "../db.js";
import { parseCSV, buildItem, findDuplicates } from "../lib/csvParser.js";
import { requirePermission } from "./auth.js";
import { PERMISSIONS } from "../services/auth.js";

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

    const duplicateCodes = new Set(duplicates.map(d => d.code));
    const validItems = success.filter(item => !duplicateCodes.has(item.code));

    return send(res, 200, {
      validCount: validItems.length,
      errorCount: errors.length + duplicates.length,
      items: validItems,
      errors: errors,
      duplicates: duplicates
    });
  }

  if (req.method === "POST" && url.pathname === "/api/import/commit") {
    const user = await requirePermission(req, res, PERMISSIONS.IMPORT_ITEMS);
    if (!user) return;
    const input = await body(req);
    const items = input.items || [];

    if (!Array.isArray(items) || items.length === 0) {
      return send(res, 400, { error: "没有可导入的数据" });
    }

    const db = await loadDb();
    const existingCodes = new Set(db.items.map(i => i.code));
    const finalItems = [];
    const skipped = [];

    for (const item of items) {
      if (!item.code || existingCodes.has(item.code)) {
        skipped.push({ code: item.code, reason: "编号为空或已存在" });
        continue;
      }
      const built = buildItem(item);
      db.items.unshift(built);
      existingCodes.add(built.code);
      finalItems.push(built);
    }

    await saveDb(db);

    return send(res, 200, {
      imported: finalItems.length,
      skipped: skipped.length,
      items: finalItems,
      skippedItems: skipped
    });
  }

  return null;
}
