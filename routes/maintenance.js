import { loadDb, saveDb, body, send } from "../db.js";
import { requirePermission } from "./auth.js";
import { PERMISSIONS } from "../services/auth.js";

export async function handleMaintenance(req, res, url) {
  const db = await loadDb();

  if (req.method === "PUT" && url.pathname.match(/^\/api\/items\/([^/]+)\/maintenance-plan$/)) {
    const user = await requirePermission(req, res, PERMISSIONS.SET_MAINTENANCE_PLAN);
    if (!user) return;
    const match = url.pathname.match(/^\/api\/items\/([^/]+)\/maintenance-plan$/);
    const item = db.items.find(x => x.id === match[1] || x.code === match[1]);
    if (!item) return send(res, 404, { error: "item_not_found" });
    const input = await body(req);
    item.maintenancePlan = {
      nextDate: input.nextDate || "",
      type: input.type || "",
      responsible: input.responsible || ""
    };
    item.logs ||= [];
    item.logs.push({
      at: new Date().toISOString(),
      step: "维护计划",
      note: "设置下次维护：" + (input.nextDate || "") + " · " + (input.type || "") + " · " + (input.responsible || "") + "（" + user.displayName + "）"
    });
    await saveDb(db);
    return send(res, 200, item);
  }

  if (req.method === "POST" && url.pathname.match(/^\/api\/items\/([^/]+)\/complete-maintenance$/)) {
    const user = await requirePermission(req, res, PERMISSIONS.COMPLETE_MAINTENANCE);
    if (!user) return;
    const match = url.pathname.match(/^\/api\/items\/([^/]+)\/complete-maintenance$/);
    const item = db.items.find(x => x.id === match[1] || x.code === match[1]);
    if (!item) return send(res, 404, { error: "item_not_found" });
    const input = await body(req);
    const today = new Date().toISOString().slice(0, 10);
    item.lastMaintenance = today;
    item.logs ||= [];
    item.logs.push({
      at: new Date().toISOString(),
      step: "完成维护",
      note: (input.note || "维护完成") + (item.maintenancePlan ? "（" + item.maintenancePlan.type + "）" : "") + "（" + user.displayName + "）"
    });
    item.maintenancePlan = null;
    await saveDb(db);
    return send(res, 200, item);
  }

  if (req.method === "GET" && url.pathname === "/api/maintenance/reminders") {
    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    const soonDays = 7;
    const soonThreshold = new Date(now.getTime() + soonDays * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    const overdue = [];
    const upcoming = [];

    for (const item of db.items) {
      const plan = item.maintenancePlan;
      if (!plan || !plan.nextDate) continue;
      const d = plan.nextDate;
      if (d < today) {
        overdue.push({
          code: item.code,
          name: item.name,
          nextDate: d,
          type: plan.type,
          responsible: plan.responsible,
          daysOverdue: Math.floor((now - new Date(d)) / (24 * 60 * 60 * 1000))
        });
      } else if (d <= soonThreshold) {
        upcoming.push({
          code: item.code,
          name: item.name,
          nextDate: d,
          type: plan.type,
          responsible: plan.responsible,
          daysLeft: Math.floor((new Date(d) - now) / (24 * 60 * 60 * 1000))
        });
      }
    }

    overdue.sort((a, b) => a.nextDate.localeCompare(b.nextDate));
    upcoming.sort((a, b) => a.nextDate.localeCompare(b.nextDate));

    return send(res, 200, { overdue, upcoming });
  }

  return null;
}
