import { initAuth, requireLogin, can, renderLoginStatusBar, applyPermissionGuards, PERMISSIONS } from "./auth.js";

const api = async (path, options = {}) => {
  const res = await fetch(path, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers || {}) }
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || data.error || "请求失败");
  return data;
};

async function loadUsers() {
  if (!requireLogin()) return;
  if (!can(PERMISSIONS.MANAGE_USERS)) {
    document.getElementById("userList").innerHTML = '<div class="meta warn">权限不足，仅管理员可管理用户</div>';
    document.getElementById("addUserBtn").style.display = "none";
    return;
  }
  const users = await api("/api/users");
  const container = document.getElementById("userList");
  if (!users.length) {
    container.innerHTML = '<div class="meta">暂无用户</div>';
    return;
  }
  const roleBadge = (role) => {
    const colors = { admin: "#d9363e", maintainer: "#2b7de9", viewer: "#6b7785" };
    const labels = { admin: "管理员", maintainer: "维护员", viewer: "只读用户" };
    return `<span class="pill" style="background:${colors[role]};color:#fff">${labels[role] || role}</span>`;
  };
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
            <td>${roleBadge(u.role)}</td>
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
  document.getElementById("usernameField input").required = true;
  document.getElementById("passwordField label").textContent = "密码 *";
  document.getElementById("passwordField input").required = true;
  document.getElementById("pwdHint").style.display = "block";
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
  form.role.value = user.role;
  form.password.value = "";
  document.getElementById("userIdField").style.display = "block";
  document.getElementById("usernameField").style.display = "none";
  document.getElementById("usernameField input").required = false;
  document.getElementById("passwordField label").textContent = "新密码（留空不修改）";
  document.getElementById("passwordField input").required = false;
  document.getElementById("pwdHint").style.display = "block";
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

(async () => {
  await initAuth();
  if (!requireLogin()) return;
  renderLoginStatusBar(document.getElementById("userStatusBar"));
  applyPermissionGuards();
  document.getElementById("addUserBtn").addEventListener("click", openAddModal);
  document.getElementById("changePwdBtn").addEventListener("click", openPwdModal);
  document.getElementById("modalClose").addEventListener("click", closeModal);
  document.getElementById("modalCancel").addEventListener("click", closeModal);
  document.getElementById("userForm").addEventListener("submit", submitUserForm);
  document.getElementById("pwdModalClose").addEventListener("click", closePwdModal);
  document.getElementById("pwdModalCancel").addEventListener("click", closePwdModal);
  document.getElementById("pwdForm").addEventListener("submit", submitPwdForm);
  document.getElementById("reload").addEventListener("click", () => window.location.reload());
  loadUsers();
})();
