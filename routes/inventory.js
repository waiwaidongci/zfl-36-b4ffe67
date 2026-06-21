import { loadDb, saveDb, body, send, newId } from "../db.js";

export async function handleInventory(req, res, url) {
  const db = await loadDb();

  if (req.method === "GET" && url.pathname === "/api/inventory") {
    db.inventories ||= [];
    return send(res, 200, db.inventories);
  }

  if (req.method === "GET" && url.pathname === "/api/inventory/by-location") {
    db.inventories ||= [];
    const locationMap = {};
    for (const item of db.items) {
      const loc = item.location || "未指定";
      if (!locationMap[loc]) locationMap[loc] = { location: loc, items: [], lastInventory: null };
      locationMap[loc].items.push(item);
    }
    for (const inv of db.inventories) {
      const loc = inv.location;
      if (locationMap[loc]) {
        if (!locationMap[loc].lastInventory || inv.date > locationMap[loc].lastInventory.date) {
          locationMap[loc].lastInventory = inv;
        }
      }
    }
    const groups = Object.values(locationMap).sort((a, b) => a.location.localeCompare(b.location, "zh-CN"));
    return send(res, 200, groups);
  }

  if (req.method === "GET" && url.pathname.match(/^\/api\/inventory\/location\//)) {
    const loc = decodeURIComponent(url.pathname.replace("/api/inventory/location/", ""));
    db.inventories ||= [];
    const records = db.inventories.filter(i => i.location === loc).sort((a, b) => b.date.localeCompare(a.date));
    return send(res, 200, records);
  }

  if (req.method === "POST" && url.pathname === "/api/inventory") {
    const input = await body(req);
    if (!input.location) return send(res, 400, { error: "存放点不能为空" });
    if (!input.date) return send(res, 400, { error: "盘点日期不能为空" });
    if (!input.person) return send(res, 400, { error: "盘点人不能为空" });
    db.inventories ||= [];
    const record = {
      id: newId(),
      location: input.location,
      date: input.date,
      person: input.person,
      notes: input.notes || ""
    };
    db.inventories.push(record);
    await saveDb(db);
    return send(res, 201, record);
  }

  const patchMatch = url.pathname.match(/^\/api\/inventory\/([^/]+)$/);
  if (patchMatch && req.method === "PATCH") {
    db.inventories ||= [];
    const record = db.inventories.find(x => x.id === patchMatch[1]);
    if (!record) return send(res, 404, { error: "inventory_not_found" });
    const input = await body(req);
    if (input.date !== undefined) record.date = input.date;
    if (input.person !== undefined) record.person = input.person;
    if (input.notes !== undefined) record.notes = input.notes;
    if (input.location !== undefined) record.location = input.location;
    await saveDb(db);
    return send(res, 200, record);
  }

  const deleteMatch = url.pathname.match(/^\/api\/inventory\/([^/]+)$/);
  if (deleteMatch && req.method === "DELETE") {
    db.inventories ||= [];
    const idx = db.inventories.findIndex(x => x.id === deleteMatch[1]);
    if (idx === -1) return send(res, 404, { error: "inventory_not_found" });
    const removed = db.inventories.splice(idx, 1)[0];
    await saveDb(db);
    return send(res, 200, removed);
  }

  return null;
}
