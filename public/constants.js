export const fields = [
  ["code", "编号", "text"],
  ["name", "名称", "text"],
  ["purpose", "用途", "text"],
  ["material", "材质", "text"],
  ["wear", "磨损位置", "text"],
  ["location", "存放点", "text"],
  ["lastMaintenance", "最近维护日期", "date"]
];

export const stages = ["可借用", "已借出", "待归还", "需修补"];

export const statLabels = ["待归还", "需修补", "可借用"];

export const extraFields = [
  ["borrower", "借用人"],
  ["eventName", "演示活动"],
  ["dueDate", "预计归还日期"]
];

export const maintenanceTypes = ["定期保养", "修补加固", "检查更换", "深度清洁", "全面检修"];

export const repairOrderStatuses = ["待处理", "处理中", "已完成", "已验收"];

export const repairOrderFields = [
  ["problemDescription", "问题描述", "textarea"],
  ["handler", "处理人", "text"],
  ["processingSteps", "处理步骤", "textarea"],
  ["materialConsumption", "材料消耗", "textarea"],
  ["completionDate", "完成日期", "date"],
  ["acceptanceResult", "验收结果", "text"]
];

export const repairAcceptanceResults = ["合格", "不合格", "待复验"];
