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
│   ├── inventory.js       存放点盘点 API：按存放点分组查询、新增/删除盘点记录
│   ├── qrcode.js          二维码标签 API：道具详情查询（支持 code/id 双标识）
├── public/
│   ├── constants.js       共享常量：字段、状态、维护类型等（前后端共用）
│   ├── page.js            HTML 页面生成与静态文件服务
│   ├── style.css          前端样式（含维护提醒区块）
│   ├── app.js             前端主入口：表单、列表渲染、事件绑定
│   ├── maintenance.js     维护计划模块：计划HTML渲染、事件处理
│   ├── reminders.js       提醒模块：维护提醒的加载与渲染
│   ├── qrcode.js          轻量二维码生成器
│   ├── qrcode-label.js    二维码标签预览、打印和下载
│   └── qrcode-detail.js   扫码只读详情页渲染
└── package.json
```

## 代码组织原则

API 逻辑、前端脚本、样式、数据种子和文档分别独立在不同文件中，避免全部代码堆在 `server.js`：

- **API 逻辑** → `routes/items.js`、`routes/maintenance.js`
- **前端脚本** → `public/app.js`、`public/maintenance.js`、`public/reminders.js`
- **前端样式** → `public/style.css`、`public/qrcode-label.css`、`public/qrcode-detail.css`
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
| GET | `/api/qrcode/:identifier` | 获取二维码扫码详情数据，`identifier` 支持道具 `code` 或 `id` |

### 前端模块

| 文件 | 职责 |
|------|------|
| `public/constants.js` | 共享常量定义，同时支持 Node.js ESM 和浏览器全局变量 |
| `public/maintenance.js` | 维护计划 HTML 渲染、设置/完成维护的事件绑定 |
| `public/reminders.js` | 维护提醒数据加载、逾期/即将到期卡片渲染 |
| `public/import.js` | CSV 批量导入的前端交互：预览、提交、文件上传 |
| `public/inventory.js` | 存放点盘点：按位置分组视图、盘点表单、历史记录查看 |
| `public/app.js` | 主入口，协调各模块，处理表单和列表 |
| `public/qrcode.js` | 轻量二维码生成器，无需额外 npm 依赖 |
| `public/qrcode-label.js` | 标签弹窗、二维码生成、打印和图片下载 |
| `public/qrcode-detail.js` | 扫码只读详情页的数据加载和渲染 |

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

## 修补工单模块

为状态为"需修补"的道具创建修补工单，完整记录修补过程，完成后自动更新道具状态并追加维护日志。

### 数据结构

修补工单存储在 `data/cormorant-props.json` 的 `repairOrders` 数组中，每条记录包含：

| 字段 | 说明 |
|------|------|
| `id` | 工单唯一标识（格式 CP-REP-xxx） |
| `itemId` | 关联道具 ID 或编号 |
| `itemCode` | 道具编号 |
| `itemName` | 道具名称 |
| `status` | 工单状态：待处理 / 处理中 / 已完成 / 已验收 |
| `createdAt` | 创建时间 |
| `problemDescription` | 问题描述 |
| `handler` | 处理人 |
| `processingSteps` | 处理步骤 |
| `materialConsumption` | 材料消耗 |
| `completionDate` | 完成日期 |
| `acceptanceResult` | 验收结果：合格 / 不合格 / 待复验 |
| `logs` | 操作日志数组（每条含 at/step/note） |

### 工单状态流转

```
待处理 → 处理中 → 已完成（自动更新道具状态）
                    ↓（验收不合格）
                 需修补（道具保持待修状态）
```

### API 端点

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/repair-orders` | 获取所有修补工单，支持 `?status=` 和 `?itemId=` 过滤 |
| GET | `/api/repair-orders/:id` | 获取单个工单详情 |
| POST | `/api/repair-orders` | 创建新工单，仅允许"需修补"状态的道具，必填 `itemId`，可选：`problemDescription`、`handler` |
| PATCH | `/api/repair-orders/:id` | 更新工单字段（问题描述、处理人、处理步骤、材料消耗、完成日期、验收结果、状态） |
| POST | `/api/repair-orders/:id/complete` | 完成工单，自动追加维护日志并更新道具状态：验收合格→可借用，不合格→需修补 |
| DELETE | `/api/repair-orders/:id` | 删除指定工单 |
| GET | `/api/items/:id/repair-orders` | 查询指定道具的所有修补工单历史 |

### 完成工单自动行为

调用 `/api/repair-orders/:id/complete` 时，系统自动执行：

1. 将工单状态设为"已完成"，记录完成日期
2. 根据验收结果更新关联道具状态：
   - **合格 / 待复验** → 道具状态更新为"可借用"
   - **不合格** → 道具状态保持"需修补"
3. 更新道具的 `lastMaintenance` 为完成日期
4. 向工单 `logs` 追加"完成"日志，记录处理步骤、材料消耗和验收结果
5. 向道具 `logs` 追加"维护"日志，关联工单 ID 和验收结果

### 前端功能

| 文件 | 职责 |
|------|------|
| `public/repairs.js` | 修补工单完整前端交互：工单统计、创建表单、列表筛选、详情弹窗、状态更新、完成工单、删除 |

界面包含：

- **工单统计**：按状态分类显示各状态工单数（待处理/处理中/已完成/已验收）
- **创建工单**：下拉选择仅展示"需修补"状态的道具，自动带入磨损信息作为问题描述
- **工单列表**：卡片式展示，支持按状态筛选，显示道具、状态、问题、处理人、完成日期
- **详情弹窗**：完整展示工单六项信息、状态更新表单、完成工单表单、操作日志时间线
- **完成工单**：填写处理步骤、材料消耗、完成日期、验收结果后提交，自动触发状态更新

## 二维码标签模块

为每个道具生成可打印二维码标签。管理员在道具卡片点击"二维码标签"后，可以预览标签、打印标签或下载标签图片；扫码后进入只读详情页，不提供编辑入口。

### 标签内容

标签由 `public/qrcode-label.js` 生成，默认包含：

| 区域 | 内容 |
|------|------|
| 标题 | 鸬鹚捕鱼道具 |
| 编号 | 道具 `code`，没有 `code` 时使用 `id` |
| 名称 | 道具名称 |
| 二维码 | 指向 `/qrcode/:identifier` 的扫码链接 |
| 底部 | 存放点和当前状态 |

打印样式在 `public/qrcode-label.css` 中定义，标签尺寸为 60mm x 90mm，打印页尺寸为 70mm x 100mm，适合单张标签纸打印。

### 扫码详情页

扫码访问路径：

```text
/qrcode/:identifier
```

`identifier` 可以是道具 `code`，也可以是道具 `id`。页面会通过 `/api/qrcode/:identifier` 加载只读详情，展示：

- 编号、名称、状态、存放点
- 用途、材质、磨损情况
- 最近一条维护或检查记录
- 当前借用信息，包括借用人、演示活动、借出时间、预计归还日期

当前借用信息在道具状态为"已借出"或"待归还"且存在借用记录时展示；可借用或需修补状态不展示借用区块。

### API 接口

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/qrcode/:identifier` | 获取扫码详情数据，支持 `code` 和 `id` 两种标识 |

响应字段：

| 字段 | 说明 |
|------|------|
| `code` | 道具编号，缺失时回退为 `id` |
| `name` | 道具名称 |
| `status` | 当前状态 |
| `location` | 存放点 |
| `purpose` | 用途 |
| `material` | 材质 |
| `wear` | 磨损情况 |
| `lastMaintenance` | 最近维护日期字段 |
| `latestMaintenanceLog` | 最近维护或检查日志 |
| `currentBorrowing` | 当前借用信息；仅已借出或待归还状态返回 |
| `maintenancePlan` | 维护计划 |

示例：

```json
{
  "code": "CP-003",
  "name": "渔网",
  "status": "待归还",
  "location": "西柜一层",
  "latestMaintenanceLog": {
    "at": "2026-06-10",
    "step": "检查",
    "note": "网眼需观察"
  },
  "currentBorrowing": {
    "at": "2026-06-18T08:30:00.000Z",
    "borrower": "赵演员",
    "eventName": "民俗馆开馆仪式",
    "dueDate": "2026-06-22"
  }
}
```

### 使用流程

1. 在首页道具卡片点击"二维码标签"。
2. 在弹窗中检查标签预览和扫码链接。
3. 点击"打印标签"打开打印页，或点击"下载图片"保存标签图。
4. 将标签贴到道具或收纳位置上。
5. 扫码进入只读详情页，核对道具编号、状态、存放点、维护记录和当前借用信息。

## 运营报表模块

按日期范围统计道具借用次数、逾期未归还数量、修补次数和可借用率，支持导出 CSV 报表，为运营决策提供数据支持。

### 核心功能

| 功能 | 说明 |
|------|------|
| 日期范围筛选 | 支持自定义开始/结束日期，提供近7天/30天/90天/全部快捷选择 |
| 借用次数统计 | 统计指定时间段内道具被借用的总次数 |
| 逾期未归还统计 | 统计到期日在指定时间段内且仍未归还的道具数量 |
| 修补次数统计 | 统计指定时间段内创建的修补工单总数 |
| 可借用率计算 | 当前可借用道具数 / 道具总数 × 100% |
| 道具明细表 | 按道具维度展示各指标，支持搜索筛选 |
| CSV 导出 | 一键导出完整报表（含明细和汇总），带 BOM 兼容 Excel |

### API 端点

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/reports/summary` | 获取汇总统计数据，支持 `?startDate=` 和 `?endDate=` 参数 |
| GET | `/api/reports/items` | 获取道具明细统计（含汇总），支持日期范围参数 |
| GET | `/api/reports/export` | 导出 CSV 报表，自动下载，支持日期范围参数 |

### 统计指标说明

| 指标 | 计算方式 | 数据来源 |
|------|----------|----------|
| 借用次数 | 日期范围内 `item.borrowings[].at` 的记录数 | 各道具的 `borrowings` 数组 |
| 逾期未归还数 | 到期日在范围内、当前日期已超过到期日、且未按时归还的道具数（去重） | `borrowings[].dueDate` + `returns[]` + `item.status` |
| 修补次数 | 日期范围内 `repairOrders[].createdAt` 的记录数 | `repairOrders` 数组 |
| 可借用率 | `status === "可借用"` 的道具数 / 道具总数 × 100% | 各道具的 `status` 字段 |

### 前端文件

| 文件 | 职责 |
|------|------|
| `public/reports.js` | 报表页面完整前端交互：日期筛选、快捷选择、汇总展示、明细表格、CSV导出、搜索筛选 |

### 页面入口

- 首页顶部导航栏「📊 运营报表」按钮
- 直接访问路径：`/reports`

### CSV 导出格式

导出文件包含两部分：
1. **道具明细表**：编号、名称、当前状态、借用次数、逾期次数、修补次数、是否可借用
2. **汇总统计区**：统计周期、道具总数、借用总次数、逾期未归还数、修补总次数、可借用率、生成时间

CSV 文件采用 UTF-8 BOM 编码，确保在 Excel 中正确显示中文。

### 服务层模块

统计逻辑独立在 `services/stats.js` 中，提供以下核心函数：

| 函数 | 说明 |
|------|------|
| `isInDateRange(dateStr, startDate, endDate)` | 判断日期是否在指定范围内 |
| `calculateBorrowCount(db, startDate, endDate)` | 计算借用总次数 |
| `calculateOverdueCount(db, startDate, endDate)` | 计算逾期未归还道具数 |
| `calculateRepairCount(db, startDate, endDate)` | 计算修补总次数 |
| `calculateAvailableRate(db)` | 计算可借用率 |
| `generateItemStats(db, startDate, endDate)` | 生成按道具维度的统计明细 |
| `getReportSummary(db, startDate, endDate)` | 获取汇总统计数据 |
| `generateCSV(report)` | 生成 CSV 字符串（含 BOM） |

## 账号与权限模块

纯 Node.js 实现的轻量级 RBAC 权限系统，**不引入任何第三方框架**，基于 Cookie + Token 会话认证，支持三级角色权限控制。

### 核心设计原则

| 原则 | 说明 |
|------|------|
| **零依赖** | 纯 `node:http` + `node:crypto` 实现，无 Express、Passport 等框架 |
| **向后兼容** | 所有 GET 接口保持无需登录访问，老数据文件自动迁移升级 |
| **读写分离** | 读操作（列表/详情/报表/扫码）公开，写操作均需登录 + 权限校验 |
| **双重防护** | 前端按钮可见性控制 + 后端 API 权限拦截，双重保证安全 |

### 角色与权限矩阵

| 操作权限 | 管理员 admin | 维护员 maintainer | 只读用户 viewer | 未登录 |
|----------|:---:|:---:|:---:|:---:|
| 新增道具 | ✅ | ❌ | ❌ | ❌ |
| 修改道具状态 | ✅ | ❌ | ❌ | ❌ |
| 追加维护/日志 | ✅ | ✅ | ❌ | ❌ |
| 创建借用 | ✅ | ❌ | ❌ | ❌ |
| 归还登记 | ✅ | ✅ | ❌ | ❌ |
| 设置维护计划 | ✅ | ❌ | ❌ | ❌ |
| 完成维护 | ✅ | ✅ | ❌ | ❌ |
| 新增/修改/删除盘点 | ✅ | 创建✅/修改❌/删除❌ | ❌ | ❌ |
| 创建/更新/完成/删除工单 | ✅ | 创建✅/更新✅/完成✅/删除❌ | ❌ | ❌ |
| CSV 批量导入 | ✅ | ❌ | ❌ | ❌ |
| 创建/修改批次 | ✅ | ❌ | ❌ | ❌ |
| 追加批次日志 | ✅ | ✅ | ❌ | ❌ |
| 用户管理（增删改） | ✅ | ❌ | ❌ | ❌ |
| 查看列表/详情/报表 | ✅ | ✅ | ✅ | ✅ |
| 扫码查看详情 | ✅ | ✅ | ✅ | ✅ |

### 默认账号

首次启动时自动创建以下 3 个默认账号（密码建议登录后立即修改）：

| 用户名 | 密码 | 角色 | 显示名称 |
|--------|------|------|----------|
| `admin` | `admin123` | 管理员 | 系统管理员 |
| `maintainer` | `maintain123` | 维护员 | 张维护 |
| `viewer` | `view123` | 只读用户 | 李查看 |

访问路径：**`/login`** 登录，**`/users`** 用户管理（仅管理员）。

### 技术实现细节

#### 认证安全

- **密码哈希**：SHA256 单向哈希，数据库仅存储 `passwordHash`，不存储明文
- **会话机制**：随机 32 字节 Hex Token，7 天有效期，Cookie 存储
- **Cookie 属性**：`HttpOnly`（防 XSS）+ `SameSite=Lax`（防 CSRF）
- **自动清理**：每次读写数据库时自动清理过期会话
- **Bearer 兼容**：同时支持 Cookie 和 `Authorization: Bearer <token>` 两种认证方式

#### 权限检查模式

后端统一使用 `requirePermission(req, res, permission)` 中间件函数：

```javascript
// routes/items.js 示例
const user = requirePermission(req, res, PERMISSIONS.CREATE_ITEM);
if (!user) return;  // 函数内部已发送 401/403 响应
// 执行业务逻辑...
item.logs.push({ note: `${note}（${user.displayName}）` });  // 自动附加操作人
```

- 未登录 → HTTP 401 `{ error: "unauthorized" }`
- 权限不足 → HTTP 403 `{ error: "forbidden" }`
- 校验通过 → 返回用户对象，用于日志审计

#### 前端权限控制

使用 `data-perm="xxx"` 属性声明式控制按钮可见性：

```html
<button data-perm="create_item">新增道具</button>
<button data-perm="add_log">追加日志</button>
<a href="/users" data-perm="manage_users">用户管理</a>
```

页面启动时调用 `applyPermissionGuards()` 自动隐藏无权限元素。所有写操作按钮都带权限属性，即使手动 DOM 操作显示按钮，后端仍会二次拦截。

### 数据结构（JSON 文件字段）

#### users 数组

```json
{
  "id": "USER-DEFAULT-ADMIN",
  "username": "admin",
  "displayName": "系统管理员",
  "role": "admin",
  "passwordHash": "240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9",
  "createdAt": "2026-01-01T00:00:00.000Z",
  "lastLoginAt": "2026-06-21T09:07:59.846Z"
}
```

#### sessions 数组

```json
{
  "token": "<随机会话令牌>",
  "userId": "USER-DEFAULT-ADMIN",
  "createdAt": "2026-06-21T09:07:59.846Z",
  "expiresAt": "2026-06-28T09:07:59.846Z"
}
```

### API 端点

#### 认证接口

| 方法 | 路径 | 说明 | 登录要求 |
|------|------|------|----------|
| POST | `/api/auth/login` | 登录，body: `{ username, password }` | ❌ |
| POST | `/api/auth/logout` | 登出，清除会话和 Cookie | ✅ |
| GET | `/api/auth/me` | 获取当前用户信息和角色定义 | 可选 |
| POST | `/api/auth/change-password` | 修改当前用户密码，body: `{ oldPassword, newPassword }` | ✅ |

#### 用户管理接口（仅管理员）

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/users` | 获取用户列表（不含密码哈希） |
| POST | `/api/users` | 新增用户，body: `{ username, password, displayName, role }` |
| PATCH | `/api/users/:id` | 修改用户，body: `{ displayName, role, password? }` |
| DELETE | `/api/users/:id` | 删除用户（同时删除该用户所有会话），禁止删除自己 |

### 文件清单（权限模块相关）

| 文件 | 职责 |
|------|------|
| `services/auth.js` | 认证服务：密码哈希、会话管理、角色权限常量、权限检查函数 |
| `routes/auth.js` | 认证路由：登录/登出/用户 CRUD/修改密码 API、`requirePermission()` 权限中间件 |
| `public/auth.js` | 前端权限模块：`initAuth()`、`can()`、`renderLoginStatusBar()`、`applyPermissionGuards()` |
| `public/users.js` | 用户管理页：列表 CRUD、修改密码弹窗 |
| `data/seed.js` | 新增 `defaultUsers` 默认账号种子（明文密码，迁移时自动哈希） |
| `db.js` | `migrateDb()` 新增 users/sessions 字段迁移逻辑 |
| `routes/*.js` | 所有写操作接口调用 `requirePermission()` 进行权限拦截 |

### 平滑升级说明

从**无账号版本**升级到此版本**完全无需人工操作**：

1. 首次启动新版代码时，`migrateDb()` 检测到 JSON 文件无 `users` 字段
2. 自动初始化 3 个默认账号（密码哈希后写入）
3. 自动初始化空 `sessions` 数组
4. 清理不存在或过期的会话数据
5. **已有道具/借用/维护等数据完全不变**，所有历史数据正常使用
6. GET 接口仍可匿名访问，扫码查看功能不受影响
7. 用户点击写操作按钮时，系统会自动跳转到登录页

---

## 数据版本迁移与备份恢复模块

### 概述

系统引入 **Schema Versioning**（数字递增的 `schemaVersion` 字段）来标识数据结构版本。服务启动时自动检测版本并执行所需迁移，每次迁移前自动生成备份。前端提供完整的备份下载、上传预检、确认恢复操作流程，确保数据安全。

**核心目标**：
- ✅ 数据升级不丢失内容（缺字段用默认值、重复编号自动重命名）
- ✅ 写入操作的原子性（避免半写损坏 JSON）
- ✅ 主数据文件损坏时自动从最近备份回滚
- ✅ 恢复流程三阶段（选择 → 预检 → 确认），恢复失败绝不破坏现有数据

### 版本历史

| schemaVersion | 说明 | 对应迁移脚本 |
|------|------|------|
| 0 | 初始无 schemaVersion 字段（历史遗留数据） | — |
| 1 | 规范化所有集合字段、补全默认值、去重编号、记录迁移元数据 | `migrations/v001_to_v1.js` |

### 项目结构（新增文件）

```
├── services/
│   └── storage.js           ⭐ 存储层：原子写入、损坏恢复、备份管理、加锁、校验
├── migrations/
│   ├── index.js             迁移编排器：加载→检测→备份→执行→写回
│   └── v001_to_v1.js        v0→v1 迁移脚本：去重/默认值/字段补全
├── routes/
│   └── backup.js            ⭐ 备份/恢复 HTTP 路由（8 个 API 端点）
├── public/
│   ├── backup.js            备份页面的前端交互逻辑（ES Module）
│   ├── auth.js              权限常量与用户栏（同步新增备份相关权限）
│   └── page.js              HTML 渲染（新增 /backup 页面）
├── test-backup-migration.js 自动化测试脚本（119 个用例，4 大测试套件）
└── data/
    ├── cormorant-props.json  主数据文件（运行时）
    └── backups/              ⭐ 备份文件目录（自动创建）
        ├── cormorant-props.backup-YYYYMMDD-HHMMSS-pre-migration-v0.json
        ├── cormorant-props.backup-YYYYMMDD-HHMMSS-pre-restore.json
        └── cormorant-props.backup-YYYYMMDD-HHMMSS-tagName.json
```

### 启动自动迁移流程

服务启动时 `server.js` 通过 `loadAndMigrate()` 依次执行：

```
1. 读取 data/cormorant-props.json
   ├─ 如果文件不存在 → 从 seed 初始化并写入 v1 结构
   └─ 如果 JSON 损坏 → 自动从 data/backups/ 下最近有效备份回滚
2. 检测 schemaVersion < TARGET_SCHEMA_VERSION ?
   ├─ 是 → 先创建备份（命名 pre-migration-vX），再依次执行所有迁移脚本，写回
   └─ 否 → 直接使用
3. 控制台打印：[启动] 数据加载成功，schemaVersion: 1
4. server.listen() 开始对外服务
```

**关键保证**：无论从哪一步出错，写回前都有完整备份可恢复。

### 边界情况处理

| 场景 | 处理方式 |
|------|------|
| **旧字段缺失** | `ensureItemDefaults()` / `ensureBatchDefaults()` / `ensureRepairDefaults()` / `ensureInventoryDefaults()` 自动补充默认值，并记录到 `warnings` |
| **重复编号** | `deduplicateCodes()` 检测重复编号，保留第一个为原编号，其余依次追加 `-DUP1` / `-DUP2` 后缀，同时写入 `_originalCode` 保留原始值 |
| **写入中断** | 所有写入采用「临时文件写入 → 内容校验 → rename 替换」原子操作；若进程在 rename 前崩溃，主文件不变；若写入临时文件失败则丢弃 |
| **JSON 损坏** | `readWithFallback()` 先读主文件，若 parse 失败 → 依次扫描 `data/backups/` 下所有备份文件（按文件名倒序），解析第一个有效 JSON 并返回 `source: 'backup'`，记录 `recoverError` |
| **并发写入冲突** | `acquireLock()` 使用 Promise 链互斥，所有写操作排队串行执行 |
| **集合不存在** | v0→v1 迁移时检查 `items/inventories/repairOrders/borrowBatches/users/sessions` 是否为数组，不是则初始化为空（users 缺省填充 admin/maintainer/viewer） |

### 备份文件格式

每个备份文件为 JSON 格式，外层包装 `backupMeta` 对象：

```json
{
  "backupMeta": {
    "createdAt": "2026-06-21T09:38:48.466Z",
    "tag": "pre-migration-v0",
    "schemaVersion": 0,
    "originalChecksum": "78edf772e7275fa3254a7ea581825ccda79f8354a02cab0408c8083da4bf1245",
    "originalBytes": 24773
  },
  "schemaVersion": 0,
  "items": [...],
  "inventories": [...],
  "repairOrders": [...],
  "borrowBatches": [...],
  "users": [...],
  "sessions": []
}
```

恢复时 `backupMeta` 会被自动剥离，不会写入主数据文件。

---

### 备份恢复前端操作（/backup 页面）

访问页面 `http://localhost:3036/backup`，顶部导航栏按钮需 `VIEW_BACKUPS` 权限。

页面包含 4 个面板：

#### 1. 📊 状态信息面板
显示当前 schemaVersion、目标版本、是否需迁移、数据各项统计（道具数/批次/工单/盘点/用户）、最近 5 条迁移记录。

#### 2. ⬇️ 下载备份面板
- **下载当前备份**：点击后服务器同步创建一次新备份并返回下载（HTTP `Content-Disposition`）
- **手动创建服务器端备份**：仅在服务器 `data/backups/` 下写备份，不下载
- **清理旧备份**：保留最近 N 份（默认 10，范围 3-100）

#### 3. 📁 历史备份列表（表格）
每行显示：备份文件名、创建时间、schemaVersion、标签、大小、操作按钮（下载 / 删除）。

#### 4. ⚠️ 恢复数据（危险操作，橙色 2px 边框）

**三阶段恢复流程**：

```
阶段 1: 选择文件
   ├─ 点击区域选择文件，或拖拽 JSON 到虚线框
   ├─ 大小限制 50MB，文件名必须 .json
   └─ 自动提交到预检

阶段 2: 预检 /api/backup/precheck（不修改任何数据）
   ├─ ✅ JSON 解析是否成功
   ├─ 🔍 是否带 backupMeta（备份包装）
   ├─ 📋 validateDatabaseObject 深度校验
   │    ├─ errors（结构错误：重复编号/重复用户名/类型错误）
   │    ├─ warnings（字段缺失警告）
   │    └─ info：各集合统计
   ├─ 🔄 预览迁移结果（若 schemaVersion < 当前目标版本）
   │    └─ willMigrate: true, migrationWarnings: [...]
   ├─ ⚠️ dangerFlags（高风险标志）：
   │    ├─ EMPTY_ITEMS — 道具数为 0（严重）
   │    ├─ NO_SCHEMA_VERSION — 来源是极旧版本
   │    ├─ DUPLICATE_CODES — 有重复编号（迁移会自动重命名）
   │    ├─ MANY_WARNINGS — warnings ≥ 10
   │    └─ EMPTY_USERS — 用户表为空
   └─ canRestore: boolean 标识是否可继续

阶段 3: 确认恢复
   ├─ 必须勾选「我已确认恢复内容，知道现有数据将被替换，且已创建本地快照」
   ├─ 点击「开始恢复」后：
   │    1. 服务器先自动创建 pre-restore 备份（写入 data/backups/）
   │    2. 使用原子写入替换主数据文件
   │    3. 回读验证：若写入后读回不一致 → 触发回滚逻辑
   │    4. 返回 preBackup 文件名（无论成功失败）
   └─ 失败时：错误信息 + preserved=true 保证现有数据安全
```

**安全红线**：预检和恢复失败时 **绝对不写入主数据文件**；恢复过程中任何异常都会返回 pre-restore 备份的位置，操作员可手动回滚。

---

### 备份/恢复 API 完整列表

所有 API 均需登录 Cookie 或 Bearer Token，基于权限控制。

| 方法 | 路径 | 所需权限 | 说明 |
|------|------|----------|------|
| GET | `/api/backup/info` | `VIEW_BACKUPS` | 返回 schema 信息、迁移状态、备份列表、数据校验结果 |
| GET | `/api/backup/download` | `DOWNLOAD_BACKUP` | 生成当前快照并以附件下载（同时在服务器写入备份） |
| GET | `/api/backup/file/:name` | `DOWNLOAD_BACKUP` | 下载指定历史备份文件（文件名校验前缀防路径穿越） |
| POST | `/api/backup/create` | `DOWNLOAD_BACKUP` | 手动创建服务器端备份，返回备份元数据 |
| POST | `/api/backup/precheck` | `RESTORE_BACKUP` | **核心预检**：Body=备份 JSON，返回解析结果、校验报告、迁移预览、dangerFlags、canRestore |
| POST | `/api/backup/restore` | `RESTORE_BACKUP` | **原子恢复**：Body=备份 JSON；先建 pre-restore 备份 → 原子写入 → 回读验证 |
| POST | `/api/backup/cleanup` | `RESTORE_BACKUP` | 清理旧备份，Body: `{ keep: 10 }`（范围 3-100） |
| DELETE | `/api/backup/file/:name` | `RESTORE_BACKUP` | 删除指定备份文件 |

### 权限矩阵

| 角色 | VIEW_BACKUPS | DOWNLOAD_BACKUP | RESTORE_BACKUP |
|------|:---:|:---:|:---:|
| ADMIN（管理员） | ✅ | ✅ | ✅ |
| MAINTAINER（维护员） | ✅ | ✅ | ❌ |
| VIEWER（查看员） | ✅ | ❌ | ❌ |

---

### 存储层（services/storage.js）API 参考

所有函数接受 `rootDir` 作为第一个参数，便于测试和隔离。

| 函数 | 说明 |
|------|------|
| `resolveDbPaths(rootDir)` | 返回 `{ dbPath, backupDir }` 绝对路径 |
| `ensureDirs(rootDir)` | 递归创建 data/ 和 data/backups/ |
| `readDatabase(rootDir)` | 读取数据库，含自动降级恢复；返回 `{ source, data, backupFile?, recoverError? }` 或 null |
| `writeDatabase(rootDir, data)` | **原子写入**：tmp → 校验 → rename；返回 `{ path, checksum, bytes }` |
| `createBackup(rootDir, tag)` | 创建带 backupMeta 包装的备份；返回备份元信息 |
| `listBackups(rootDir)` | 读取所有备份及各自的 backupMeta / 校验结果（mtime 降序） |
| `readBackup(rootDir, fileName)` | 读取指定备份内容（含 backupMeta）；文件名前缀校验防路径穿越 |
| `restoreFromBackupData(rootDir, backupData, opts)` | 恢复：`opts.validateOnly` / `opts.dryRun`；返回含 preBackup |
| `validateBackupData(rawText)` | 对备份文本做预检（JSON parse + validateDatabaseObject） |
| `validateDatabaseObject(db)` | **深度结构校验**：字段类型、重复编号、重复用户名、缺集合警告；返回 `{ valid, errors, warnings, info }` |
| `cleanupOldBackups(rootDir, keepN)` | 保留最近 N 份，删除其他；返回 `{ removed, kept }` |

---

### 运行自动化测试

```bash
node test-backup-migration.js
```

**测试套件**（4 大模块，共 119 个用例）：

| 套件 | 用例数 | 覆盖内容 |
|------|:---:|------|
| 📝 Test Suite 1: 迁移系统 | 39 | v0→v1 升级、重复编号去重、字段默认值、集合内字段补全、编排器、空对象初始化 |
| 💾 Test Suite 2: 存储层安全机制 | 40 | 原子写入、JSON 损坏自动从备份回滚、backupMeta 完整性、validateDatabaseObject 边界、文本预检、备份清理 |
| 🔄 Test Suite 3: 备份恢复完整流程 | 25 | pre-restore 备份、恢复失败不破坏数据、wrapper 剥离、dryRun 模式、v0 备份+迁移工作流 |
| ⚡ Test Suite 4: 并发写入与原子性 | 15 | 10 并发写入一致性、最终文件完整性校验、无临时文件遗留 |

**预期输出**：
```
测试汇总: 119/119 通过 (100%)
🎉 全部通过！模块状态良好。
```

---

### 故障排查

#### Q1: 启动时控制台显示「从备份恢复」相关日志，怎么办？
- **原因**：上次运行时 `data/cormorant-props.json` 在写入过程中被中断或损坏。
- **处理**：系统已自动回滚到最近有效备份。查看 `data/backups/pre-migration-*` 或最新备份确认数据完整性，无异常可忽略。若需恢复到特定点，可将对应备份文件通过前端「恢复数据」功能上传。

#### Q2: 恢复过程中服务器崩溃？
- **安全保证**：主数据文件要么原封不动（恢复前），要么完全写入新内容。不会出现半损坏状态。
- **手动恢复步骤**：
  1. 查看 `data/backups/` 下最新的 `pre-restore-*` 文件
  2. `cp data/backups/<pre-restore文件> data/cormorant-props.json`
  3. 重启服务

#### Q3: 预检提示 DUPLICATE_CODES？
- **原因**：备份文件内存在多个相同道具编号
- **处理**：迁移会自动保留第一个并将其余编号加上 `-DUP1/-DUP2` 后缀。若需保留原始编号，先在备份文件中手动修正后再上传。

#### Q4: 如何手动创建备份？
```bash
node -e "import('./services/storage.js').then(m => m.createBackup(require('path').resolve('.'), 'manual-backup')).then(console.log)"
```

#### Q5: 迁移 warnings 是怎么处理的？
- warnings 不阻塞迁移，仅表示「用了默认值」或「集合不存在已初始化为空」。它们会：
  1. 写入 `db._migrations[n].warnings` 数组作为永久记录
  2. 出现在前端预检面板中供操作员审核

---

### 如何添加新的迁移脚本（v2 升级）

1. 新建 `migrations/v002_to_v2.js`：
   ```javascript
   export const TARGET_SCHEMA_VERSION = 2;
   export function migrate_v1_to_v2(db, options = {}) {
     const warnings = [];
     // ... 具体迁移逻辑
     db.schemaVersion = 2;
     return { changed: true, warnings, info: {} };
   }
   ```
2. 在 `migrations/index.js` 的 `MIGRATIONS` 数组追加：
   ```javascript
   { from: 1, to: 2, run: migrate_v1_to_v2 }
   ```
3. 并同步导入该迁移函数
4. 重新启动服务 → 服务将自动检测并执行 v1→v2 迁移，同时自动备份
