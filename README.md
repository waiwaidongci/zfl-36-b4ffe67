# 鸬鹚捕鱼道具维护

运行：

```bash
npm start
```

访问 `http://localhost:3036`。数据保存在 `data/cormorant-props.json`。

## 项目结构

```
├── server.js              入口：启动 HTTP 服务，挂载路由
├── db.js                  数据库层：读写 JSON、请求/响应工具函数
├── data/
│   ├── seed.js            种子数据，从 public/constants.js 导入常量
│   └── cormorant-props.json  运行时数据
├── routes/
│   ├── items.js           道具 CRUD、借用、状态变更 API
│   └── maintenance.js     维护计划 API：设置计划、完成维护、提醒查询
├── public/
│   ├── constants.js       共享常量：字段、状态、维护类型等（前后端共用）
│   ├── page.js            HTML 页面生成与静态文件服务
│   ├── style.css          前端样式（含维护提醒区块）
│   ├── app.js             前端主入口：表单、列表渲染、事件绑定
│   ├── maintenance.js     维护计划模块：计划HTML渲染、事件处理
│   └── reminders.js       提醒模块：维护提醒的加载与渲染
└── package.json
```

## 代码组织原则

API 逻辑、前端脚本、样式、数据种子和文档分别独立在不同文件中，避免全部代码堆在 `server.js`：

- **API 逻辑** → `routes/items.js`、`routes/maintenance.js`
- **前端脚本** → `public/app.js`、`public/maintenance.js`、`public/reminders.js`
- **前端样式** → `public/style.css`
- **数据种子** → `data/seed.js`
- **共享常量** → `public/constants.js`（前后端共用）
- **文档说明** → `README.md`

## 维护计划模块

为每个道具设置维护计划，包含三个字段：
- **下次维护日期** — 计划下次维护的时间
- **维护类型** — 定期保养 / 修补加固 / 检查更换 / 深度清洁 / 全面检修
- **负责人** — 维护责任人

首页自动显示维护提醒：
- 🔴 **已逾期** — 计划日期已过但尚未完成维护
- 🔵 **即将到期** — 计划日期在 7 天以内

### API 端点

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/items` | 获取所有道具 |
| POST | `/api/items` | 新增道具 |
| PATCH | `/api/items/:id` | 更新道具状态 |
| POST | `/api/items/:id/logs` | 追加备注日志 |
| POST | `/api/items/:id/action` | 创建借用单 |
| PUT | `/api/items/:id/maintenance-plan` | 设置/更新维护计划 |
| POST | `/api/items/:id/complete-maintenance` | 完成维护并清除计划 |
| GET | `/api/maintenance/reminders` | 获取逾期和即将到期的维护提醒 |

### 前端模块

| 文件 | 职责 |
|------|------|
| `public/constants.js` | 共享常量定义，同时支持 Node.js ESM 和浏览器全局变量 |
| `public/maintenance.js` | 维护计划 HTML 渲染、设置/完成维护的事件绑定 |
| `public/reminders.js` | 维护提醒数据加载、逾期/即将到期卡片渲染 |
| `public/app.js` | 主入口，协调各模块，处理表单和列表 |
