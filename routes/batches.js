import { loadDb, saveDb, body, send, newBatchId, newId } from "../db.js";
import { requirePermission } from "./auth.js";
import { PERMISSIONS } from "../services/auth.js";

function findBatch(db, id) {
  return db.borrowBatches.find(b => b.id === id);
}

function findItem(db, identifier) {
  return db.items.find(x => x.id === identifier || x.code === identifier);
}

function summarizeBatch(batch, db) {
  const items = (batch.itemIds || []).map(id => {
    const item = findItem(db, id);
    if (!item) return { id, notFound: true };
    const lastBorrowing = (item.borrowings || []).filter(b => b.batchId === batch.id).slice(-1)[0];
    const isBorrowed = item.status === "已借出" || item.status === "待归还";
    const stillBorrowed = isBorrowed && !!lastBorrowing;
    return {
      id: item.id || item.code,
      code: item.code,
      name: item.name,
      status: item.status,
      wear: item.wear,
      stillBorrowed,
      borrower: lastBorrowing ? lastBorrowing.borrower : "",
      dueDate: lastBorrowing ? lastBorrowing.dueDate : "",
      borrowedAt: lastBorrowing ? lastBorrowing.at : ""
    };
  });
  const notReturned = items.filter(i => i.stillBorrowed);
  return {
    ...batch,
    items,
    totalCount: items.length,
    notReturnedCount: notReturned.length,
    returnedCount: items.length - notReturned.length,
    allReturned: items.length > 0 && notReturned.length === 0,
    notReturnedList: notReturned
  };
}

export async function handleBatches(req, res, url) {
  const db = await loadDb();

  if (req.method === "GET" && url.pathname === "/api/batches") {
    const batches = db.borrowBatches
      .slice()
      .sort((a, b) => (b.createdAt || b.id).localeCompare(a.createdAt || a.id))
      .map(b => summarizeBatch(b, db));
    return send(res, 200, batches);
  }

  if (req.method === "POST" && url.pathname === "/api/batches") {
    const user = await requirePermission(req, res, PERMISSIONS.CREATE_BATCH);
    if (!user) return;
    const input = await body(req);
    const itemIds = Array.isArray(input.itemIds) ? input.itemIds : [];
    const eventName = input.eventName || "演示活动";
    const borrower = input.borrower || "";
    const dueDate = input.dueDate || "";
    const remark = input.remark || "";
    const name = input.name || eventName;

    if (itemIds.length === 0) {
      return send(res, 400, { error: "no_items", message: "请至少选择一件道具" });
    }

    const validItems = [];
    const invalidItems = [];
    const unavailableItems = [];

    for (const id of itemIds) {
      const item = findItem(db, id);
      if (!item) {
        invalidItems.push(id);
        continue;
      }
      if (item.status === "已借出" || item.status === "待归还") {
        unavailableItems.push({ id: item.id || item.code, name: item.name, code: item.code, status: item.status });
        continue;
      }
      validItems.push(item);
    }

    if (invalidItems.length > 0) {
      return send(res, 400, { error: "items_not_found", invalidItems });
    }
    if (unavailableItems.length > 0) {
      return send(res, 400, { error: "items_unavailable", unavailableItems });
    }

    const batchId = newBatchId();
    const now = new Date().toISOString();

    const batch = {
      id: batchId,
      name,
      eventName,
      borrower,
      dueDate,
      remark,
      createdAt: now,
      itemIds: validItems.map(i => i.id || i.code),
      logs: [
        { at: now, step: "创建批次", note: `创建${eventName}演示借用批次，含${validItems.length}件道具（${user.displayName}）` }
      ]
    };

    for (const item of validItems) {
      item.borrowings ||= [];
      item.borrowings.push({
        at: now,
        borrower,
        eventName,
        dueDate,
        batchId
      });
      item.status = "已借出";
      item.logs ||= [];
      item.logs.push({ at: now, step: "借用", note: eventName + " · " + borrower + "（批次）（" + user.displayName + "）" });
    }

    db.borrowBatches.unshift(batch);
    await saveDb(db);
    return send(res, 201, summarizeBatch(batch, db));
  }

  const detail = url.pathname.match(/^\/api\/batches\/([^/]+)$/);
  if (detail && req.method === "GET") {
    const batch = findBatch(db, detail[1]);
    if (!batch) return send(res, 404, { error: "batch_not_found" });
    return send(res, 200, summarizeBatch(batch, db));
  }

  const patch = url.pathname.match(/^\/api\/batches\/([^/]+)$/);
  if (patch && req.method === "PATCH") {
    const user = await requirePermission(req, res, PERMISSIONS.UPDATE_BATCH);
    if (!user) return;
    const batch = findBatch(db, patch[1]);
    if (!batch) return send(res, 404, { error: "batch_not_found" });
    const input = await body(req);
    const fields = ["name", "eventName", "borrower", "dueDate", "remark"];
    for (const f of fields) {
      if (input[f] !== undefined) batch[f] = input[f];
    }
    batch.logs ||= [];
    batch.logs.push({ at: new Date().toISOString(), step: "更新批次", note: "修改批次信息（" + user.displayName + "）" });
    await saveDb(db);
    return send(res, 200, summarizeBatch(batch, db));
  }

  const log = url.pathname.match(/^\/api\/batches\/([^/]+)\/logs$/);
  if (log && req.method === "POST") {
    const user = await requirePermission(req, res, PERMISSIONS.ADD_BATCH_LOG);
    if (!user) return;
    const batch = findBatch(db, log[1]);
    if (!batch) return send(res, 404, { error: "batch_not_found" });
    const input = await body(req);
    batch.logs ||= [];
    batch.logs.push({ at: new Date().toISOString(), step: input.step || "备注", note: (input.note || "") + "（" + user.displayName + "）" });
    await saveDb(db);
    return send(res, 201, summarizeBatch(batch, db));
  }

  const batchReturn = url.pathname.match(/^\/api\/batches\/([^/]+)\/return$/);
  if (batchReturn && req.method === "POST") {
    const user = await requirePermission(req, res, PERMISSIONS.RETURN_ITEM);
    if (!user) return;

    const batch = findBatch(db, batchReturn[1]);
    if (!batch) return send(res, 404, { error: "batch_not_found" });

    const input = await body(req);
    const returnDate = input.returnDate || new Date().toISOString().slice(0, 10);
    const returner = input.returner || "";
    const generalWear = input.generalWear || "";
    const itemsInput = Array.isArray(input.items) ? input.items : [];

    if (itemsInput.length === 0) {
      return send(res, 400, { error: "no_items", message: "请至少选择一件道具" });
    }

    const validItems = [];
    const invalidItems = [];
    const unavailableItems = [];

    for (const itemInput of itemsInput) {
      const itemId = itemInput.itemId;
      const item = findItem(db, itemId);

      if (!item) {
        invalidItems.push(itemId);
        continue;
      }

      if (item.status !== "已借出" && item.status !== "待归还") {
        unavailableItems.push({ id: item.id || item.code, name: item.name, code: item.code, status: item.status });
        continue;
      }

      const lastBorrowing = (item.borrowings || []).filter(b => b.batchId === batch.id).slice(-1)[0];
      if (!lastBorrowing) {
        unavailableItems.push({ id: item.id || item.code, name: item.name, code: item.code, status: item.status, message: "该道具不属于此批次" });
        continue;
      }

      validItems.push({
        item,
        wearChange: itemInput.wearChange || generalWear,
        needRepair: itemInput.needRepair === true || itemInput.needRepair === "true",
        note: itemInput.note || ""
      });
    }

    if (invalidItems.length > 0) {
      return send(res, 400, { error: "items_not_found", invalidItems });
    }
    if (unavailableItems.length > 0) {
      return send(res, 400, { error: "items_unavailable", unavailableItems });
    }

    const now = new Date().toISOString();
    const processedItems = [];

    for (const { item, wearChange, needRepair, note } of validItems) {
      const returnRecord = {
        id: newId(),
        returnDate,
        returner,
        wearChange,
        needRepair,
        note,
        batchId: batch.id
      };

      item.returns ||= [];
      item.returns.push(returnRecord);

      const newStatus = needRepair ? "需修补" : "可借用";
      item.status = newStatus;

      item.logs ||= [];
      item.logs.push({
        at: now,
        step: "归还",
        note: "归还人：" + (returner || "未填写") +
          " · 归还日期：" + returnDate +
          (wearChange ? " · 磨损变化：" + wearChange : "") +
          (note ? " · 备注：" + note : "") +
          " · 检查结果：" + (needRepair ? "需修补" : "可借用") +
          "（批次归还）（" + user.displayName + "）"
      });

      if (wearChange) {
        item.wear = wearChange;
      }

      processedItems.push({
        itemId: item.id || item.code,
        code: item.code,
        name: item.name,
        status: newStatus,
        returnRecord
      });
    }

    batch.logs ||= [];
    batch.logs.push({
      at: now,
      step: "批次归还",
      note: `批量归还${processedItems.length}件道具：` +
        processedItems.map(i => `${i.code}(${i.name})`).join("、") +
        "（" + user.displayName + "）"
    });

    await saveDb(db);
    return send(res, 201, {
      batch: summarizeBatch(batch, db),
      processedCount: processedItems.length,
      items: processedItems
    });
  }

  return null;
}
