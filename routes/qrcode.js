import { loadDb, saveDb, body, send } from "../db.js";
import { getCurrentUser, requirePermission } from "./auth.js";
import { PERMISSIONS, hasPermission } from "../services/auth.js";

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

    const isBorrowedState = item.status === "已借出" || item.status === "待归还";
    const currentBorrowing = isBorrowedState && (item.borrowings || []).length > 0
      ? item.borrowings[item.borrowings.length - 1]
      : null;

    const latestCheck = (item.checks || []).slice(-1)[0] || null;
    const recentChecks = (item.checks || []).slice(-5).reverse();

    const user = await getCurrentUser(req);
    const canCheck = !!user && hasPermission(db, user.role, PERMISSIONS.SUBMIT_CHECK);

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
      maintenancePlan: item.maintenancePlan || null,
      latestCheck: latestCheck,
      recentChecks: recentChecks,
      canCheck: canCheck
    };

    return send(res, 200, result);
  }

  const checkMatch = url.pathname.match(/^\/api\/qrcode\/([^/]+)\/check$/);
  if (checkMatch && req.method === "POST") {
    const user = await requirePermission(req, res, PERMISSIONS.SUBMIT_CHECK);
    if (!user) return;

    const identifier = checkMatch[1];
    const item = db.items.find(x => x.id === identifier || x.code === identifier);
    if (!item) return send(res, 404, { error: "item_not_found" });

    const input = await body(req);
    const { checkResult, actualLocation, wearNote, needRepair } = input;

    if (!checkResult) {
      return send(res, 400, { error: "invalid_input", message: "核验结果不能为空" });
    }

    const validResults = ["正常", "存放异常", "状态异常", "需修补", "已借出中"];
    if (!validResults.includes(checkResult)) {
      return send(res, 400, { error: "invalid_input", message: "无效的核验结果" });
    }

    item.checks ||= [];
    const checkRecord = {
      id: "CHECK-" + Date.now(),
      at: new Date().toISOString(),
      operator: user.displayName,
      operatorId: user.id,
      checkResult: checkResult,
      actualLocation: actualLocation || "",
      wearNote: wearNote || "",
      needRepair: !!needRepair,
      originalLocation: item.location || "",
      originalStatus: item.status || ""
    };
    item.checks.push(checkRecord);

    if (actualLocation && actualLocation.trim() && actualLocation.trim() !== (item.location || "")) {
      item.location = actualLocation.trim();
    }

    if (needRepair && item.status !== "需修补" && item.status !== "已借出" && item.status !== "待归还") {
      item.status = "需修补";
    } else if (checkResult === "正常" && item.status === "需修补" && !needRepair) {
      item.status = "可借用";
    } else if (checkResult === "状态异常" && !needRepair) {
      if (item.status === "可借用" || item.status === "需修补") {
        item.status = "待归还";
      }
    }

    item.logs ||= [];
    let logNote = `核验结果：${checkResult}`;
    if (actualLocation && actualLocation.trim()) {
      logNote += ` · 实际存放点：${actualLocation.trim()}`;
    }
    if (wearNote && wearNote.trim()) {
      logNote += ` · 磨损情况：${wearNote.trim()}`;
    }
    if (needRepair) {
      logNote += " · 需要修补";
    }
    logNote += `（${user.displayName}）`;
    item.logs.push({
      at: new Date().toISOString(),
      step: "核验",
      note: logNote
    });

    if (wearNote && wearNote.trim()) {
      item.wear = wearNote.trim();
    }

    await saveDb(db);

    const latestCheckAfter = (item.checks || []).slice(-1)[0] || null;
    const recentChecksAfter = (item.checks || []).slice(-5).reverse();

    return send(res, 201, {
      success: true,
      check: checkRecord,
      latestCheck: latestCheckAfter,
      recentChecks: recentChecksAfter,
      updatedItem: {
        status: item.status,
        location: item.location,
        wear: item.wear
      }
    });
  }

  return null;
}
