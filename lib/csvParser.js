export const REQUIRED_HEADERS = ["编号", "名称", "用途", "材质", "存放点"];
export const HEADER_KEY_MAP = {
  "编号": "code",
  "名称": "name",
  "用途": "purpose",
  "材质": "material",
  "存放点": "location"
};

export const UPDATABLE_FIELDS = ["name", "purpose", "material", "location"];
export const UPDATABLE_FIELD_LABELS = {
  name: "名称",
  purpose: "用途",
  material: "材质",
  location: "存放点"
};
export const NON_UPDATABLE_FIELD_LABELS = {
  status: "当前状态",
  wear: "磨损情况",
  lastMaintenance: "最近维护日期",
  maintenancePlan: "维护计划",
  borrowings: "借用记录",
  returns: "归还记录",
  repairOrders: "修补工单",
  logs: "操作日志",
  tasks: "任务"
};

export function parseCSV(text) {
  const rows = splitCSVLines(text);
  if (rows.length === 0) {
    return { success: [], errors: [{ line: 0, message: "CSV内容为空" }] };
  }

  const headerRow = rows[0].map(h => h.trim());
  const headerErrors = validateHeaders(headerRow);
  if (headerErrors.length > 0) {
    return { success: [], errors: headerErrors };
  }

  const headerIndex = {};
  for (const required of REQUIRED_HEADERS) {
    const idx = headerRow.indexOf(required);
    if (idx !== -1) headerIndex[required] = idx;
  }

  const success = [];
  const errors = [];

  for (let i = 1; i < rows.length; i++) {
    const lineNum = i + 1;
    const row = rows[i];

    if (row.every(cell => !cell || !cell.trim())) {
      continue;
    }

    const result = parseRow(row, headerIndex, lineNum);
    if (result.error) {
      errors.push(result.error);
    } else {
      success.push(result.item);
    }
  }

  return { success, errors };
}

function validateHeaders(headers) {
  const errors = [];
  for (const required of REQUIRED_HEADERS) {
    if (!headers.includes(required)) {
      errors.push({ line: 1, message: `缺少必需的列头：${required}` });
    }
  }
  return errors;
}

function parseRow(row, headerIndex, lineNum) {
  const item = {};
  const missing = [];

  for (const header of REQUIRED_HEADERS) {
    const idx = headerIndex[header];
    const value = (row[idx] || "").trim();
    if (!value) {
      missing.push(header);
    } else {
      item[HEADER_KEY_MAP[header]] = value;
    }
  }

  if (missing.length > 0) {
    return { error: { line: lineNum, message: `缺少字段：${missing.join("、")}`, raw: row.join(",") } };
  }

  if (!/^[A-Za-z0-9\-_]+$/.test(item.code)) {
    return { error: { line: lineNum, message: `编号格式不合法（仅允许字母、数字、-、_），当前值：${item.code}`, raw: row.join(",") } };
  }

  return { item };
}

function splitCSVLines(text) {
  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const rows = [];
  let currentRow = [];
  let currentField = "";
  let inQuotes = false;

  for (let i = 0; i < normalized.length; i++) {
    const ch = normalized[i];

    if (inQuotes) {
      if (ch === '"') {
        if (normalized[i + 1] === '"') {
          currentField += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        currentField += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        currentRow.push(currentField);
        currentField = "";
      } else if (ch === "\n") {
        currentRow.push(currentField);
        rows.push(currentRow);
        currentRow = [];
        currentField = "";
      } else {
        currentField += ch;
      }
    }
  }

  if (currentField.length > 0 || currentRow.length > 0) {
    currentRow.push(currentField);
    rows.push(currentRow);
  }

  return rows;
}

export function buildItem(item, existingCodes) {
  const now = new Date().toISOString();
  return {
    id: "CP-" + Date.now() + "-" + Math.random().toString(36).slice(2, 6),
    code: item.code,
    name: item.name,
    purpose: item.purpose,
    material: item.material,
    location: item.location,
    wear: "",
    lastMaintenance: "",
    status: "可借用",
    maintenancePlan: null,
    logs: [{ at: now, step: "建档", note: "批量导入" }]
  };
}

export function findDuplicates(items, existingItems) {
  const existingCodes = new Set(existingItems.map(i => i.code));
  const seen = new Set();
  const duplicates = [];
  const dbExists = [];

  for (let i = 0; i < items.length; i++) {
    const code = items[i].code;
    if (seen.has(code)) {
      duplicates.push({ index: i, code, reason: "导入数据中重复" });
    } else if (existingCodes.has(code)) {
      dbExists.push({ index: i, code, reason: "编号已存在于数据库" });
    }
    seen.add(code);
  }

  return { fileDuplicates: duplicates, dbDuplicates: dbExists };
}

export function analyzeDuplicateItems(parsedItems, duplicates, existingItems, repairOrders = []) {
  const existingByCode = new Map(existingItems.map(i => [i.code, i]));
  const result = [];

  for (const dup of duplicates) {
    const parsed = parsedItems[dup.index];
    const existing = existingByCode.get(dup.code);
    if (!existing) continue;

    const updatableFields = [];
    const nonUpdatableFields = [];
    const changedFields = [];

    for (const field of UPDATABLE_FIELDS) {
      const oldValue = existing[field] || "";
      const newValue = parsed[field] || "";
      const changed = oldValue !== newValue;
      updatableFields.push({
        field,
        label: UPDATABLE_FIELD_LABELS[field],
        oldValue,
        newValue,
        changed
      });
      if (changed) changedFields.push(field);
    }

    for (const [field, label] of Object.entries(NON_UPDATABLE_FIELD_LABELS)) {
      let value;
      let displayValue;

      if (field === "repairOrders") {
        value = repairOrders.filter(o => o.itemCode === dup.code || o.itemId === dup.code || existing.id && o.itemId === existing.id);
        displayValue = `${value.length} 条记录`;
      } else {
        value = existing[field];
        if (Array.isArray(value)) {
          displayValue = `${value.length} 条记录`;
        } else if (value && typeof value === "object") {
          displayValue = "已设置";
        } else if (value === null || value === undefined || value === "") {
          displayValue = "未设置";
        } else {
          displayValue = value;
        }
      }

      nonUpdatableFields.push({
        field,
        label,
        value: displayValue
      });
    }

    result.push({
      index: dup.index,
      code: dup.code,
      reason: dup.reason,
      updatableFields,
      nonUpdatableFields,
      hasChanges: changedFields.length > 0,
      changedFields
    });
  }

  return result;
}

export function updateItemFields(existingItem, newData, userName) {
  const now = new Date().toISOString();
  const changes = [];

  for (const field of UPDATABLE_FIELDS) {
    const oldValue = existingItem[field] || "";
    const newValue = newData[field] || "";
    if (oldValue !== newValue) {
      changes.push(`${UPDATABLE_FIELD_LABELS[field]}: "${oldValue}" → "${newValue}"`);
      existingItem[field] = newValue;
    }
  }

  existingItem.logs ||= [];
  const note = changes.length > 0
    ? `批量导入更新：${changes.join("；")}（${userName}）`
    : `批量导入检查，无变更（${userName}）`;

  existingItem.logs.push({
    at: now,
    step: "档案更新",
    note
  });

  return {
    updated: changes.length > 0,
    changes,
    item: existingItem
  };
}
