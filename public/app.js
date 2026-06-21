import { fields, stages, extraFields } from "./constants.js";
import { renderPlanHtml, bindMaintenanceEvents } from "./maintenance.js";
import { loadReminders } from "./reminders.js";
import { initImport } from "./import.js";

const createForm = document.querySelector('#createForm');
const actionForm = document.querySelector('#actionForm');
const cards = document.querySelector('#cards');
const statsEl = document.querySelector('#stats');
const itemSelect = document.querySelector('#itemSelect');
const remindersEl = document.querySelector('#reminders');
let items = [];

async function api(path, options) {
  const res = await fetch(path, options && options.body ? { ...options, headers: { 'Content-Type': 'application/json' } } : options);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || '请求失败');
  return data;
}

function renderForms() {
  document.querySelector('#fields').innerHTML = fields.map(([key, label, type]) =>
    '<label>' + label + '</label><input name="' + key + '" type="' + type + '" ' + (key === 'code' ? 'required' : '') + '>'
  ).join('');
  document.querySelector('#extraFields').innerHTML = extraFields.map(([key, label]) =>
    '<label>' + label + '</label><input name="' + key + '">'
  ).join('');
}

function render() {
  itemSelect.innerHTML = items.map(item =>
    '<option value="' + (item.id || item.code) + '">' + (item.code || item.id) + ' · ' + (item.name || '') + '</option>'
  ).join('');

  const stats = Object.fromEntries(stages.map(s => [s, items.filter(i => i.status === s).length]));
  statsEl.innerHTML = Object.entries(stats).map(([k, v]) =>
    '<div class="stat"><span>' + k + '</span><strong>' + v + '</strong></div>'
  ).join('');

  const status = document.querySelector('#statusFilter').value;
  const q = document.querySelector('#search').value.trim();
  const visible = items.filter(item =>
    (!status || item.status === status) && (!q || JSON.stringify(item).includes(q))
  );
  cards.innerHTML = visible.map(item => cardHtml(item)).join('');

  document.querySelectorAll('[data-status]').forEach(sel => {
    sel.onchange = async () => {
      await api('/api/items/' + sel.dataset.status, { method: 'PATCH', body: JSON.stringify({ status: sel.value }) });
      await load();
    };
  });
  document.querySelectorAll('[data-note]').forEach(btn => {
    btn.onclick = async () => {
      const id = btn.dataset.note;
      const note = prompt('记录备注');
      if (note) { await api('/api/items/' + id + '/logs', { method: 'POST', body: JSON.stringify({ step: '备注', note }) }); await load(); }
    };
  });

  bindMaintenanceEvents(api, load);
}

function cardHtml(item) {
  const main = fields.slice(0, 4).map(([key, label]) =>
    '<div><b>' + label + '</b> ' + (item[key] ?? '') + '</div>'
  ).join('');
  const tasks = (item.tasks || []).map(t =>
    '<div class="meta">任务 ' + t.position + ' · ' + t.status + ' · ' + t.tension + '</div>'
  ).join('');
  const logs = (item.logs || []).slice(-4).map(l =>
    '<div>' + l.step + '：' + l.note + '</div>'
  ).join('');

  const planHtml = renderPlanHtml(item);

  return '<article class="card"><h3>' + (item.code || item.id) + '</h3><span class="pill">' + item.status + '</span>' +
    main + tasks +
    '<label>状态</label><select data-status="' + (item.id || item.code) + '">' +
    stages.map(s => '<option ' + (s === item.status ? 'selected' : '') + '>' + s + '</option>').join('') +
    '</select><button class="secondary" data-note="' + (item.id || item.code) + '">追加备注</button>' +
    planHtml +
    '<div class="logs meta">' + (logs || '暂无记录') + '</div></article>';
}

async function load() {
  items = await api('/api/items');
  render();
  await loadReminders(api, remindersEl);
}

createForm.onsubmit = async event => {
  event.preventDefault();
  await api('/api/items', { method: 'POST', body: JSON.stringify(Object.fromEntries(new FormData(createForm).entries())) });
  createForm.reset();
  await load();
};

actionForm.onsubmit = async event => {
  event.preventDefault();
  await api('/api/items/' + itemSelect.value + '/action', { method: 'POST', body: JSON.stringify(Object.fromEntries(new FormData(actionForm).entries())) });
  actionForm.reset();
  await load();
};

document.querySelector('#statusFilter').onchange = render;
document.querySelector('#search').oninput = render;
document.querySelector('#reload').onclick = load;

renderForms();
initImport(api, load);
load();
