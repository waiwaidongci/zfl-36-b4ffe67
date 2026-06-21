import { loadDb, saveDb, body, send, newId } from "../db.js";
import { requirePermission } from "./auth.js";
import { PERMISSIONS } from "../services/auth.js";

export async function handleReturns(req, res, url) {
  const db = await loadDb();

  if (req.method === "GET" && url.pathname === "/api/returns/borrowed") {
    const borrowed = db.items
      .filter(item => item.status === "已借出" || item.status === "待归还")
      .map(item => {
        const lastBorrowing = (item.borrowings || []).slice(-1)[0];
        return {
          id: item.id || item.code,
          code: item.code,
          name: item.name,
          status: item.status,
          borrower: lastBorrowing ? lastBorrowing.borrower : "",
          eventName: lastBorrowing ? lastBorrowing.eventName : "",
          dueDate: lastBorrowing ? lastBorrowing.dueDate : "",
          borrowedAt: lastBorrowing ? lastBorrowing.at : ""
        };
      });
    return send(res, 200, borrowed);
  }

  if (req.method === "POST" && url.pathname.match(/^\/api\/items\/([^/]+)\/return$/)) {
    const user = await requirePermission(req, res, PERMISSIONS.RETURN_ITEM);
    if (!user) return;
    const match = url.pathname.match(/^\/api\/items\/([^/]+)\/return$/);
    const item = db.items.find(x => x.id === match[1] || x.code === match[1]);
    if (!item) return send(res, 404, { error: "item_not_found" });

    if (item.status !== "已借出" && item.status !== "待归还") {
      return send(res, 400, { error: "item_not_borrowed", message: "该道具当前状态不是已借出或待归还" });
    }

    const input = await body(req);

    const returnDate = input.returnDate || new Date().toISOString().slice(0, 10);
    const returner = input.returner || "";
    const wearChange = input.wearChange || "";
    const needRepair = input.needRepair === true || input.needRepair === "true";

    const returnRecord = {
      id: newId(),
      returnDate,
      returner,
      wearChange,
      needRepair
    };

    item.returns ||= [];
    item.returns.push(returnRecord);

    const newStatus = needRepair ? "需修补" : "可借用";
    item.status = newStatus;

    item.logs ||= [];
    item.logs.push({
      at: new Date().toISOString(),
      step: "归还",
      note: "归还人：" + (returner || "未填写") +
        " · 归还日期：" + returnDate +
        (wearChange ? " · 磨损变化：" + wearChange : "") +
        " · 检查结果：" + (needRepair ? "需修补" : "可借用") +
        "（" + user.displayName + "）"
    });

    if (wearChange) {
      item.wear = wearChange;
    }

    await saveDb(db);
    return send(res, 201, { item, returnRecord });
  }

  if (req.method === "GET" && url.pathname.match(/^\/api\/items\/([^/]+)\/returns$/)) {
    const match = url.pathname.match(/^\/api\/items\/([^/]+)\/returns$/);
    const item = db.items.find(x => x.id === match[1] || x.code === match[1]);
    if (!item) return send(res, 404, { error: "item_not_found" });
    return send(res, 200, item.returns || []);
  }

  if (req.method === "GET" && url.pathname === "/api/returns") {
    const allReturns = [];
    for (const item of db.items) {
      const returns = item.returns || [];
      for (const r of returns) {
        allReturns.push({
          ...r,
          itemCode: item.code,
          itemName: item.name,
          itemId: item.id || item.code
        });
      }
    }
    allReturns.sort((a, b) => b.returnDate.localeCompare(a.returnDate));
    return send(res, 200, allReturns);
  }

  return null;
}
