export const REQUIRED_HEADERS = ["编号", "名称", "用途", "材质", "存放点"];
export const HEADER_KEY_MAP = {
  "编号": "code",
  "名称": "name",
  "用途": "purpose",
  "材质": "material",
  "存放点": "location"
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

  for (let i = 0; i < items.length; i++) {
    const code = items[i].code;
    if (seen.has(code) || existingCodes.has(code)) {
      duplicates.push({ index: i, code, reason: existingCodes.has(code) ? "编号已存在于数据库" : "导入数据中重复" });
    }
    seen.add(code);
  }

  return duplicates;
}
