import http from "node:http";
import { html, send } from "./db.js";
import { handleItems } from "./routes/items.js";
import { handleMaintenance } from "./routes/maintenance.js";
import { handleImport } from "./routes/import.js";
import { handleInventory } from "./routes/inventory.js";
import { handleReturns } from "./routes/returns.js";
import { handleRepairs } from "./routes/repairs.js";
import { handleQrcode } from "./routes/qrcode.js";
import { handleBatches } from "./routes/batches.js";
import { handleReports } from "./routes/reports.js";
import { renderPage, renderQrcodeDetailPage, renderBatchesPage, renderBatchDetailPage, renderReportsPage, serveStatic } from "./public/page.js";

const port = Number(process.env.PORT || 3036);

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);

    if (req.method === "GET" && url.pathname === "/") {
      return html(res, renderPage());
    }

    if (await serveStatic(req, res, url)) return;

    const itemResult = await handleItems(req, res, url);
    if (itemResult !== null) return;

    const maintResult = await handleMaintenance(req, res, url);
    if (maintResult !== null) return;

    const importResult = await handleImport(req, res, url);
    if (importResult !== null) return;

    const inventoryResult = await handleInventory(req, res, url);
    if (inventoryResult !== null) return;

    const returnResult = await handleReturns(req, res, url);
    if (returnResult !== null) return;

    const repairResult = await handleRepairs(req, res, url);
    if (repairResult !== null) return;

    const qrcodeResult = await handleQrcode(req, res, url);
    if (qrcodeResult !== null) return;

    const batchesResult = await handleBatches(req, res, url);
    if (batchesResult !== null) return;

    const reportsResult = await handleReports(req, res, url);
    if (reportsResult !== null) return;

    const qrDetailMatch = url.pathname.match(/^\/qrcode\/([^/]+)$/);
    if (qrDetailMatch && req.method === "GET") {
      return html(res, renderQrcodeDetailPage(qrDetailMatch[1]));
    }

    const batchesMatch = url.pathname.match(/^\/batches$/);
    if (batchesMatch && req.method === "GET") {
      return html(res, renderBatchesPage());
    }

    const batchDetailMatch = url.pathname.match(/^\/batches\/([^/]+)$/);
    if (batchDetailMatch && req.method === "GET") {
      return html(res, renderBatchDetailPage(batchDetailMatch[1]));
    }

    const reportsMatch = url.pathname.match(/^\/reports$/);
    if (reportsMatch && req.method === "GET") {
      return html(res, renderReportsPage());
    }

    send(res, 404, { error: "not_found" });
  } catch (error) {
    send(res, 500, { error: error.message });
  }
});

server.listen(port, () => console.log("鸬鹚捕鱼道具维护 listening on http://localhost:" + port));
