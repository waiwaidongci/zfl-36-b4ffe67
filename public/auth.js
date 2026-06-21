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

let currentUser = null;
let initPromise = null;

export function hasPermission(role, permission) {
  const perms = ROLE_PERMISSIONS[role] || [];
  return perms.includes(permission);
}

export function can(permission) {
  if (!currentUser) return false;
  return hasPermission(currentUser.role, permission);
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
      return currentUser;
    } catch (e) {
      currentUser = null;
      return null;
    }
  })();
  return initPromise;
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
    return { ok: true, user: data.user };
  }
  return { ok: false, error: data.message || "登录失败" };
}

export async function logout() {
  try {
    await fetch("/api/auth/logout", { method: "POST" });
  } catch (e) {}
  currentUser = null;
}

export function renderLoginStatusBar(container) {
  if (!container) return;
  const user = getCurrentUser();
  let html = "";
  if (user) {
    const roleBadgeColor = user.role === ROLES.ADMIN ? "#d9363e" :
                          user.role === ROLES.MAINTAINER ? "#2b7de9" : "#6b7785";
    html = `
      <div class="user-info" style="display:flex;align-items:center;gap:10px">
        <span class="meta" style="margin:0">👤 ${user.displayName}</span>
        <span class="pill" style="background:${roleBadgeColor};color:#fff;padding:2px 10px">${user.roleLabel || ROLE_LABELS[user.role]}</span>
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
  const guards = {
    '[data-perm="create_item"]': PERMISSIONS.CREATE_ITEM,
    '[data-perm="update_item_status"]': PERMISSIONS.UPDATE_ITEM_STATUS,
    '[data-perm="add_log"]': PERMISSIONS.ADD_LOG,
    '[data-perm="borrow_item"]': PERMISSIONS.BORROW_ITEM,
    '[data-perm="return_item"]': PERMISSIONS.RETURN_ITEM,
    '[data-perm="set_maintenance_plan"]': PERMISSIONS.SET_MAINTENANCE_PLAN,
    '[data-perm="complete_maintenance"]': PERMISSIONS.COMPLETE_MAINTENANCE,
    '[data-perm="create_inventory"]': PERMISSIONS.CREATE_INVENTORY,
    '[data-perm="update_inventory"]': PERMISSIONS.UPDATE_INVENTORY,
    '[data-perm="delete_inventory"]': PERMISSIONS.DELETE_INVENTORY,
    '[data-perm="create_repair_order"]': PERMISSIONS.CREATE_REPAIR_ORDER,
    '[data-perm="update_repair_order"]': PERMISSIONS.UPDATE_REPAIR_ORDER,
    '[data-perm="complete_repair_order"]': PERMISSIONS.COMPLETE_REPAIR_ORDER,
    '[data-perm="delete_repair_order"]': PERMISSIONS.DELETE_REPAIR_ORDER,
    '[data-perm="import_items"]': PERMISSIONS.IMPORT_ITEMS,
    '[data-perm="create_batch"]': PERMISSIONS.CREATE_BATCH,
    '[data-perm="update_batch"]': PERMISSIONS.UPDATE_BATCH,
    '[data-perm="add_batch_log"]': PERMISSIONS.ADD_BATCH_LOG,
    '[data-perm="manage_users"]': PERMISSIONS.MANAGE_USERS,
    '[data-perm="download_backup"]': PERMISSIONS.DOWNLOAD_BACKUP,
    '[data-perm="restore_backup"]': PERMISSIONS.RESTORE_BACKUP,
    '[data-perm="view_backups"]': PERMISSIONS.VIEW_BACKUPS
  };
  for (const [selector, perm] of Object.entries(guards)) {
    document.querySelectorAll(selector).forEach(el => {
      if (!can(perm)) {
        el.style.display = "none";
      }
    });
  }
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

export function serializeUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    role: user.role,
    roleLabel: user.roleLabel || ROLE_LABELS[user.role]
  };
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
