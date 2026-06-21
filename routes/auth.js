import { loadDb, saveDb, body, send, newUserId } from "../db.js";
import {
  ROLES,
  ROLE_LABELS,
  verifyPassword,
  hashPassword,
  createSession,
  findUserByUsername,
  findUserById,
  findSessionByToken,
  getUserBySessionToken,
  extractTokenFromRequest,
  serializeUser,
  PERMISSIONS,
  hasPermission
} from "../services/auth.js";

function setCookie(res, token) {
  const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toUTCString();
  const cookie = `auth_token=${encodeURIComponent(token)}; Path=/; Expires=${expires}; HttpOnly; SameSite=Lax`;
  const existing = res.getHeader("Set-Cookie") || [];
  const cookies = Array.isArray(existing) ? existing : [existing];
  res.setHeader("Set-Cookie", [...cookies, cookie]);
}

function clearCookie(res) {
  const cookie = `auth_token=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=Lax`;
  const existing = res.getHeader("Set-Cookie") || [];
  const cookies = Array.isArray(existing) ? existing : [existing];
  res.setHeader("Set-Cookie", [...cookies, cookie]);
}

export async function getCurrentUser(req) {
  const token = extractTokenFromRequest(req);
  if (!token) return null;
  const db = await loadDb();
  return getUserBySessionToken(db, token);
}

export async function requirePermission(req, res, permission) {
  const user = await getCurrentUser(req);
  if (!user) {
    send(res, 401, { error: "unauthorized", message: "请先登录" });
    return null;
  }
  if (!hasPermission(user.role, permission)) {
    send(res, 403, { error: "forbidden", message: "权限不足" });
    return null;
  }
  return user;
}

export async function handleAuth(req, res, url) {
  const db = await loadDb();

  if (req.method === "POST" && url.pathname === "/api/auth/login") {
    const input = await body(req);
    const { username, password } = input;
    if (!username || !password) {
      return send(res, 400, { error: "invalid_input", message: "用户名和密码不能为空" });
    }
    const user = findUserByUsername(db, username);
    if (!user || !verifyPassword(password, user.passwordHash)) {
      return send(res, 401, { error: "invalid_credentials", message: "用户名或密码错误" });
    }
    const session = createSession(user.id);
    db.sessions ||= [];
    db.sessions.push(session);
    user.lastLoginAt = new Date().toISOString();
    await saveDb(db);
    setCookie(res, session.token);
    return send(res, 200, {
      token: session.token,
      user: serializeUser(user)
    });
  }

  if (req.method === "POST" && url.pathname === "/api/auth/logout") {
    const token = extractTokenFromRequest(req);
    if (token) {
      db.sessions ||= [];
      db.sessions = db.sessions.filter(s => s.token !== token);
      await saveDb(db);
    }
    clearCookie(res);
    return send(res, 200, { success: true });
  }

  if (req.method === "GET" && url.pathname === "/api/auth/me") {
    const token = extractTokenFromRequest(req);
    let user = null;
    if (token) {
      user = getUserBySessionToken(db, token);
    }
    return send(res, 200, {
      user: serializeUser(user),
      roles: ROLES,
      roleLabels: ROLE_LABELS
    });
  }

  if (req.method === "GET" && url.pathname === "/api/users") {
    const user = await getCurrentUser(req);
    if (!user) return send(res, 401, { error: "unauthorized", message: "请先登录" });
    if (!hasPermission(user.role, PERMISSIONS.MANAGE_USERS)) {
      return send(res, 403, { error: "forbidden", message: "权限不足" });
    }
    const users = db.users.map(u => ({
      id: u.id,
      username: u.username,
      displayName: u.displayName,
      role: u.role,
      roleLabel: ROLE_LABELS[u.role] || u.role,
      createdAt: u.createdAt,
      lastLoginAt: u.lastLoginAt || null
    }));
    return send(res, 200, users);
  }

  if (req.method === "POST" && url.pathname === "/api/users") {
    const currentUser = await getCurrentUser(req);
    if (!currentUser) return send(res, 401, { error: "unauthorized", message: "请先登录" });
    if (!hasPermission(currentUser.role, PERMISSIONS.MANAGE_USERS)) {
      return send(res, 403, { error: "forbidden", message: "权限不足" });
    }
    const input = await body(req);
    const { username, password, displayName, role } = input;
    if (!username || !password) {
      return send(res, 400, { error: "invalid_input", message: "用户名和密码不能为空" });
    }
    if (!Object.values(ROLES).includes(role)) {
      return send(res, 400, { error: "invalid_role", message: "无效的角色" });
    }
    if (findUserByUsername(db, username)) {
      return send(res, 409, { error: "username_exists", message: "用户名已存在" });
    }
    const newUser = {
      id: newUserId(),
      username,
      passwordHash: hashPassword(password),
      displayName: displayName || username,
      role,
      createdAt: new Date().toISOString()
    };
    db.users.push(newUser);
    await saveDb(db);
    return send(res, 201, {
      id: newUser.id,
      username: newUser.username,
      displayName: newUser.displayName,
      role: newUser.role,
      roleLabel: ROLE_LABELS[newUser.role] || newUser.role,
      createdAt: newUser.createdAt
    });
  }

  const userIdMatch = url.pathname.match(/^\/api\/users\/([^/]+)$/);
  if (userIdMatch && req.method === "PATCH") {
    const currentUser = await getCurrentUser(req);
    if (!currentUser) return send(res, 401, { error: "unauthorized", message: "请先登录" });
    if (!hasPermission(currentUser.role, PERMISSIONS.MANAGE_USERS)) {
      return send(res, 403, { error: "forbidden", message: "权限不足" });
    }
    const targetUser = findUserById(db, userIdMatch[1]);
    if (!targetUser) return send(res, 404, { error: "user_not_found" });
    const input = await body(req);
    if (input.displayName !== undefined) targetUser.displayName = input.displayName;
    if (input.role !== undefined) {
      if (!Object.values(ROLES).includes(input.role)) {
        return send(res, 400, { error: "invalid_role", message: "无效的角色" });
      }
      targetUser.role = input.role;
    }
    if (input.password !== undefined && input.password) {
      targetUser.passwordHash = hashPassword(input.password);
    }
    await saveDb(db);
    return send(res, 200, {
      id: targetUser.id,
      username: targetUser.username,
      displayName: targetUser.displayName,
      role: targetUser.role,
      roleLabel: ROLE_LABELS[targetUser.role] || targetUser.role
    });
  }

  if (userIdMatch && req.method === "DELETE") {
    const currentUser = await getCurrentUser(req);
    if (!currentUser) return send(res, 401, { error: "unauthorized", message: "请先登录" });
    if (!hasPermission(currentUser.role, PERMISSIONS.MANAGE_USERS)) {
      return send(res, 403, { error: "forbidden", message: "权限不足" });
    }
    if (userIdMatch[1] === currentUser.id) {
      return send(res, 400, { error: "cannot_delete_self", message: "不能删除当前登录的用户" });
    }
    const idx = db.users.findIndex(u => u.id === userIdMatch[1]);
    if (idx === -1) return send(res, 404, { error: "user_not_found" });
    db.users.splice(idx, 1);
    db.sessions = (db.sessions || []).filter(s => s.userId !== userIdMatch[1]);
    await saveDb(db);
    return send(res, 200, { deleted: true });
  }

  if (req.method === "POST" && url.pathname === "/api/auth/change-password") {
    const currentUser = await getCurrentUser(req);
    if (!currentUser) return send(res, 401, { error: "unauthorized", message: "请先登录" });
    const input = await body(req);
    const { oldPassword, newPassword } = input;
    if (!oldPassword || !newPassword) {
      return send(res, 400, { error: "invalid_input", message: "原密码和新密码不能为空" });
    }
    if (!verifyPassword(oldPassword, currentUser.passwordHash)) {
      return send(res, 400, { error: "wrong_password", message: "原密码错误" });
    }
    if (newPassword.length < 6) {
      return send(res, 400, { error: "password_too_short", message: "新密码至少6位" });
    }
    currentUser.passwordHash = hashPassword(newPassword);
    await saveDb(db);
    return send(res, 200, { success: true });
  }

  return null;
}
