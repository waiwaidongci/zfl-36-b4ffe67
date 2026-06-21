import { fields, stages, statLabels, extraFields, maintenanceTypes } from "../public/constants.js";

export { fields, stages, statLabels, extraFields, maintenanceTypes };

export const seed = {
  items: [
    {
      code: "CP-001",
      name: "鸬鹚绳环",
      purpose: "外出演示",
      material: "棉绳包皮革",
      wear: "内侧轻微起毛",
      location: "东柜二层",
      lastMaintenance: "2026-06-05",
      status: "可借用",
      maintenancePlan: {
        nextDate: "2026-07-05",
        type: "定期保养",
        responsible: "张师傅"
      },
      logs: [
        { at: "2026-06-05", step: "维护", note: "重新打蜡" }
      ]
    },
    {
      code: "CP-002",
      name: "竹篓",
      purpose: "展示收鱼",
      material: "老竹篾",
      wear: "底圈松动",
      location: "器具架A",
      lastMaintenance: "2026-05-28",
      status: "需修补",
      maintenancePlan: {
        nextDate: "2026-06-15",
        type: "修补加固",
        responsible: "李工"
      },
      logs: [
        { at: "2026-05-28", step: "检查", note: "底圈需补扎" }
      ]
    },
    {
      code: "CP-003",
      name: "渔网",
      purpose: "捕鱼展示",
      material: "尼龙丝",
      wear: "网眼轻微变形",
      location: "西柜一层",
      lastMaintenance: "2026-06-10",
      status: "可借用",
      maintenancePlan: {
        nextDate: "2026-08-10",
        type: "检查更换",
        responsible: "王队长"
      },
      logs: [
        { at: "2026-06-10", step: "检查", note: "网眼需观察" }
      ]
    }
  ],
  inventories: [
    {
      id: "INV-001",
      location: "东柜二层",
      date: "2026-06-01",
      person: "张师傅",
      notes: "鸬鹚绳环轻微起毛，需关注"
    },
    {
      id: "INV-002",
      location: "器具架A",
      date: "2026-05-30",
      person: "李工",
      notes: "竹篓底圈松动已记录"
    }
  ]
};
