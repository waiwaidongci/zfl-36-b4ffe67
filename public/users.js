import { initAuth, requireLogin, can, renderLoginStatusBar, applyPermissionGuards, PERMISSIONS, getServerRoles } from "./auth.js";

const api = async (path, options = {}) => {
  const res = await fetch(path, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers || {}) }
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || data.error || "请求失败");
  return data;
};

let cachedRoles = [];
let cachedAllPerms = [];

async function loadRoles() {
  try {
    cachedRoles = await api("/api/roles");
  } catch (e) {
    cachedRoles = getServerRoles() || [];
  }
  return cachedRoles;
}

async function loadAllPermissions() {
  try {
    const res = await fetch("/api/auth/me");
    const data = await res.json();
    cachedAllPerms = data.allPermissions || Object.values(PERMISSIONS);
  } catch (e) {
    cachedAllPerms = Object.values(PERMISSIONS);
  }
  return cachedAllPerms;
}

function getPermLabel(perm) {
  const map = {
    create_item: "创建道具",
    update_item_status: "更新道具状态",
    add_log: "添加日志",
    submit_check: "提交现场核验",
    borrow_item: "借出道具",
    return_item: "归还道具",
    set_maintenance_plan: "设置维护计划",
    complete_maintenance: "完成维护",
    create_inventory: "创建盘点",
    update_inventory: "更新盘点",
    delete_inventory: "删除盘点",
    create_repair_order: "创建维修单",
    update_repair_order: "更新维修单",
    complete_repair_order: "完成维修单",
    delete_repair_order: "删除维修单",
    import_items: "导入道具",
    create_batch: "创建批次",
    update_batch: "更新批次",
    add_batch_log: "添加批次日志",
    manage_users: "用户管理",
    download_backup: "下载备份",
    restore_backup: "恢复备份",
    view_backups: "查看备份"
  };
  return map[perm] || perm;
}

function getRoleBadgeColor(role) {
  if (role === "admin") return "#d9363e";
  if (role === "maintainer") return "#2b7de9";
  if (role === "viewer") return "#6b7785";
  return "#8b5cf6";
}

function renderRoleBadge(roleId, roles) {
  const roleObj = roles.find(r => r.id === roleId);
  const label = roleObj ? (roleObj.label || roleObj.name) : roleId;
  const color = getRoleBadgeColor(roleId);
  return `<span class="pill" style="background:${color};color:#fff">${label}</span>`;
}

function buildRoleSelect(selectedRoleId, roles) {
  return `<select name="role" id="roleSelect">
    ${roles.map(r => `<option value="${r.id}" ${r.id === selectedRoleId ? 'selected' : ''}>${r.label || r.name}${r.isSystem ? ' (系统)' : ''}</option>`).join('')}
  </select>`;
}

async function loadUsers() {
  if (!requireLogin()) return;
  if (!can(PERMISSIONS.MANAGE_USERS)) {
    document.getElementById("userList").innerHTML = '<div class="meta warn">权限不足，仅管理员可管理用户</div>';
    document.getElementById("addUserBtn").style.display = "none";
    return;
  }
  const [users, roles] = await Promise.all([api("/api/users"), loadRoles()]);
  const container = document.getElementById("userList");
  if (!users.length) {
    container.innerHTML = '<div class="meta">暂无用户</div>';
    return;
  }
  container.innerHTML = `
    <table class="data-table">
      <thead>
        <tr>
          <th>用户名</th>
          <th>显示名称</th>
          <th>角色</th>
          <th>创建时间</th>
          <th>最近登录</th>
          <th>操作</th>
        </tr>
      </thead>
      <tbody>
        ${users.map(u => `
          <tr>
            <td><strong>${u.username}</strong></td>
            <td>${u.displayName}</td>
            <td>${renderRoleBadge(u.role, roles)}</td>
            <td>${new Date(u.createdAt).toLocaleString("zh-CN")}</td>
            <td>${u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString("zh-CN") : '<span class="meta">从未登录</span>'}</td>
            <td>
              <button class="secondary small" data-action="edit" data-id="${u.id}">编辑</button>
              <button class="danger small" data-action="delete" data-id="${u.id}" style="background:#d9363e">删除</button>
            </td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
  container.querySelectorAll("[data-action]").forEach(btn => {
    btn.addEventListener("click", (e) => {
      const action = e.target.dataset.action;
      const id = e.target.dataset.id;
      if (action === "edit") openEditModal(id, users);
      if (action === "delete") deleteUser(id);
    });
  });
}

function openAddModal() {
  document.getElementById("modalTitle").textContent = "新增用户";
  document.getElementById("userForm").reset();
  document.getElementById("userIdField").style.display = "none";
  document.getElementById("usernameField").style.display = "block";
  document.querySelector("#usernameField input").required = true;
  document.querySelector("#passwordField label").textContent = "密码 *";
  document.querySelector("#passwordField input").required = true;
  document.getElementById("pwdHint").style.display = "block";
  document.getElementById("roleSelectContainer").innerHTML = buildRoleSelect("", cachedRoles);
  document.getElementById("userModal").dataset.mode = "add";
  document.getElementById("userModal").style.display = "flex";
}

function openEditModal(id, users) {
  const user = users.find(u => u.id === id);
  if (!user) return;
  document.getElementById("modalTitle").textContent = "编辑用户";
  const form = document.getElementById("userForm");
  form.reset();
  form.id.value = user.id;
  form.username.value = user.username;
  form.displayName.value = user.displayName;
  form.password.value = "";
  document.getElementById("userIdField").style.display = "block";
  document.getElementById("usernameField").style.display = "none";
  document.querySelector("#usernameField input").required = false;
  document.querySelector("#passwordField label").textContent = "新密码（留空不修改）";
  document.querySelector("#passwordField input").required = false;
  document.getElementById("pwdHint").style.display = "block";
  document.getElementById("roleSelectContainer").innerHTML = buildRoleSelect(user.role, cachedRoles);
  document.getElementById("userModal").dataset.mode = "edit";
  document.getElementById("userModal").style.display = "flex";
}

function closeModal() {
  document.getElementById("userModal").style.display = "none";
}

async function deleteUser(id) {
  if (!confirm("确定要删除该用户吗？此操作不可恢复。")) return;
  try {
    await api("/api/users/" + id, { method: "DELETE" });
    alert("删除成功");
    loadUsers();
  } catch (e) {
    alert(e.message);
  }
}

async function submitUserForm(e) {
  e.preventDefault();
  const mode = document.getElementById("userModal").dataset.mode;
  const form = e.target;
  const formData = new FormData(form);
  const payload = {
    displayName: formData.get("displayName"),
    role: formData.get("role")
  };
  try {
    if (mode === "add") {
      payload.username = formData.get("username");
      payload.password = formData.get("password");
      if (!payload.password) throw new Error("新增用户密码必填");
      await api("/api/users", { method: "POST", body: JSON.stringify(payload) });
    } else {
      const id = formData.get("id");
      const pwd = formData.get("password");
      if (pwd) payload.password = pwd;
      await api("/api/users/" + id, { method: "PATCH", body: JSON.stringify(payload) });
    }
    closeModal();
    alert("保存成功");
    loadUsers();
  } catch (e) {
    alert(e.message);
  }
}

function openPwdModal() {
  document.getElementById("pwdForm").reset();
  document.getElementById("pwdError").style.display = "none";
  document.getElementById("pwdModal").style.display = "flex";
}

function closePwdModal() {
  document.getElementById("pwdModal").style.display = "none";
}

async function submitPwdForm(e) {
  e.preventDefault();
  const form = e.target;
  const fd = new FormData(form);
  const oldPassword = fd.get("oldPassword");
  const newPassword = fd.get("newPassword");
  const confirmPassword = fd.get("confirmPassword");
  const errEl = document.getElementById("pwdError");
  errEl.style.display = "none";
  if (newPassword !== confirmPassword) {
    errEl.textContent = "两次输入的新密码不一致";
    errEl.style.display = "block";
    return;
  }
  try {
    await api("/api/auth/change-password", {
      method: "POST",
      body: JSON.stringify({ oldPassword, newPassword })
    });
    closePwdModal();
    alert("密码修改成功");
  } catch (e) {
    errEl.textContent = e.message;
    errEl.style.display = "block";
  }
}

async function loadRoleList() {
  const [roles, allPerms] = await Promise.all([loadRoles(), loadAllPermissions()]);
  const container = document.getElementById("roleList");
  if (!roles.length) {
    container.innerHTML = '<div class="meta">暂无角色</div>';
    return;
  }
  container.innerHTML = `
    <table class="data-table">
      <thead>
        <tr>
          <th>角色名称</th>
          <th>显示名称</th>
          <th>权限数</th>
          <th>类型</th>
          <th>操作</th>
        </tr>
      </thead>
      <tbody>
        ${roles.map(r => `
          <tr>
            <td><strong>${r.name}</strong></td>
            <td>${r.label}</td>
            <td>${(r.permissions || []).length} / ${allPerms.length}</td>
            <td>${r.isSystem ? '<span class="pill" style="background:#6b7785;color:#fff">系统</span>' : '<span class="pill" style="background:#8b5cf6;color:#fff">自定义</span>'}</td>
            <td>
              <button class="secondary small" data-role-action="edit" data-role-id="${r.id}" ${r.isSystem ? 'disabled title="系统角色不可编辑"' : ''}>编辑</button>
              <button class="danger small" data-role-action="delete" data-role-id="${r.id}" style="background:#d9363e" ${r.isSystem ? 'disabled title="系统角色不可删除"' : ''}>删除</button>
            </td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
  container.querySelectorAll("[data-role-action]").forEach(btn => {
    if (btn.disabled) return;
    btn.addEventListener("click", (e) => {
      const action = e.target.dataset.roleAction;
      const roleId = e.target.dataset.roleId;
      if (action === "edit") openEditRoleModal(roleId);
      if (action === "delete") deleteRole(roleId);
    });
  });
}

function openAddRoleModal() {
  document.getElementById("roleModalTitle").textContent = "新增角色";
  document.getElementById("roleForm").reset();
  renderPermCheckboxes(cachedAllPerms, []);
  document.getElementById("roleModal").dataset.mode = "add";
  document.getElementById("roleModal").style.display = "flex";
}

function openEditRoleModal(roleId) {
  const role = cachedRoles.find(r => r.id === roleId);
  if (!role || role.isSystem) return;
  document.getElementById("roleModalTitle").textContent = "编辑角色";
  const form = document.getElementById("roleForm");
  form.reset();
  form.roleName.value = role.name;
  form.roleLabel.value = role.label;
  form.roleName.readOnly = true;
  renderPermCheckboxes(cachedAllPerms, role.permissions || []);
  document.getElementById("roleModal").dataset.mode = "edit";
  document.getElementById("roleModal").dataset.roleId = roleId;
  document.getElementById("roleModal").style.display = "flex";
}

function renderPermCheckboxes(allPerms, selectedPerms) {
  const container = document.getElementById("permCheckboxes");
  container.innerHTML = allPerms.map(p => `
    <label class="perm-checkbox">
      <input type="checkbox" name="perm" value="${p}" ${selectedPerms.includes(p) ? 'checked' : ''}>
      ${getPermLabel(p)}
    </label>
  `).join('');
  const selectAllCb = document.getElementById("selectAllPerms");
  if (selectAllCb) {
    selectAllCb.checked = selectedPerms.length === allPerms.length && allPerms.length > 0;
    selectAllCb.indeterminate = selectedPerms.length > 0 && selectedPerms.length < allPerms.length;
  }
}

function closeRoleModal() {
  document.getElementById("roleModal").style.display = "none";
  const nameInput = document.getElementById("roleForm").roleName;
  if (nameInput) nameInput.readOnly = false;
}

async function submitRoleForm(e) {
  e.preventDefault();
  const mode = document.getElementById("roleModal").dataset.mode;
  const form = e.target;
  const fd = new FormData(form);
  const permissions = fd.getAll("perm");
  const payload = {
    name: fd.get("roleName"),
    label: fd.get("roleLabel"),
    permissions
  };
  try {
    if (mode === "add") {
      if (!payload.name || !payload.label) throw new Error("角色名称和显示名不能为空");
      await api("/api/roles", { method: "POST", body: JSON.stringify(payload) });
    } else {
      const roleId = document.getElementById("roleModal").dataset.roleId;
      await api("/api/roles/" + roleId, { method: "PATCH", body: JSON.stringify(payload) });
    }
    closeRoleModal();
    alert("保存成功");
    loadRoleList();
    loadUsers();
  } catch (e) {
    alert(e.message);
  }
}

async function deleteRole(roleId) {
  if (!confirm("确定要删除该角色吗？")) return;
  try {
    await api("/api/roles/" + roleId, { method: "DELETE" });
    alert("删除成功");
    loadRoleList();
  } catch (e) {
    alert(e.message);
  }
}

function switchTab(tab) {
  document.querySelectorAll(".user-tab-btn").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.tab === tab);
  });
  document.getElementById("userPanel").style.display = tab === "users" ? "block" : "none";
  document.getElementById("rolePanel").style.display = tab === "roles" ? "block" : "none";
  if (tab === "roles") loadRoleList();
}

(async () => {
  await initAuth();
  if (!requireLogin()) return;
  renderLoginStatusBar(document.getElementById("userStatusBar"));
  applyPermissionGuards();
  await loadRoles();
  await loadAllPermissions();
  document.getElementById("addUserBtn").addEventListener("click", openAddModal);
  document.getElementById("addRoleBtn").addEventListener("click", openAddRoleModal);
  document.getElementById("changePwdBtn").addEventListener("click", openPwdModal);
  document.getElementById("modalClose").addEventListener("click", closeModal);
  document.getElementById("modalCancel").addEventListener("click", closeModal);
  document.getElementById("userForm").addEventListener("submit", submitUserForm);
  document.getElementById("pwdModalClose").addEventListener("click", closePwdModal);
  document.getElementById("pwdModalCancel").addEventListener("click", closePwdModal);
  document.getElementById("pwdForm").addEventListener("submit", submitPwdForm);
  document.getElementById("reload").addEventListener("click", () => window.location.reload());
  document.getElementById("roleModalClose").addEventListener("click", closeRoleModal);
  document.getElementById("roleModalCancel").addEventListener("click", closeRoleModal);
  document.getElementById("roleForm").addEventListener("submit", submitRoleForm);

  document.querySelectorAll(".user-tab-btn").forEach(btn => {
    btn.addEventListener("click", () => switchTab(btn.dataset.tab));
  });

  const selectAllCb = document.getElementById("selectAllPerms");
  if (selectAllCb) {
    selectAllCb.addEventListener("change", (e) => {
      document.querySelectorAll('#permCheckboxes input[type="checkbox"]').forEach(cb => {
        cb.checked = e.target.checked;
      });
    });
  }

  loadUsers();
})();
