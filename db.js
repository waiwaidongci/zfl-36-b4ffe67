import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { seed } from "./data/seed.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const dbPath = join(__dirname, "data", "cormorant-props.json");

export function migrateDb(db) {
  let changed = false;
  if (!Array.isArray(db.borrowBatches)) {
    db.borrowBatches = [];
    changed = true;
  }
  for (const item of db.items) {
    if (!Array.isArray(item.borrowings)) {
      item.borrowings = [];
      changed = true;
    }
    for (const b of item.borrowings) {
      if (b.batchId === undefined) {
        b.batchId = null;
        changed = true;
      }
    }
  }
  return changed;
}

export async function loadDb() {
  if (!existsSync(dbPath)) {
    await mkdir(dirname(dbPath), { recursive: true });
    await writeFile(dbPath, JSON.stringify(seed, null, 2));
  }
  const db = JSON.parse(await readFile(dbPath, "utf8"));
  if (migrateDb(db)) {
    await saveDb(db);
  }
  return db;
}

export async function saveDb(db) {
  await writeFile(dbPath, JSON.stringify(db, null, 2));
}

export async function body(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {};
}

export function send(res, status, data) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data, null, 2));
}

export function html(res, text) {
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(text);
}

export function newId() {
  return "CP-" + Date.now();
}

export function newBatchId() {
  return "BATCH-" + Date.now();
}

export function summarize(item) {
  const logCount = (item.logs || []).length + (item.tasks || []).reduce((n, t) => n + (t.logs || []).length, 0);
  return { ...item, logCount };
}
