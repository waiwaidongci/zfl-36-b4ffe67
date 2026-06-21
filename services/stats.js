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

export function calculateRepairCount(db, startDate, endDate) {
  let count = 0;
  for (const order of db.repairOrders || []) {
    if (isInDateRange(order.createdAt, startDate, endDate)) {
      count++;
    }
  }
  return count;
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

    const repairCount = (db.repairOrders || []).filter(o =>
      (o.itemId === id || o.itemCode === item.code) &&
      isInDateRange(o.createdAt, startDate, endDate)
    ).length;

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
