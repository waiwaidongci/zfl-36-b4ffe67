import { applyPermissionGuards } from "./auth.js";

let currentItems = [];

export function initImport(api, load) {
  const csvInput = document.querySelector('#csvInput');
  const fileInput = document.querySelector('#fileInput');
  const previewBtn = document.querySelector('#previewBtn');
  const clearBtn = document.querySelector('#clearBtn');
  const commitBtn = document.querySelector('#commitBtn');
  const previewResult = document.querySelector('#previewResult');
  const previewTbody = document.querySelector('.preview-tbody');
  const errorList = document.querySelector('.error-list');
  const dupList = document.querySelector('.dup-list');
  const errorSection = document.querySelector('#errorSection');
  const duplicateSection = document.querySelector('#duplicateSection');
  const validCount = document.querySelector('.valid-count');
  const errorCount = document.querySelector('.error-count');
  const dupCount = document.querySelector('.dup-count');
  const previewSummary = document.querySelector('.preview-summary');

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

      currentItems = result.items || [];
      validCount.textContent = result.validCount;
      previewTbody.innerHTML = currentItems.map(item =>
        '<tr><td>' + escapeHtml(item.code) + '</td><td>' + escapeHtml(item.name) +
        '</td><td>' + escapeHtml(item.purpose) + '</td><td>' + escapeHtml(item.material) +
        '</td><td>' + escapeHtml(item.location) + '</td></tr>'
      ).join('');

      const errors = result.errors || [];
      errorCount.textContent = errors.length;
      if (errors.length > 0) {
        errorSection.style.display = 'block';
        errorList.innerHTML = errors.map(e =>
          '<li>第 ' + e.line + ' 行：' + escapeHtml(e.message) + (e.raw ? ' <span class="meta">（原始：' + escapeHtml(e.raw) + '）</span>' : '') + '</li>'
        ).join('');
      } else {
        errorSection.style.display = 'none';
      }

      const duplicates = result.duplicates || [];
      dupCount.textContent = duplicates.length;
      if (duplicates.length > 0) {
        duplicateSection.style.display = 'block';
        dupList.innerHTML = duplicates.map(d =>
          '<li>第 ' + (d.index + 2) + ' 行 编号 ' + escapeHtml(d.code) + '：' + escapeHtml(d.reason) + '</li>'
        ).join('');
      } else {
        duplicateSection.style.display = 'none';
      }

      previewSummary.innerHTML = '<div class="preview-summary-box">' +
        '有效数据：<strong>' + result.validCount + '</strong> 条' +
        (errors.length ? ' · <span class="warn">错误：' + errors.length + ' 条</span>' : '') +
        (duplicates.length ? ' · <span class="warn">重复：' + duplicates.length + ' 条</span>' : '') +
        '</div>';

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
    if (!confirm('确认导入 ' + currentItems.length + ' 条道具数据？')) return;

    commitBtn.disabled = true;
    try {
      const result = await api('/api/import/commit', {
        method: 'POST',
        body: JSON.stringify({ items: currentItems })
      });
      alert('导入完成！成功 ' + result.imported + ' 条' + (result.skipped ? '，跳过 ' + result.skipped + ' 条' : ''));
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

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text == null ? '' : String(text);
  return div.innerHTML;
}
