export function isInDateRange(dateStr, startDate, endDate) {
  if (!dateStr) return false;
  const date = new Date(dateStr);
  const start = startDate ? new Date(startDate) : null;
  const end = endDate ? new Date(endDate + "T23:59:59.999Z") : null;
  if (start && date < start) return false;
  if (end && date > end) return false;
  return true;
}

export function calculateBorrowCount(db, startDate, endDate) {
  let count = 0;
  for (const item of db.items || []) {
    for (const b of item.borrowings || []) {
      if (isInDateRange(b.at, startDate, endDate)) {
        count++;
      }
    }
  }
  return count;
}

export function calculateOverdueCount(db, startDate, endDate) {
  const now = new Date();
  const overdueItems = new Set();

  for (const item of db.items || []) {
    const borrowings = item.borrowings || [];
    const returns = item.returns || [];

    for (const borrowing of borrowings) {
      if (!borrowing.dueDate) continue;

      const dueDate = new Date(borrowing.dueDate);
      const start = startDate ? new Date(startDate) : null;
      const end = endDate ? new Date(endDate + "T23:59:59.999Z") : null;

      if (start && dueDate < start) continue;
      if (end && dueDate > end) continue;

      const hasReturn = returns.some(r => {
        if (!r.returnDate) return false;
        const returnDate = new Date(r.returnDate);
        return returnDate >= dueDate;
      });

      const isStillBorrowed = item.status === "已借出" || item.status === "待归还";
      const isOverdue = dueDate < now && (!hasReturn || isStillBorrowed);

      if (isOverdue) {
        overdueItems.add(item.id || item.code);
      }
    }
  }

  return overdueItems.size;
}

const REPAIR_KEYWORDS = ["修补", "加固", "修复", "打蜡", "上漆", "打磨", "更换", "检修", "补扎", "梳理", "保养", "抛光", "清理", "上蜡"];

function isMaintenanceRepairLog(log) {
  if (log.step !== "维护") return false;
  if (log.note && log.note.includes("CP-REP-")) return false;
  if (log.note && log.note.includes("修补工单")) return false;
  const note = log.note || "";
  return REPAIR_KEYWORDS.some(k => note.includes(k));
}

export function calculateRepairCount(db, startDate, endDate) {
  const orderIds = new Set();
  for (const order of db.repairOrders || []) {
    if (isInDateRange(order.createdAt, startDate, endDate)) {
      orderIds.add(order.id);
    }
  }

  let logRepairCount = 0;
  for (const item of db.items || []) {
    for (const log of item.logs || []) {
      if (isInDateRange(log.at, startDate, endDate) && isMaintenanceRepairLog(log)) {
        logRepairCount++;
      }
    }
  }

  return orderIds.size + logRepairCount;
}

export function calculateAvailableRate(db) {
  const totalItems = (db.items || []).length;
  if (totalItems === 0) return 0;
  const availableItems = (db.items || []).filter(i => i.status === "可借用").length;
  return Math.round((availableItems / totalItems) * 10000) / 100;
}

export function generateItemStats(db, startDate, endDate) {
  const items = db.items || [];
  return items.map(item => {
    const id = item.id || item.code;

    const borrowCount = (item.borrowings || []).filter(b =>
      isInDateRange(b.at, startDate, endDate)
    ).length;

    const repairOrderCount = (db.repairOrders || []).filter(o =>
      (o.itemId === id || o.itemCode === item.code) &&
      isInDateRange(o.createdAt, startDate, endDate)
    ).length;

    const logRepairCount = (item.logs || []).filter(l =>
      isInDateRange(l.at, startDate, endDate) && isMaintenanceRepairLog(l)
    ).length;

    const repairCount = repairOrderCount + logRepairCount;

    let overdueCount = 0;
    const now = new Date();
    const returns = item.returns || [];
    for (const b of item.borrowings || []) {
      if (!b.dueDate) continue;
      const dueDate = new Date(b.dueDate);
      const start = startDate ? new Date(startDate) : null;
      const end = endDate ? new Date(endDate + "T23:59:59.999Z") : null;
      if (start && dueDate < start) continue;
      if (end && dueDate > end) continue;

      const hasReturn = returns.some(r => {
        if (!r.returnDate) return false;
        return new Date(r.returnDate) >= dueDate;
      });

      const isStillBorrowed = item.status === "已借出" || item.status === "待归还";
      if (dueDate < now && (!hasReturn || isStillBorrowed)) {
        overdueCount++;
      }
    }

    return {
      id,
      code: item.code,
      name: item.name,
      status: item.status,
      borrowCount,
      repairCount,
      overdueCount,
      isAvailable: item.status === "可借用"
    };
  });
}

export function getReportSummary(db, startDate, endDate) {
  return {
    startDate: startDate || "",
    endDate: endDate || "",
    totalItems: (db.items || []).length,
    borrowCount: calculateBorrowCount(db, startDate, endDate),
    overdueCount: calculateOverdueCount(db, startDate, endDate),
    repairCount: calculateRepairCount(db, startDate, endDate),
    availableRate: calculateAvailableRate(db),
    generatedAt: new Date().toISOString()
  };
}

function normalizeEventName(name) {
  if (!name) return "";
  return name.trim().replace(/\s+/g, "");
}

function getDateKey(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

function findNearestBorrowingForRepair(repairDate, borrowings) {
  const repairTime = new Date(repairDate).getTime();
  let nearest = null;
  let minDiff = Infinity;

  for (const b of borrowings || []) {
    const borrowTime = new Date(b.at).getTime();
    if (borrowTime > repairTime) continue;
    const diff = repairTime - borrowTime;
    if (diff < minDiff) {
      minDiff = diff;
      nearest = b;
    }
  }
  return nearest;
}

export function generateEventStats(db, startDate, endDate) {
  const items = db.items || [];
  const repairOrders = db.repairOrders || [];
  const now = new Date();

  const eventMap = new Map();
  const eventDates = new Map();
  const eventBatchIds = new Map();

  for (const item of items) {
    const itemId = item.id || item.code;
    const returns = item.returns || [];
    const sortedBorrowings = (item.borrowings || []).slice().sort((a, b) => new Date(a.at) - new Date(b.at));

    for (const b of sortedBorrowings) {
      if (!isInDateRange(b.at, startDate, endDate)) continue;

      const rawName = b.eventName || "";
      const eventKey = normalizeEventName(rawName) || "(未命名活动)";
      const display = rawName.trim() || "(未命名活动)";
      const dateKey = getDateKey(b.at);

      if (!eventMap.has(eventKey)) {
        eventMap.set(eventKey, {
          eventName: display,
          borrowCount: 0,
          singleBorrowCount: 0,
          batchBorrowCount: 0,
          itemIds: new Set(),
          overdueCount: 0,
          repairCount: 0,
          lastBorrowAt: b.at
        });
        eventDates.set(eventKey, new Set());
        eventBatchIds.set(eventKey, new Set());
      }

      const ev = eventMap.get(eventKey);
      const dates = eventDates.get(eventKey);
      const batchIds = eventBatchIds.get(eventKey);

      ev.borrowCount++;
      ev.itemIds.add(itemId);
      if (dateKey) dates.add(dateKey);

      if (b.batchId) {
        batchIds.add(b.batchId);
      } else {
        ev.singleBorrowCount++;
      }

      if (b.at && (!ev.lastBorrowAt || new Date(b.at) > new Date(ev.lastBorrowAt))) {
        ev.lastBorrowAt = b.at;
      }

      if (b.dueDate) {
        const dueDate = new Date(b.dueDate);
        const hasReturn = returns.some(r => {
          if (!r.returnDate) return false;
          return new Date(r.returnDate) >= dueDate;
        });
        const isStillBorrowed = item.status === "已借出" || item.status === "待归还";
        if (dueDate < now && (!hasReturn || isStillBorrowed)) {
          ev.overdueCount++;
        }
      }
    }

    for (const order of repairOrders) {
      if (!isInDateRange(order.createdAt, startDate, endDate)) continue;
      const targetId = order.itemId || order.itemCode;
      if (targetId !== itemId && targetId !== item.code) continue;

      const nearest = findNearestBorrowingForRepair(order.createdAt, sortedBorrowings);
      if (nearest && isInDateRange(nearest.at, startDate, endDate)) {
        const rawName = nearest.eventName || "";
        const eventKey = normalizeEventName(rawName) || "(未命名活动)";
        const ev = eventMap.get(eventKey);
        if (ev) {
          ev.repairCount++;
        }
      }
    }

    for (const log of item.logs || []) {
      if (!isInDateRange(log.at, startDate, endDate)) continue;
      if (!isMaintenanceRepairLog(log)) continue;

      const nearest = findNearestBorrowingForRepair(log.at, sortedBorrowings);
      if (nearest && isInDateRange(nearest.at, startDate, endDate)) {
        const rawName = nearest.eventName || "";
        const eventKey = normalizeEventName(rawName) || "(未命名活动)";
        const ev = eventMap.get(eventKey);
        if (ev) {
          ev.repairCount++;
        }
      }
    }
  }

  const results = [];
  for (const [key, ev] of eventMap) {
    const dates = eventDates.get(key) || new Set();
    const batchIds = eventBatchIds.get(key) || new Set();
    results.push({
      eventName: ev.eventName,
      eventCount: dates.size,
      borrowCount: ev.borrowCount,
      singleBorrowCount: ev.singleBorrowCount,
      batchBorrowCount: batchIds.size,
      itemCount: ev.itemIds.size,
      overdueCount: ev.overdueCount,
      repairCount: ev.repairCount,
      lastBorrowAt: ev.lastBorrowAt
    });
  }

  results.sort((a, b) => {
    if (!a.lastBorrowAt) return 1;
    if (!b.lastBorrowAt) return -1;
    return new Date(b.lastBorrowAt) - new Date(a.lastBorrowAt);
  });

  return results;
}

export function generateEventCSV(events, startDate, endDate) {
  const headers = [
    "活动名称",
    "活动次数",
    "借用次数",
    "单道具借用",
    "批次借用",
    "涉及道具数",
    "逾期未归还数",
    "产生修补数",
    "最近借用时间"
  ];

  const rows = events.map(ev => [
    ev.eventName,
    ev.eventCount,
    ev.borrowCount,
    ev.singleBorrowCount,
    ev.batchBorrowCount,
    ev.itemCount,
    ev.overdueCount,
    ev.repairCount,
    ev.lastBorrowAt ? new Date(ev.lastBorrowAt).toLocaleString("zh-CN") : ""
  ]);

  const summaryRows = [
    [],
    ["汇总统计"],
    ["统计周期", (startDate || "开始") + " 至 " + (endDate || "至今")],
    ["活动总数", events.length],
    ["活动总次数", events.reduce((s, e) => s + e.eventCount, 0)],
    ["借用总次数", events.reduce((s, e) => s + e.borrowCount, 0)],
    ["逾期未归还总数", events.reduce((s, e) => s + e.overdueCount, 0)],
    ["修补总数", events.reduce((s, e) => s + e.repairCount, 0)],
    ["生成时间", new Date().toLocaleString("zh-CN")]
  ];

  const allRows = [headers, ...rows, ...summaryRows];

  const escapeField = (field) => {
    const str = String(field ?? "");
    if (str.includes(",") || str.includes('"') || str.includes("\n")) {
      return '"' + str.replace(/"/g, '""') + '"';
    }
    return str;
  };

  return "\uFEFF" + allRows.map(row => row.map(escapeField).join(",")).join("\n");
}

export function generateCSV(report) {
  const headers = [
    "编号",
    "名称",
    "当前状态",
    "借用次数",
    "逾期次数",
    "修补次数",
    "是否可借用"
  ];

  const rows = report.items.map(item => [
    item.code || item.id,
    item.name,
    item.status,
    item.borrowCount,
    item.overdueCount,
    item.repairCount,
    item.isAvailable ? "是" : "否"
  ]);

  const summaryRows = [
    [],
    ["汇总统计"],
    ["统计周期", report.summary.startDate + " 至 " + report.summary.endDate],
    ["道具总数", report.summary.totalItems],
    ["借用总次数", report.summary.borrowCount],
    ["逾期未归还数", report.summary.overdueCount],
    ["修补总次数", report.summary.repairCount],
    ["可借用率", report.summary.availableRate + "%"],
    ["生成时间", new Date(report.summary.generatedAt).toLocaleString("zh-CN")]
  ];

  const allRows = [headers, ...rows, ...summaryRows];

  const escapeField = (field) => {
    const str = String(field ?? "");
    if (str.includes(",") || str.includes('"') || str.includes("\n")) {
      return '"' + str.replace(/"/g, '""') + '"';
    }
    return str;
  };

  return "\uFEFF" + allRows.map(row => row.map(escapeField).join(",")).join("\n");
}
