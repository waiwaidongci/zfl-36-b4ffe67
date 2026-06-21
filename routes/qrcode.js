import { loadDb, send } from "../db.js";

export async function handleQrcode(req, res, url) {
  const db = await loadDb();

  const detailMatch = url.pathname.match(/^\/api\/qrcode\/([^/]+)$/);
  if (detailMatch && req.method === "GET") {
    const identifier = detailMatch[1];
    const item = db.items.find(x => x.id === identifier || x.code === identifier);
    if (!item) return send(res, 404, { error: "item_not_found" });

    const latestMaintenance = (item.logs || [])
      .filter(l => l.step === "维护" || l.step === "检查")
      .slice(-1)[0];

    const currentBorrowing = item.status === "已借出" && (item.borrowings || []).length > 0
      ? item.borrowings[item.borrowings.length - 1]
      : null;

    const result = {
      code: item.code || item.id,
      name: item.name || "",
      status: item.status || "",
      location: item.location || "",
      purpose: item.purpose || "",
      material: item.material || "",
      wear: item.wear || "",
      lastMaintenance: item.lastMaintenance || "",
      latestMaintenanceLog: latestMaintenance || null,
      currentBorrowing: currentBorrowing || null,
      maintenancePlan: item.maintenancePlan || null
    };

    return send(res, 200, result);
  }

  return null;
}
