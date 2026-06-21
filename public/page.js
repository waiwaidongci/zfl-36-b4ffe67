import { readFile } from "node:fs/promises";
import { join, dirname, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { stages } from "./constants.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8"
};

export function renderPage() {
  const stageOptions = stages.map(s => '<option>' + s + '</option>').join('');
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>鸬鹚捕鱼道具维护</title>
  <link rel="stylesheet" href="/public/style.css">
</head>
<body>
  <header><div><h1>鸬鹚捕鱼道具维护</h1><div class="meta">道具建档、演示借用、归还和维护闭环</div></div><button id="reload">刷新</button></header>
  <main>
    <section>
      <form id="createForm"><h2>新增道具</h2><div id="fields"></div><label>初始状态</label><select name="status">${stageOptions}</select><button>保存道具</button></form>
      <form id="actionForm" style="margin-top:14px"><h2>创建演示借用单</h2><label>选择道具</label><select name="id" id="itemSelect"></select><div id="extraFields"></div><button>提交记录</button></form>
    </section>
    <section>
      <div class="stats" id="stats"></div>
      <div id="reminders" class="reminders"></div>
      <div class="toolbar"><select id="statusFilter"><option value="">全部状态</option>${stageOptions}</select><input id="search" placeholder="搜索编号或关键词"></div>
      <div class="panel"><h2>新增道具后可创建外出演示借用单，随后登记归还或维护备注。</h2><div class="grid" id="cards"></div></div>
    </section>
  </main>
  <script type="module" src="/public/app.js"></script>
</body>
</html>`;
}

export async function serveStatic(req, res, url) {
  if (!url.pathname.startsWith("/public/")) return false;
  const relativePath = url.pathname.slice("/public".length);
  const filePath = join(__dirname, relativePath);
  const ext = extname(filePath);
  const mime = mimeTypes[ext];
  if (!mime) return false;
  try {
    const content = await readFile(filePath);
    res.writeHead(200, { "Content-Type": mime });
    res.end(content);
    return true;
  } catch {
    return false;
  }
}
