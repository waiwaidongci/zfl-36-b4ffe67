import { loadDb, saveDb, body, send, newId, summarize } from "../db.js";
import { statLabels } from "../public/constants.js";

function computeStats(items) {
  const stats = Object.fromEntries(statLabels.map(label => [label, 0]));
  for (const item of items) {
    if (stats[item.status] !== undefined) stats[item.status] += 1;
  }
  return stats;
}

export async function handleItems(req, res, url) {
  const db = await loadDb();

  if (req.method === "GET" && url.pathname === "/api/items") {
    return send(res, 200, db.items.map(summarize));
  }

  if (req.method === "GET" && url.pathname === "/api/stats") {
    return send(res, 200, computeStats(db.items));
  }

  if (req.method === "POST" && url.pathname === "/api/items") {
    const input = await body(req);
    const item = {
      id: newId(),
      ...input,
      maintenancePlan: input.maintenancePlan || null,
      logs: [{ at: new Date().toISOString(), step: "建档", note: "创建道具" }]
    };
    db.items.unshift(item);
    await saveDb(db);
    return send(res, 201, item);
  }

  const patch = url.pathname.match(/^\/api\/items\/([^/]+)$/);
  if (patch && req.method === "PATCH") {
    const item = db.items.find(x => x.id === patch[1] || x.code === patch[1]);
    if (!item) return send(res, 404, { error: "item_not_found" });
    Object.assign(item, await body(req));
    item.logs ||= [];
    item.logs.push({ at: new Date().toISOString(), step: "状态", note: "更新为" + item.status });
    await saveDb(db);
    return send(res, 200, item);
  }

  const log = url.pathname.match(/^\/api\/items\/([^/]+)\/logs$/);
  if (log && req.method === "POST") {
    const item = db.items.find(x => x.id === log[1] || x.code === log[1]);
    if (!item) return send(res, 404, { error: "item_not_found" });
    const input = await body(req);
    item.logs ||= [];
    item.logs.push({ at: new Date().toISOString(), step: input.step || "记录", note: input.note || "" });
    await saveDb(db);
    return send(res, 201, item);
  }

  const action = url.pathname.match(/^\/api\/items\/([^/]+)\/action$/);
  if (action && req.method === "POST") {
    const item = db.items.find(x => x.id === action[1] || x.code === action[1]);
    if (!item) return send(res, 404, { error: "item_not_found" });
    const input = await body(req);
    item.logs ||= [];
    item.borrowings ||= [];
    item.borrowings.push({ at: new Date().toISOString(), ...input });
    item.status = "已借出";
    item.logs.push({ at: new Date().toISOString(), step: "借用", note: (input.eventName || "演示") + " · " + (input.borrower || "") });
    await saveDb(db);
    return send(res, 201, item);
  }

  return null;
}
