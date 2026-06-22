import { loadDb, saveDb, body, send, newId } from "../db.js";
import { repairAcceptanceResults, repairReinspectionResults } from "../public/constants.js";
import { requirePermission } from "./auth.js";
import { PERMISSIONS } from "../services/auth.js";

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
    const user = await requirePermission(req, res, PERMISSIONS.CREATE_REPAIR_ORDER);
    if (!user) return;
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
      currentRound: 1,
      rounds: [
        {
          round: 1,
          processingSteps: "",
          materialConsumption: "",
          completionDate: "",
          acceptanceResult: "",
          acceptanceDate: "",
          acceptedBy: "",
          reinspectionResult: "",
          reinspectionDate: "",
          reinspectedBy: "",
          note: ""
        }
      ],
      logs: [
        {
          at: new Date().toISOString(),
          step: "创建工单",
          note: "创建修补工单，问题描述：" + (input.problemDescription || item.wear || "未填写") + "（" + user.displayName + "）"
        }
      ]
    };

    db.repairOrders.unshift(order);

    item.logs ||= [];
    item.logs.push({
      at: new Date().toISOString(),
      step: "修补工单",
      note: "创建修补工单（" + order.id + "），问题：" + (input.problemDescription || item.wear || "未填写") + "（" + user.displayName + "）"
    });

    await saveDb(db);
    return send(res, 201, order);
  }

  if (req.method === "PATCH" && url.pathname.match(/^\/api\/repair-orders\/([^/]+)$/)) {
    const user = await requirePermission(req, res, PERMISSIONS.UPDATE_REPAIR_ORDER);
    if (!user) return;
    const match = url.pathname.match(/^\/api\/repair-orders\/([^/]+)$/);
    const order = db.repairOrders.find(o => o.id === match[1]);
    if (!order) return send(res, 404, { error: "repair_order_not_found" });

    const input = await body(req);
    const allowedFields = [
      "problemDescription", "handler", "processingSteps",
      "materialConsumption", "completionDate", "acceptanceResult", "status"
    ];
    const changes = allowedFields
      .filter(f => input[f] !== undefined && input[f] !== order[f])
      .map(f => ({ field: f, before: order[f], after: input[f] }));

    for (const field of allowedFields) {
      if (input[field] !== undefined) {
        order[field] = input[field];
      }
    }

    order.logs ||= [];
    const statusChange = changes.find(change => change.field === "status");
    if (statusChange) {
      order.logs.push({
        at: new Date().toISOString(),
        step: "状态变更",
        note: "状态从「" + (statusChange.before || "未设置") + "」更新为「" + (statusChange.after || "未设置") + "」（" + user.displayName + "）"
      });
    }

    const fieldChanges = changes
      .filter(change => change.field !== "status")
      .map(change => change.field + "=" + change.after)
      .join(", ");
    if (fieldChanges) {
      order.logs.push({
        at: new Date().toISOString(),
        step: "更新",
        note: "更新字段：" + fieldChanges + "（" + user.displayName + "）"
      });
    }

    await saveDb(db);
    return send(res, 200, order);
  }

  if (req.method === "POST" && url.pathname.match(/^\/api\/repair-orders\/([^/]+)\/complete$/)) {
    const user = await requirePermission(req, res, PERMISSIONS.COMPLETE_REPAIR_ORDER);
    if (!user) return;
    const match = url.pathname.match(/^\/api\/repair-orders\/([^/]+)\/complete$/);
    const order = db.repairOrders.find(o => o.id === match[1]);
    if (!order) return send(res, 404, { error: "repair_order_not_found" });

    const input = await body(req);
    const today = new Date().toISOString().slice(0, 10);

    const acceptanceResult = input.acceptanceResult;
    if (!acceptanceResult) {
      return send(res, 400, { error: "acceptance_result_required", message: "验收结果为必填项" });
    }
    if (!repairAcceptanceResults.includes(acceptanceResult)) {
      return send(res, 400, {
        error: "invalid_acceptance_result",
        message: "验收结果必须是：" + repairAcceptanceResults.join("、")
      });
    }
    const processingSteps = input.processingSteps || order.processingSteps || "";
    if (!processingSteps.trim()) {
      return send(res, 400, { error: "processing_steps_required", message: "处理步骤为必填项" });
    }

    order.rounds ||= [];
    if (order.rounds.length === 0) {
      order.rounds.push({
        round: 1,
        processingSteps: "",
        materialConsumption: "",
        completionDate: "",
        acceptanceResult: "",
        acceptanceDate: "",
        acceptedBy: "",
        reinspectionResult: "",
        reinspectionDate: "",
        reinspectedBy: "",
        note: ""
      });
    }
    if (typeof order.currentRound !== "number") {
      order.currentRound = 1;
    }

    const currentRound = order.rounds.find(r => r.round === order.currentRound) || order.rounds[order.rounds.length - 1];
    currentRound.processingSteps = processingSteps;
    currentRound.materialConsumption = input.materialConsumption !== undefined ? input.materialConsumption : (order.materialConsumption || "");
    currentRound.completionDate = input.completionDate || today;
    currentRound.acceptanceResult = acceptanceResult;
    currentRound.acceptanceDate = input.completionDate || today;
    currentRound.acceptedBy = user.displayName;

    const oldStatus = order.status;
    const newStatus = acceptanceResult === "待复验" ? "待复验" : "已完成";
    order.status = newStatus;
    order.completionDate = input.completionDate || today;
    order.processingSteps = input.processingSteps !== undefined ? input.processingSteps : order.processingSteps;
    order.materialConsumption = input.materialConsumption !== undefined ? input.materialConsumption : order.materialConsumption;
    order.acceptanceResult = acceptanceResult;

    order.logs ||= [];
    if (oldStatus !== newStatus) {
      order.logs.push({
        at: new Date().toISOString(),
        step: "状态变更",
        note: "状态从「" + oldStatus + "」更新为「" + newStatus + "」（" + user.displayName + "）"
      });
    }
    order.logs.push({
      at: new Date().toISOString(),
      step: "完成",
      note: "第" + order.currentRound + "轮修补完成，处理步骤：" + (processingSteps || "未填写") +
        "；材料消耗：" + (currentRound.materialConsumption || "未填写") +
        "；验收结果：" + acceptanceResult + "（" + user.displayName + "）"
    });

    const item = db.items.find(x => x.id === order.itemId || x.code === order.itemCode);
    let itemUpdated = null;
    if (item) {
      const oldItemStatus = item.status;
      if (acceptanceResult === "待复验") {
        item.status = "需修补";
      } else if (acceptanceResult === "不合格") {
        item.status = "需修补";
      } else {
        item.status = "可借用";
      }
      item.lastMaintenance = order.completionDate || today;
      item.logs ||= [];
      if (oldItemStatus !== item.status) {
        item.logs.push({
          at: new Date().toISOString(),
          step: "状态",
          note: "状态从「" + oldItemStatus + "」更新为「" + item.status + "」（修补工单完成）（" + user.displayName + "）"
        });
      }
      item.logs.push({
        at: new Date().toISOString(),
        step: "维护",
        note: "修补工单（" + order.id + "）第" + order.currentRound + "轮完成：" + processingSteps +
          "；材料消耗：" + (currentRound.materialConsumption || "未填写") +
          "；验收结果：" + acceptanceResult + "（" + user.displayName + "）"
      });
      itemUpdated = item;
    }

    await saveDb(db);
    return send(res, 200, { order, item: itemUpdated });
  }

  if (req.method === "POST" && url.pathname.match(/^\/api\/repair-orders\/([^/]+)\/reinspect$/)) {
    const user = await requirePermission(req, res, PERMISSIONS.REINSPECT_REPAIR_ORDER);
    if (!user) return;
    const match = url.pathname.match(/^\/api\/repair-orders\/([^/]+)\/reinspect$/);
    const order = db.repairOrders.find(o => o.id === match[1]);
    if (!order) return send(res, 404, { error: "repair_order_not_found" });

    if (order.status !== "待复验") {
      return send(res, 400, { error: "invalid_status", message: "只有状态为'待复验'的工单才能进行复验" });
    }

    const input = await body(req);
    const today = new Date().toISOString().slice(0, 10);

    const reinspectionResult = input.reinspectionResult;
    if (!reinspectionResult) {
      return send(res, 400, { error: "reinspection_result_required", message: "复验结果为必填项" });
    }
    if (!repairReinspectionResults.includes(reinspectionResult)) {
      return send(res, 400, {
        error: "invalid_reinspection_result",
        message: "复验结果必须是：" + repairReinspectionResults.join("、")
      });
    }

    const reinspectionNote = input.note || "";

    order.rounds ||= [];
    if (order.rounds.length === 0) {
      order.rounds.push({
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
      });
    }
    if (typeof order.currentRound !== "number") {
      order.currentRound = 1;
    }

    const currentRound = order.rounds.find(r => r.round === order.currentRound) || order.rounds[order.rounds.length - 1];
    currentRound.reinspectionResult = reinspectionResult;
    currentRound.reinspectionDate = today;
    currentRound.reinspectedBy = user.displayName;
    currentRound.note = reinspectionNote;

    order.logs ||= [];
    order.logs.push({
      at: new Date().toISOString(),
      step: "复验",
      note: "第" + order.currentRound + "轮复验结果：" + reinspectionResult +
        (reinspectionNote ? "；备注：" + reinspectionNote : "") +
        "（" + user.displayName + "）"
    });

    const item = db.items.find(x => x.id === order.itemId || x.code === order.itemCode);
    let itemUpdated = null;

    if (reinspectionResult === "复验合格") {
      const oldStatus = order.status;
      order.status = "已验收";
      order.logs.push({
        at: new Date().toISOString(),
        step: "状态变更",
        note: "状态从「" + oldStatus + "」更新为「已验收」（" + user.displayName + "）"
      });

      if (item) {
        const oldItemStatus = item.status;
        item.status = "可借用";
        item.lastMaintenance = today;
        item.logs ||= [];
        if (oldItemStatus !== item.status) {
          item.logs.push({
            at: new Date().toISOString(),
            step: "状态",
            note: "状态从「" + oldItemStatus + "」更新为「" + item.status + "」（复验合格）（" + user.displayName + "）"
          });
        }
        item.logs.push({
          at: new Date().toISOString(),
          step: "维护",
          note: "修补工单（" + order.id + "）复验合格（" + user.displayName + "）"
        });
        itemUpdated = item;
      }
    } else if (reinspectionResult === "复验不合格") {
      const nextRound = order.currentRound + 1;
      order.currentRound = nextRound;
      order.rounds.push({
        round: nextRound,
        processingSteps: "",
        materialConsumption: "",
        completionDate: "",
        acceptanceResult: "",
        acceptanceDate: "",
        acceptedBy: "",
        reinspectionResult: "",
        reinspectionDate: "",
        reinspectedBy: "",
        note: ""
      });

      const oldStatus = order.status;
      order.status = "处理中";
      order.acceptanceResult = "";
      order.completionDate = "";
      order.processingSteps = "";
      order.materialConsumption = "";

      order.logs.push({
        at: new Date().toISOString(),
        step: "状态变更",
        note: "状态从「" + oldStatus + "」更新为「处理中」，自动开始第" + nextRound + "轮返修（" + user.displayName + "）"
      });

      if (item) {
        item.status = "需修补";
        item.logs ||= [];
        item.logs.push({
          at: new Date().toISOString(),
          step: "维护",
          note: "修补工单（" + order.id + "）复验不合格，开始第" + nextRound + "轮返修（" + user.displayName + "）"
        });
        itemUpdated = item;
      }
    }

    await saveDb(db);
    return send(res, 200, { order, item: itemUpdated, nextRound: order.currentRound });
  }

  if (req.method === "DELETE" && url.pathname.match(/^\/api\/repair-orders\/([^/]+)$/)) {
    const user = await requirePermission(req, res, PERMISSIONS.DELETE_REPAIR_ORDER);
    if (!user) return;
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
