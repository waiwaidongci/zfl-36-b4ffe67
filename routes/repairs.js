import { loadDb, saveDb, body, send, newId } from "../db.js";

function attachItemInfo(order, items) {
  const item = items.find(i => i.id === order.itemId || i.code === order.itemCode);
  if (item) {
    return {
      ...order,
      itemCode: order.itemCode || item.code,
      itemName: order.itemName || item.name,
      itemStatus: item.status
    };
  }
  return order;
}

export async function handleRepairs(req, res, url) {
  const db = await loadDb();
  db.repairOrders ||= [];
  db.items ||= [];

  if (req.method === "GET" && url.pathname === "/api/repair-orders") {
    const status = url.searchParams.get("status");
    const itemId = url.searchParams.get("itemId");
    let orders = [...db.repairOrders];
    if (status) orders = orders.filter(o => o.status === status);
    if (itemId) orders = orders.filter(o => o.itemId === itemId || o.itemCode === itemId);
    orders = orders.map(o => attachItemInfo(o, db.items));
    orders.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    return send(res, 200, orders);
  }

  if (req.method === "GET" && url.pathname.match(/^\/api\/repair-orders\/([^/]+)$/)) {
    const match = url.pathname.match(/^\/api\/repair-orders\/([^/]+)$/);
    const order = db.repairOrders.find(o => o.id === match[1]);
    if (!order) return send(res, 404, { error: "repair_order_not_found" });
    return send(res, 200, attachItemInfo(order, db.items));
  }

  if (req.method === "POST" && url.pathname === "/api/repair-orders") {
    const input = await body(req);
    const itemId = input.itemId || input.itemCode;
    const item = db.items.find(x => x.id === itemId || x.code === itemId);
    if (!item) return send(res, 404, { error: "item_not_found" });
    if (item.status !== "需修补") {
      return send(res, 400, { error: "item_not_in_repair", message: "只有状态为'需修补'的道具才能创建修补工单" });
    }

    const order = {
      id: newId().replace("CP-", "CP-REP-"),
      itemId: item.id || item.code,
      itemCode: item.code,
      itemName: item.name,
      status: "待处理",
      createdAt: new Date().toISOString(),
      problemDescription: input.problemDescription || item.wear || "",
      handler: input.handler || "",
      processingSteps: input.processingSteps || "",
      materialConsumption: input.materialConsumption || "",
      completionDate: "",
      acceptanceResult: "",
      logs: [
        {
          at: new Date().toISOString(),
          step: "创建工单",
          note: "创建修补工单，问题描述：" + (input.problemDescription || item.wear || "未填写")
        }
      ]
    };

    db.repairOrders.unshift(order);

    item.logs ||= [];
    item.logs.push({
      at: new Date().toISOString(),
      step: "修补工单",
      note: "创建修补工单（" + order.id + "），问题：" + (input.problemDescription || item.wear || "未填写")
    });

    await saveDb(db);
    return send(res, 201, order);
  }

  if (req.method === "PATCH" && url.pathname.match(/^\/api\/repair-orders\/([^/]+)$/)) {
    const match = url.pathname.match(/^\/api\/repair-orders\/([^/]+)$/);
    const order = db.repairOrders.find(o => o.id === match[1]);
    if (!order) return send(res, 404, { error: "repair_order_not_found" });

    const input = await body(req);
    const allowedFields = [
      "problemDescription", "handler", "processingSteps",
      "materialConsumption", "completionDate", "acceptanceResult", "status"
    ];
    for (const field of allowedFields) {
      if (input[field] !== undefined) {
        order[field] = input[field];
      }
    }

    order.logs ||= [];
    const changes = allowedFields
      .filter(f => input[f] !== undefined && input[f] !== order[f])
      .map(f => f + "=" + input[f])
      .join(", ");
    if (changes) {
      order.logs.push({
        at: new Date().toISOString(),
        step: "更新",
        note: "更新字段：" + changes
      });
    }

    await saveDb(db);
    return send(res, 200, order);
  }

  if (req.method === "POST" && url.pathname.match(/^\/api\/repair-orders\/([^/]+)\/complete$/)) {
    const match = url.pathname.match(/^\/api\/repair-orders\/([^/]+)\/complete$/);
    const order = db.repairOrders.find(o => o.id === match[1]);
    if (!order) return send(res, 404, { error: "repair_order_not_found" });

    const input = await body(req);
    const today = new Date().toISOString().slice(0, 10);

    order.status = "已完成";
    order.completionDate = input.completionDate || today;
    if (input.processingSteps !== undefined) order.processingSteps = input.processingSteps;
    if (input.materialConsumption !== undefined) order.materialConsumption = input.materialConsumption;
    if (input.acceptanceResult !== undefined) order.acceptanceResult = input.acceptanceResult;

    order.logs ||= [];
    order.logs.push({
      at: new Date().toISOString(),
      step: "完成",
      note: "修补完成，处理步骤：" + (input.processingSteps || order.processingSteps || "未填写") +
        "；材料消耗：" + (input.materialConsumption || order.materialConsumption || "未填写") +
        "；验收结果：" + (input.acceptanceResult || order.acceptanceResult || "未填写")
    });

    const item = db.items.find(x => x.id === order.itemId || x.code === order.itemCode);
    if (item) {
      if (input.acceptanceResult === "不合格") {
        item.status = "需修补";
      } else {
        item.status = "可借用";
      }
      item.lastMaintenance = order.completionDate || today;
      item.logs ||= [];
      item.logs.push({
        at: new Date().toISOString(),
        step: "维护",
        note: "修补工单（" + order.id + "）完成：" +
          (input.processingSteps || order.processingSteps || "未填写") +
          "；验收结果：" + (input.acceptanceResult || order.acceptanceResult || "未填写") +
          "；状态更新为：" + item.status
      });
    }

    await saveDb(db);
    return send(res, 200, { order, item: item ? attachItemInfo(order, db.items) : null });
  }

  if (req.method === "DELETE" && url.pathname.match(/^\/api\/repair-orders\/([^/]+)$/)) {
    const match = url.pathname.match(/^\/api\/repair-orders\/([^/]+)$/);
    const idx = db.repairOrders.findIndex(o => o.id === match[1]);
    if (idx === -1) return send(res, 404, { error: "repair_order_not_found" });
    db.repairOrders.splice(idx, 1);
    await saveDb(db);
    return send(res, 200, { deleted: true });
  }

  if (req.method === "GET" && url.pathname.match(/^\/api\/items\/([^/]+)\/repair-orders$/)) {
    const match = url.pathname.match(/^\/api\/items\/([^/]+)\/repair-orders$/);
    const item = db.items.find(x => x.id === match[1] || x.code === match[1]);
    if (!item) return send(res, 404, { error: "item_not_found" });
    const orders = db.repairOrders
      .filter(o => o.itemId === match[1] || o.itemCode === match[1] || o.itemId === item.id)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    return send(res, 200, orders);
  }

  return null;
}
