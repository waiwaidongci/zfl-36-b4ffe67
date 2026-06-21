function getQrCodeUrl(identifier) {
  const base = window.location.origin;
  return base + '/qrcode/' + encodeURIComponent(identifier);
}

function generateQrCode(canvas, text) {
  if (typeof QRCode !== 'undefined' && QRCode.draw) {
    QRCode.draw(canvas, text, QRCode.QRErrorCorrectLevel.M);
    return true;
  }
  return false;
}

function createLabelHtml(item, qrDataUrl) {
  return `
    <div class="qr-label">
      <div class="qr-label-header">
        <div class="qr-label-title">鸬鹚捕鱼道具</div>
      </div>
      <div class="qr-label-code">${item.code || item.id}</div>
      <div class="qr-label-name">${item.name || ''}</div>
      <div class="qr-label-qrcode">
        <img src="${qrDataUrl}" alt="二维码">
      </div>
      <div class="qr-label-footer">
        <div class="qr-label-location">${item.location || ''}</div>
        <div class="qr-label-status">${item.status || ''}</div>
      </div>
    </div>
  `;
}

export function showQrLabelModal(item) {
  const identifier = item.id || item.code;
  const qrUrl = getQrCodeUrl(identifier);

  const modal = document.createElement('div');
  modal.className = 'qr-modal';
  modal.innerHTML = `
    <div class="qr-modal-content">
      <div class="qr-modal-header">
        <h3>二维码标签</h3>
        <button class="qr-modal-close">&times;</button>
      </div>
      <div class="qr-modal-body">
        <div class="qr-label-preview">
          <canvas id="qrCanvas" width="200" height="200" style="display:none"></canvas>
          <div id="qrLabelContainer"></div>
        </div>
        <div class="qr-actions">
          <button id="printLabelBtn" class="secondary">打印标签</button>
          <button id="downloadLabelBtn">下载图片</button>
        </div>
        <div class="qr-info">
          <p><strong>编号：</strong>${item.code || item.id}</p>
          <p><strong>名称：</strong>${item.name || ''}</p>
          <p><strong>扫码链接：</strong><a href="${qrUrl}" target="_blank">${qrUrl}</a></p>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  const canvas = modal.querySelector('#qrCanvas');
  const labelContainer = modal.querySelector('#qrLabelContainer');
  const closeBtn = modal.querySelector('.qr-modal-close');
  const printBtn = modal.querySelector('#printLabelBtn');
  const downloadBtn = modal.querySelector('#downloadLabelBtn');

  function closeModal() {
    modal.remove();
  }

  closeBtn.onclick = closeModal;
  modal.onclick = function (e) {
    if (e.target === modal) closeModal();
  };

  function generateLabel() {
    const success = generateQrCode(canvas, qrUrl);
    if (success) {
      const dataUrl = canvas.toDataURL('image/png');
      labelContainer.innerHTML = createLabelHtml(item, dataUrl);
    } else {
      labelContainer.innerHTML = '<div class="qr-error">二维码生成失败</div>';
    }
  }

  printBtn.onclick = function () {
    const printWindow = window.open('', '_blank');
    const dataUrl = canvas.toDataURL('image/png');
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>打印二维码标签 - ${item.code || item.id}</title>
        <link rel="stylesheet" href="/public/style.css">
        <link rel="stylesheet" href="/public/qrcode-label.css">
      </head>
      <body>
        <div class="print-container">
          ${createLabelHtml(item, dataUrl)}
        </div>
        <script>
          window.onload = function() {
            window.print();
          };
        </script>
      </body>
      </html>
    `);
    printWindow.document.close();
  };

  downloadBtn.onclick = function () {
    const dataUrl = canvas.toDataURL('image/png');
    const link = document.createElement('a');
    link.download = '二维码标签_' + (item.code || item.id) + '.png';
    link.href = dataUrl;
    link.click();
  };

  generateLabel();
}

export function initQrCodeFeatures(api, load) {
  document.addEventListener('click', function (e) {
    const qrBtn = e.target.closest('[data-qrcode]');
    if (qrBtn) {
      const identifier = qrBtn.dataset.qrcode;
      const item = window._items ? window._items.find(i => i.id === identifier || i.code === identifier) : null;
      if (item) {
        showQrLabelModal(item);
      } else {
        api('/api/qrcode/' + encodeURIComponent(identifier))
          .then(function (data) {
            showQrLabelModal(data);
          })
          .catch(function (err) {
            alert('获取道具信息失败：' + err.message);
          });
      }
      e.preventDefault();
      e.stopPropagation();
    }
  });
}
