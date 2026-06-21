import http from "node:http";
import { html, send } from "./db.js";
import { handleItems } from "./routes/items.js";
import { handleMaintenance } from "./routes/maintenance.js";
import { handleImport } from "./routes/import.js";
import { handleInventory } from "./routes/inventory.js";
import { renderPage, serveStatic } from "./public/page.js";

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

    send(res, 404, { error: "not_found" });
  } catch (error) {
    send(res, 500, { error: error.message });
  }
});

server.listen(port, () => console.log("鸬鹚捕鱼道具维护 listening on http://localhost:" + port));
