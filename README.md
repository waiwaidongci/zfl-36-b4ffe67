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
│   ├── maintenance.js     维护计划 API：设置计划、完成维护、提醒查询
│   ├── import.js          批量导入 API：CSV 预览、确认导入
│   └── inventory.js       存放点盘点 API：按存放点分组查询、新增/删除盘点记录
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
| GET | `/api/inventory` | 获取所有盘点记录 |
| GET | `/api/inventory/by-location` | 按存放点分组，含道具列表和最近一次盘点 |
| GET | `/api/inventory/location/:location` | 获取指定存放点的所有盘点记录（按日期倒序） |
| POST | `/api/inventory` | 新增盘点记录（location/date/person/notes） |
| PATCH | `/api/inventory/:id` | 更新盘点记录 |
| DELETE | `/api/inventory/:id` | 删除盘点记录 |

### 前端模块

| 文件 | 职责 |
|------|------|
| `public/constants.js` | 共享常量定义，同时支持 Node.js ESM 和浏览器全局变量 |
| `public/maintenance.js` | 维护计划 HTML 渲染、设置/完成维护的事件绑定 |
| `public/reminders.js` | 维护提醒数据加载、逾期/即将到期卡片渲染 |
| `public/import.js` | CSV 批量导入的前端交互：预览、提交、文件上传 |
| `public/inventory.js` | 存放点盘点：按位置分组视图、盘点表单、历史记录查看 |
| `public/app.js` | 主入口，协调各模块，处理表单和列表 |

## 存放点盘点模块

按道具的存放位置（如"东柜二层"、"器具架A"）分组展示，支持为每个存放点记录盘点信息。

### 数据结构

盘点记录存储在 `data/cormorant-props.json` 的 `inventories` 数组中，每条记录包含：

| 字段 | 说明 |
|------|------|
| `id` | 盘点记录唯一标识 |
| `location` | 存放点名称，与道具的 `location` 字段对应 |
| `date` | 盘点日期 |
| `person` | 盘点人 |
| `notes` | 异常说明（无异常可留空） |

### 前端功能

- **分组视图**：自动按存放点分组，显示每个位置下的所有道具及其状态
- **最近盘点**：每个分组显示最近一次盘点日期、盘点人和异常说明
- **新增盘点**：选择存放点，填写盘点日期、盘点人和异常说明后提交
- **盘点历史**：展开查看某存放点的全部盘点记录，支持删除
