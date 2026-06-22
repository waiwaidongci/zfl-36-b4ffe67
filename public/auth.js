const ROLES = {
  ADMIN: "admin",
  MAINTAINER: "maintainer",
  VIEWER: "viewer"
};

const ROLE_LABELS = {
  [ROLES.ADMIN]: "管理员",
  [ROLES.MAINTAINER]: "维护员",
  [ROLES.VIEWER]: "只读用户"
};

const PERMISSIONS = {
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

let currentUser = null;
let userPermissions = [];
let serverRoles = [];
let initPromise = null;

export function can(permission) {
  if (!currentUser) return false;
  return userPermissions.includes(permission);
}

export function getCurrentUser() {
  return currentUser;
}

export function isLoggedIn() {
  return currentUser !== null;
}

export function requireLogin(redirect = true) {
  if (!currentUser) {
    if (redirect) {
      const returnUrl = encodeURIComponent(window.location.pathname + window.location.search);
      window.location.href = "/login?redirect=" + returnUrl;
    }
    return false;
  }
  return true;
}

export async function initAuth() {
  if (initPromise) return initPromise;
  initPromise = (async () => {
    try {
      const res = await fetch("/api/auth/me");
      const data = await res.json();
      currentUser = data.user || null;
      userPermissions = (data.user && data.user.permissions) ? data.user.permissions : [];
      if (Array.isArray(data.roles)) {
        serverRoles = data.roles;
      }
      return currentUser;
    } catch (e) {
      currentUser = null;
      userPermissions = [];
      return null;
    }
  })();
  return initPromise;
}

export function getServerRoles() {
  return serverRoles;
}

export async function login(username, password) {
  const res = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password })
  });
  const data = await res.json();
  if (res.ok) {
    currentUser = data.user;
    userPermissions = (data.user && data.user.permissions) ? data.user.permissions : [];
    return { ok: true, user: data.user };
  }
  return { ok: false, error: data.message || "登录失败" };
}

export async function logout() {
  try {
    await fetch("/api/auth/logout", { method: "POST" });
  } catch (e) {}
  currentUser = null;
  userPermissions = [];
}

function getRoleBadgeColor(role) {
  if (role === ROLES.ADMIN) return "#d9363e";
  if (role === ROLES.MAINTAINER) return "#2b7de9";
  if (role === ROLES.VIEWER) return "#6b7785";
  return "#8b5cf6";
}

export function renderLoginStatusBar(container) {
  if (!container) return;
  const user = getCurrentUser();
  let html = "";
  if (user) {
    const roleBadgeColor = getRoleBadgeColor(user.role);
    html = `
      <div class="user-info" style="display:flex;align-items:center;gap:10px">
        <span class="meta" style="margin:0">👤 ${user.displayName}</span>
        <span class="pill" style="background:${roleBadgeColor};color:#fff;padding:2px 10px">${user.roleLabel || user.role}</span>
        ${can(PERMISSIONS.MANAGE_USERS) ? '<a href="/users" class="nav-btn" style="font-size:13px;padding:4px 12px">👥 用户管理</a>' : ''}
        <a href="#" id="logoutBtn" class="nav-btn" style="font-size:13px;padding:4px 12px;background:#d9363e">退出登录</a>
      </div>
    `;
  } else {
    html = `
      <div class="user-info" style="display:flex;align-items:center;gap:10px">
        <span class="meta warn" style="margin:0">⚠️ 未登录（部分功能不可用）</span>
        <a href="/login" class="nav-btn" style="font-size:13px;padding:4px 12px;background:#16a34a">🔐 登录</a>
      </div>
    `;
  }
  container.innerHTML = html;
  const logoutBtn = document.getElementById("logoutBtn");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", async (e) => {
      e.preventDefault();
      await logout();
      window.location.href = "/login";
    });
  }
}

export function applyPermissionGuards() {
  document.querySelectorAll("[data-perm]").forEach(el => {
    const perm = el.dataset.perm;
    if (!can(perm)) {
      el.style.display = "none";
    }
  });
  document.querySelectorAll("[data-login-required]").forEach(el => {
    if (!isLoggedIn()) {
      el.style.display = "none";
    }
  });
}

export function extractToken() {
  const match = document.cookie.match(/(?:^|;\s*)auth_token=([^;]+)/);
  if (match) return decodeURIComponent(match[1]);
  return null;
}

export function setupUserBar(containerId) {
  const container = typeof containerId === "string" ? document.getElementById(containerId) : containerId;
  if (!container) return Promise.resolve(null);
  return initAuth().then(() => {
    renderLoginStatusBar(container);
    applyPermissionGuards();
    return getCurrentUser();
  });
}

const loginForm = document.getElementById("loginForm");
if (loginForm) {
  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const formData = new FormData(loginForm);
    const username = formData.get("username");
    const password = formData.get("password");
    const errorEl = document.getElementById("loginError");
    errorEl.style.display = "none";
    const result = await login(username, password);
    if (result.ok) {
      const params = new URLSearchParams(window.location.search);
      const redirect = params.get("redirect");
      window.location.href = redirect ? decodeURIComponent(redirect) : "/";
    } else {
      errorEl.textContent = result.error;
      errorEl.style.display = "block";
    }
  });
}

export { ROLES, ROLE_LABELS, PERMISSIONS };
