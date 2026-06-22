import { applyPermissionGuards } from "./auth.js";

let currentItems = [];

export function initImport(api, load) {
  const csvInput = document.querySelector('#csvInput');
  const fileInput = document.querySelector('#fileInput');
  const previewBtn = document.querySelector('#previewBtn');
  const clearBtn = document.querySelector('#clearBtn');
  const commitBtn = document.querySelector('#commitBtn');
  const previewResult = document.querySelector('#previewResult');
  const previewSummary = document.querySelector('.preview-summary');

  const newItemsSection = document.querySelector('#newItemsSection');
  const newTbody = document.querySelector('.new-tbody');
  const newCount = document.querySelector('.new-count');

  const updateItemsSection = document.querySelector('#updateItemsSection');
  const updateList = document.querySelector('.update-list');
  const updateCount = document.querySelector('.update-count');
  const unchangedCount = document.querySelector('.unchanged-count');

  const errorSection = document.querySelector('#errorSection');
  const errorList = document.querySelector('.error-list');
  const errorCount = document.querySelector('.error-count');

  const fileDuplicateSection = document.querySelector('#fileDuplicateSection');
  const fileDupList = document.querySelector('.file-dup-list');
  const fileDupCount = document.querySelector('.file-dup-count');

  const importModeSection = document.querySelector('#importModeSection');

  fileInput.addEventListener('change', async () => {
    const file = fileInput.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      csvInput.value = text;
    } catch (err) {
      alert('读取文件失败：' + err.message);
    }
  });

  clearBtn.addEventListener('click', () => {
    csvInput.value = '';
    fileInput.value = '';
    previewResult.style.display = 'none';
    currentItems = [];
    commitBtn.disabled = true;
  });

  previewBtn.addEventListener('click', async () => {
    const csvText = csvInput.value.trim();
    if (!csvText) {
      alert('请先粘贴 CSV 文本或上传文件');
      return;
    }

    previewBtn.disabled = true;
    try {
      const result = await api('/api/import/preview', {
        method: 'POST',
        body: JSON.stringify({ csvText })
      });

      const newItems = result.newItems || [];
      const updateItems = result.updateItems || [];
      const errors = result.errors || [];
      const fileDuplicates = result.fileDuplicates || [];

      currentItems = [
        ...newItems,
        ...updateItems.map(u => ({
          code: u.code,
          name: u.updatableFields.find(f => f.field === 'name')?.newValue || '',
          purpose: u.updatableFields.find(f => f.field === 'purpose')?.newValue || '',
          material: u.updatableFields.find(f => f.field === 'material')?.newValue || '',
          location: u.updatableFields.find(f => f.field === 'location')?.newValue || ''
        }))
      ];

      newCount.textContent = result.newCount || 0;
      if (newItems.length > 0) {
        newItemsSection.style.display = 'block';
        newTbody.innerHTML = newItems.map(item =>
          '<tr><td>' + escapeHtml(item.code) + '</td><td>' + escapeHtml(item.name) +
          '</td><td>' + escapeHtml(item.purpose) + '</td><td>' + escapeHtml(item.material) +
          '</td><td>' + escapeHtml(item.location) + '</td></tr>'
        ).join('');
      } else {
        newItemsSection.style.display = 'none';
      }

      updateCount.textContent = result.updateCount || 0;
      unchangedCount.textContent = result.unchangedCount || 0;
      if (updateItems.length > 0) {
        updateItemsSection.style.display = 'block';
        updateList.innerHTML = updateItems.map(renderUpdateItemCard).join('');
      } else {
        updateItemsSection.style.display = 'none';
      }

      errorCount.textContent = errors.length;
      if (errors.length > 0) {
        errorSection.style.display = 'block';
        errorList.innerHTML = errors.map(e =>
          '<li>第 ' + e.line + ' 行：' + escapeHtml(e.message) + (e.raw ? ' <span class="meta">（原始：' + escapeHtml(e.raw) + '）</span>' : '') + '</li>'
        ).join('');
      } else {
        errorSection.style.display = 'none';
      }

      fileDupCount.textContent = fileDuplicates.length;
      if (fileDuplicates.length > 0) {
        fileDuplicateSection.style.display = 'block';
        fileDupList.innerHTML = fileDuplicates.map(d =>
          '<li>第 ' + (d.index + 2) + ' 行 编号 ' + escapeHtml(d.code) + '：' + escapeHtml(d.reason) + '</li>'
        ).join('');
      } else {
        fileDuplicateSection.style.display = 'none';
      }

      const hasNewItems = newItems.length > 0;
      const hasUpdateItems = updateItems.length > 0;
      if (hasNewItems || hasUpdateItems) {
        importModeSection.style.display = 'block';
        const modeRadios = document.querySelectorAll('input[name="importMode"]');
        modeRadios.forEach(radio => {
          const mode = radio.value;
          let disabled = false;
          if (mode === 'insert_only' && !hasNewItems) disabled = true;
          if (mode === 'update_only' && !hasUpdateItems) disabled = true;
          radio.disabled = disabled;
          const parentLabel = radio.closest('.import-mode-option');
          if (disabled) {
            parentLabel.style.opacity = '0.5';
            parentLabel.style.cursor = 'not-allowed';
          } else {
            parentLabel.style.opacity = '1';
            parentLabel.style.cursor = 'pointer';
          }
          if (!disabled && !radio.checked && document.querySelector('input[name="importMode"]:checked')?.disabled) {
            radio.checked = true;
          }
        });
      } else {
        importModeSection.style.display = 'none';
      }

      let summaryHtml = '<div class="preview-summary-box">';
      if (newItems.length > 0) {
        summaryHtml += '新增：<strong>' + newItems.length + '</strong> 条';
      }
      if (updateItems.length > 0) {
        if (newItems.length > 0) summaryHtml += ' · ';
        summaryHtml += '更新：<strong>' + (result.updateCount || 0) + '</strong> 条';
        if (result.unchangedCount > 0) {
          summaryHtml += '（无变更 <strong>' + result.unchangedCount + '</strong> 条）';
        }
      }
      if (errors.length > 0) {
        summaryHtml += ' · <span class="warn">错误：' + errors.length + ' 条</span>';
      }
      if (fileDuplicates.length > 0) {
        summaryHtml += ' · <span class="warn">文件内重复：' + fileDuplicates.length + ' 条</span>';
      }
      summaryHtml += '</div>';
      previewSummary.innerHTML = summaryHtml;

      previewResult.style.display = 'block';
      commitBtn.disabled = currentItems.length === 0;
      applyPermissionGuards();
    } catch (err) {
      alert('解析失败：' + err.message);
    } finally {
      previewBtn.disabled = false;
    }
  });

  commitBtn.addEventListener('click', async () => {
    if (currentItems.length === 0) return;

    const selectedMode = document.querySelector('input[name="importMode"]:checked')?.value || 'insert_only';
    const modeLabels = {
      insert_only: '仅新增',
      update_only: '仅更新',
      insert_and_update: '新增并更新'
    };

    if (!confirm('确认以【' + modeLabels[selectedMode] + '】模式导入 ' + currentItems.length + ' 条道具数据？')) return;

    commitBtn.disabled = true;
    try {
      const result = await api('/api/import/commit', {
        method: 'POST',
        body: JSON.stringify({ items: currentItems, mode: selectedMode })
      });

      let msg = '导入完成！';
      if (result.inserted > 0) msg += ' 新增 ' + result.inserted + ' 条';
      if (result.updated > 0) msg += (result.inserted > 0 ? '，' : '') + ' 更新 ' + result.updated + ' 条';
      if (result.unchanged > 0) msg += '，无变更 ' + result.unchanged + ' 条';
      if (result.skipped > 0) msg += '，跳过 ' + result.skipped + ' 条';
      alert(msg);

      csvInput.value = '';
      fileInput.value = '';
      previewResult.style.display = 'none';
      currentItems = [];
      await load();
    } catch (err) {
      alert('导入失败：' + err.message);
      commitBtn.disabled = false;
    }
  });
}

function renderUpdateItemCard(item) {
  const badgeClass = item.hasChanges ? 'changed' : 'unchanged';
  const badgeText = item.hasChanges ? '有变更' : '无变更';
  const cardClass = item.hasChanges ? '' : 'unchanged';

  const updatableHtml = item.updatableFields.map(field => {
    let valueHtml = '';
    if (field.changed) {
      valueHtml = '<span class="field-old-value">' + escapeHtml(field.oldValue) + '</span>' +
                  '<span class="field-arrow">→</span>' +
                  '<span class="field-new-value">' + escapeHtml(field.newValue) + '</span>';
    } else {
      valueHtml = '<span class="field-same-value">' + escapeHtml(field.oldValue) + '</span>';
    }
    return '<div class="field-row">' +
           '<span class="field-label">' + escapeHtml(field.label) + '</span>' +
           '<span class="field-value-row">' + valueHtml + '</span>' +
           '</div>';
  }).join('');

  const nonUpdatableHtml = item.nonUpdatableFields.map(field =>
    '<div class="field-row">' +
    '<span class="field-label">' + escapeHtml(field.label) + '</span>' +
    '<span class="field-value-row"><span class="field-non-updatable-value">' + escapeHtml(field.value) + '</span></span>' +
    '</div>'
  ).join('');

  return '<div class="update-item-card ' + cardClass + '">' +
    '<div class="update-item-header">' +
    '<span class="update-item-code">' + escapeHtml(item.code) + '</span>' +
    '<span class="update-item-badge ' + badgeClass + '">' + badgeText + '</span>' +
    '</div>' +
    '<div class="update-fields-grid">' +
    '<div class="field-group updatable">' +
    '<div class="field-group-title">可更新字段</div>' +
    updatableHtml +
    '</div>' +
    '<div class="field-group non-updatable">' +
    '<div class="field-group-title">不可更新字段（保留）</div>' +
    nonUpdatableHtml +
    '</div>' +
    '</div>' +
    '</div>';
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text == null ? '' : String(text);
  return div.innerHTML;
}
