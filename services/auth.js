import { createHash, randomBytes } from "node:crypto";

export const ROLES = {
  ADMIN: "admin",
  MAINTAINER: "maintainer",
  VIEWER: "viewer"
};

export const ROLE_LABELS = {
  [ROLES.ADMIN]: "管理员",
  [ROLES.MAINTAINER]: "维护员",
  [ROLES.VIEWER]: "只读用户"
};

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function hashPassword(password) {
  return createHash("sha256").update(password).digest("hex");
}

export function verifyPassword(password, hash) {
  return hashPassword(password) === hash;
}

export function generateToken() {
  return randomBytes(32).toString("hex");
}

export function createSession(userId) {
  const now = Date.now();
  return {
    token: generateToken(),
    userId,
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + SESSION_TTL_MS).toISOString()
  };
}

export function isSessionValid(session) {
  if (!session || !session.expiresAt) return false;
  return new Date(session.expiresAt).getTime() > Date.now();
}

export function findUserByUsername(db, username) {
  db.users ||= [];
  return db.users.find(u => u.username === username);
}

export function findUserById(db, userId) {
  db.users ||= [];
  return db.users.find(u => u.id === userId);
}

export function findSessionByToken(db, token) {
  db.sessions ||= [];
  return db.sessions.find(s => s.token === token);
}

export function getUserBySessionToken(db, token) {
  const session = findSessionByToken(db, token);
  if (!isSessionValid(session)) return null;
  return findUserById(db, session.userId);
}

export function cleanExpiredSessions(db) {
  db.sessions ||= [];
  const before = db.sessions.length;
  db.sessions = db.sessions.filter(isSessionValid);
  return before - db.sessions.length;
}

export const PERMISSIONS = {
  CREATE_ITEM: "create_item",
  UPDATE_ITEM_STATUS: "update_item_status",
  ADD_LOG: "add_log",
  BORROW_ITEM: "borrow_item",
  RETURN_ITEM: "return_item",
  SET_MAINTENANCE_PLAN: "set_maintenance_plan",
  COMPLETE_MAINTENANCE: "complete_maintenance",
  CREATE_INVENTORY: "create_inventory",
  UPDATE_INVENTORY: "update_inventory",
  DELETE_INVENTORY: "delete_inventory",
  CREATE_REPAIR_ORDER: "create_repair_order",
  UPDATE_REPAIR_ORDER: "update_repair_order",
  COMPLETE_REPAIR_ORDER: "complete_repair_order",
  DELETE_REPAIR_ORDER: "delete_repair_order",
  IMPORT_ITEMS: "import_items",
  CREATE_BATCH: "create_batch",
  UPDATE_BATCH: "update_batch",
  ADD_BATCH_LOG: "add_batch_log",
  MANAGE_USERS: "manage_users",
  DOWNLOAD_BACKUP: "download_backup",
  RESTORE_BACKUP: "restore_backup",
  VIEW_BACKUPS: "view_backups"
};

const ROLE_PERMISSIONS = {
  [ROLES.ADMIN]: Object.values(PERMISSIONS),
  [ROLES.MAINTAINER]: [
    PERMISSIONS.ADD_LOG,
    PERMISSIONS.RETURN_ITEM,
    PERMISSIONS.COMPLETE_MAINTENANCE,
    PERMISSIONS.CREATE_INVENTORY,
    PERMISSIONS.CREATE_REPAIR_ORDER,
    PERMISSIONS.UPDATE_REPAIR_ORDER,
    PERMISSIONS.COMPLETE_REPAIR_ORDER,
    PERMISSIONS.ADD_BATCH_LOG,
    PERMISSIONS.VIEW_BACKUPS,
    PERMISSIONS.DOWNLOAD_BACKUP
  ],
  [ROLES.VIEWER]: [
    PERMISSIONS.VIEW_BACKUPS
  ]
};

export function getUserPermissions(db, role) {
  if (db && Array.isArray(db.roles)) {
    const roleObj = db.roles.find(r => r.id === role);
    if (roleObj) return roleObj.permissions || [];
  }
  return ROLE_PERMISSIONS[role] || [];
}

export function hasPermission(db, role, permission) {
  if (arguments.length === 2) {
    permission = role;
    role = db;
    return (ROLE_PERMISSIONS[role] || []).includes(permission);
  }
  const perms = getUserPermissions(db, role);
  return perms.includes(permission);
}

export function findRoleById(db, roleId) {
  db.roles ||= [];
  return db.roles.find(r => r.id === roleId);
}

export function findRoleByName(db, name) {
  db.roles ||= [];
  return db.roles.find(r => r.name === name);
}

export function newRoleId() {
  return "ROLE-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8);
}

export function extractTokenFromRequest(req) {
  const cookie = req.headers.cookie || "";
  const match = cookie.match(/(?:^|;\s*)auth_token=([^;]+)/);
  if (match) return decodeURIComponent(match[1]);
  const authHeader = req.headers.authorization || "";
  const bearer = authHeader.match(/^Bearer\s+(.+)$/i);
  if (bearer) return bearer[1];
  return null;
}

export function serializeUser(user, db) {
  if (!user) return null;
  let roleLabel = user.role;
  if (db && Array.isArray(db.roles)) {
    const roleObj = db.roles.find(r => r.id === user.role);
    if (roleObj) roleLabel = roleObj.label || roleObj.name;
    else roleLabel = ROLE_LABELS[user.role] || user.role;
  } else {
    roleLabel = ROLE_LABELS[user.role] || user.role;
  }
  const permissions = db ? getUserPermissions(db, user.role) : (ROLE_PERMISSIONS[user.role] || []);
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    role: user.role,
    roleLabel,
    permissions
  };
}
