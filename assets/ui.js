/* ============================================================
   邻帮帮 · UI 层：loading / toast / modal + 背景瀑布流构建
   ============================================================ */

// 文本转义，防 XSS
function escHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const UI = (function () {
  let maskEl = null, toastEl = null, modalEl = null, toastTimer = null;

  function buildLoading() {
    const mask = document.createElement('div');
    mask.className = 'loading-mask';
    mask.innerHTML =
      '<div class="loading-box">' +
        '<div class="spinner"></div>' +
        '<div class="loading-text"></div>' +
      '</div>';
    mask.querySelector('.loading-text').textContent = '加载中...';
    document.body.appendChild(mask);
    return mask;
  }

  function buildToast() {
    const t = document.createElement('div');
    t.className = 'toast';
    document.body.appendChild(t);
    return t;
  }

  function buildModal() {
    const m = document.createElement('div');
    m.className = 'modal-mask';
    m.innerHTML =
      '<div class="modal-box">' +
        '<div class="modal-title"></div>' +
        '<div class="modal-content"></div>' +
        '<div class="modal-btns"></div>' +
      '</div>';
    document.body.appendChild(m);
    return m;
  }

  /* ---------- Loading ---------- */
  function showLoading(text) {
    if (!maskEl) maskEl = buildLoading();
    const txt = maskEl.querySelector('.loading-text');
    if (text) txt.textContent = text;
    maskEl.classList.add('show');
  }

  function hideLoading() {
    if (maskEl) maskEl.classList.remove('show');
  }

  /* ---------- Toast ---------- */
  function toast(title, icon) {
    if (!toastEl) toastEl = buildToast();
    if (icon === 'success') {
      toastEl.innerHTML = '<span class="t-icon">&#10003;</span>' + escHtml(title);
    } else {
      toastEl.textContent = title;
    }
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      toastEl.classList.remove('show');
    }, 1600);
  }

  /* ---------- Modal ---------- */
  function modal(opts) {
    if (!modalEl) modalEl = buildModal();
    const title = opts.title || '';
    const content = opts.content || '';
    const confirmText = opts.confirmText || '确定';
    const cancelText = opts.cancelText || '取消';
    const showCancel = opts.showCancel !== false;

    modalEl.querySelector('.modal-title').textContent = title;
    modalEl.querySelector('.modal-content').textContent = content;

    const btns = modalEl.querySelector('.modal-btns');
    btns.innerHTML = '';

    function close(ok) {
      modalEl.classList.remove('show');
      if (opts.onClose) opts.onClose(ok);
    }

    if (showCancel) {
      const cancelBtn = document.createElement('button');
      cancelBtn.type = 'button';
      cancelBtn.className = 'modal-btn cancel';
      cancelBtn.textContent = cancelText;
      cancelBtn.addEventListener('click', function () { close(false); });
      btns.appendChild(cancelBtn);
    }

    const okBtn = document.createElement('button');
    okBtn.type = 'button';
    okBtn.className = 'modal-btn';
    okBtn.textContent = confirmText;
    okBtn.addEventListener('click', function () { close(true); });
    btns.appendChild(okBtn);

    modalEl.classList.add('show');
  }

  function confirm(opts) {
    return new Promise(function (resolve) {
      modal(Object.assign({}, opts, { onClose: function (ok) { resolve(ok); } }));
    });
  }

  /* ---------- 背景瀑布流装饰 ---------- */
  const BG_SAMPLES = [
    { tag: '遛狗', title: '帮忙遛狗半小时', reward: 15, avatar: '王' },
    { tag: '买菜', title: '代购蔬菜水果', reward: 10, avatar: '李' },
    { tag: '陪诊', title: '陪老人去医院取药', reward: 30, avatar: '张' },
    { tag: '取件', title: '代取快递上门', reward: 8, avatar: '刘' },
    { tag: '维修', title: '换灯泡修水管', reward: 25, avatar: '陈' },
    { tag: '辅导', title: '辅导小学生作业', reward: 20, avatar: '赵' },
    { tag: '拍照', title: '帮拍全家福', reward: 12, avatar: '周' },
    { tag: '喂养', title: '出差代喂宠物猫', reward: 18, avatar: '孙' }
  ];

  function wfCard(item, h) {
    return '<div class="wf-card" style="height:' + h + 'px">' +
      '<span class="wf-tag">' + escHtml(item.tag) + '</span>' +
      '<span class="wf-title">' + escHtml(item.title) + '</span>' +
      '<div class="wf-foot">' +
        '<span class="wf-avatar">' + escHtml(item.avatar) + '</span>' +
        '<span class="wf-reward">+' + item.reward + '</span>' +
      '</div>' +
    '</div>';
  }

  // 每列生成“两份相同”内容：一份约等于一屏高，两份即可无缝循环
  function fillWaterfall() {
    const cols = [document.getElementById('wfCol1'), document.getElementById('wfCol2')];
    if (!cols[0] || !cols[1]) return;
    const viewH = window.innerHeight || 800;

    cols.forEach(function (col, ci) {
      let html = '';
      let acc = 0;
      const budget = Math.ceil(viewH * 1.08);
      let i = 0;
      while (acc < budget && i < 40) {
        const item = BG_SAMPLES[(ci * 2 + i) % BG_SAMPLES.length];
        const h = 120 + ((i * 37 + ci * 53) % 90);
        html += wfCard(item, h);
        acc += h + 20;
        i += 1;
      }
      // 内容重复一份，位移 -50% 时无缝循环
      col.innerHTML = '<div class="wf-track">' + html + html + '</div>';
    });
  }

  return { showLoading, hideLoading, toast, modal, confirm, fillWaterfall };
})();
