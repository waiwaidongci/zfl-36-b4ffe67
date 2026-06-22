import { loadDb, send } from "../db.js";
import { getReportSummary, generateItemStats, generateCSV, generateEventStats, generateEventCSV } from "../services/stats.js";

export async function handleReports(req, res, url) {
  const db = await loadDb();

  if (req.method === "GET" && url.pathname === "/api/reports/summary") {
    const startDate = url.searchParams.get("startDate");
    const endDate = url.searchParams.get("endDate");
    const summary = getReportSummary(db, startDate, endDate);
    return send(res, 200, summary);
  }

  if (req.method === "GET" && url.pathname === "/api/reports/items") {
    const startDate = url.searchParams.get("startDate");
    const endDate = url.searchParams.get("endDate");
    const items = generateItemStats(db, startDate, endDate);
    const summary = getReportSummary(db, startDate, endDate);
    return send(res, 200, { summary, items });
  }

  if (req.method === "GET" && url.pathname === "/api/reports/export") {
    const startDate = url.searchParams.get("startDate");
    const endDate = url.searchParams.get("endDate");
    const summary = getReportSummary(db, startDate, endDate);
    const items = generateItemStats(db, startDate, endDate);
    const csv = generateCSV({ summary, items });

    const filename = `运营报表_${startDate || "开始"}_${endDate || "至今"}.csv`;
    res.writeHead(200, {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${encodeURIComponent(filename)}"`
    });
    res.end(csv);
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/reports/events") {
    const startDate = url.searchParams.get("startDate");
    const endDate = url.searchParams.get("endDate");
    const events = generateEventStats(db, startDate, endDate);
    return send(res, 200, { events, startDate: startDate || "", endDate: endDate || "" });
  }

  if (req.method === "GET" && url.pathname === "/api/reports/events/export") {
    const startDate = url.searchParams.get("startDate");
    const endDate = url.searchParams.get("endDate");
    const events = generateEventStats(db, startDate, endDate);
    const csv = generateEventCSV(events, startDate, endDate);

    const filename = `活动维度报表_${startDate || "开始"}_${endDate || "至今"}.csv`;
    res.writeHead(200, {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${encodeURIComponent(filename)}"`
    });
    res.end(csv);
    return true;
  }

  return null;
}
