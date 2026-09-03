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
        '<button class="modal-x" type="button" aria-label="关闭">&times;</button>' +
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
    modalEl.style.zIndex = 1001; // 通用弹窗置于各专用面板（申诉/悬赏/评分/注册登记等，均为 1000）之上
    const title = opts.title || '';
    const content = opts.content || '';
    const confirmText = opts.confirmText || '确定';
    const cancelText = opts.cancelText || '取消';
    const showCancel = opts.showCancel !== false;

    modalEl.querySelector('.modal-title').textContent = title;
    const contentEl = modalEl.querySelector('.modal-content');
    if (opts.html) contentEl.innerHTML = opts.html; // 富文本内容（调用方保证已转义）
    else contentEl.textContent = content;
    contentEl.classList.toggle('left', opts.align === 'left');

    const btns = modalEl.querySelector('.modal-btns');
    btns.innerHTML = '';

    function close(v) {
      modalEl.classList.remove('show');
      if (opts.onClose) opts.onClose(v);
    }

    // 右上角关闭键：等同取消/关闭；自定义按钮弹窗不显示，避免与主操作混淆
    const xEl = modalEl.querySelector('.modal-x');
    if (xEl) {
      const custom = Array.isArray(opts.buttons) && opts.buttons.length;
      xEl.style.display = custom ? 'none' : 'flex';
      xEl.onclick = function () { close(false); };
    }

    // 自定义按钮组：每项 { text, value, cls }，点按后回传对应 value
    if (Array.isArray(opts.buttons) && opts.buttons.length) {
      opts.buttons.forEach(function (b) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'modal-btn' + (b.cls ? ' ' + b.cls : '');
        btn.textContent = b.text || '确定';
        btn.addEventListener('click', function () {
          close(b.value === undefined ? true : b.value);
        });
        btns.appendChild(btn);
      });
      if (opts.colButtons) btns.classList.add('col');
    } else {
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
    }

    modalEl.classList.add('show');
  }

  function confirm(opts) {
    return new Promise(function (resolve) {
      modal(Object.assign({}, opts, { onClose: function (ok) { resolve(ok); } }));
    });
  }

  // 多选项弹窗：resolves 为用户所点按钮的 value（关闭弹窗视为 null）
  function choice(opts) {
    return new Promise(function (resolve) {
      modal(Object.assign({}, opts, { onClose: function (v) { resolve(v); } }));
    });
  }

  /* ---------- 星级评分弹窗：发布者验收评分（五星整星制） ---------- */
  const STAR_LABELS = {
    0: '未评分', 1: '很差', 2: '较差', 3: '一般', 4: '满意', 5: '极佳'
  };
  const RATE_DIMS = [
    { key: 'completion', dim: '完成度', hint: '任务是否保质保量、交付结果是否到位' },
    { key: 'attitude', dim: '服务态度', hint: '沟通配合、守时与礼貌程度' }
  ];

  let rateMaskEl = null;
  let rateResolve = null;

  function paintRateRow(row) {
    const v = (row._hover > 0 ? row._hover : row._cur) || 0;
    const fill = row.querySelector('.s-fill');
    if (fill) fill.style.width = (v / 5 * 100) + '%';
    const num = row.querySelector('.rp-num');
    if (num) {
      num.textContent = v ? (v + ' 星 · ' + STAR_LABELS[v]) : '未评分';
      num.className = 'rp-num' + (v >= 4 ? ' high' : v <= 2 && v > 0 ? ' low' : '');
    }
  }

  // 根据鼠标落点换算整星值：鼠标移到哪一颗星上，就点亮到第几颗（1~5）
  function rateValueFromEvent(starsEl, e) {
    if (!starsEl) return 0; // 防御：元素已被重建时不再换算
    // 以真实的 5 星容器 .s-base 作为参考宽度，避免父容器过宽时点击位置错位
    const ref = starsEl.querySelector('.s-base') || starsEl;
    const rect = ref.getBoundingClientRect();
    if (!rect.width) return 0;
    const unit = rect.width / 5;
    const idx = Math.round((e.clientX - rect.left) / unit); // 0~5
    return Math.max(1, Math.min(5, idx));
  }

  function rateRowHtml(d) {
    return '<div class="rp-row" data-k="' + d.key + '">' +
      '<div class="rp-head">' +
        '<span class="rp-dim">' + d.dim + '</span>' +
        '<span class="rp-num">未评分</span>' +
      '</div>' +
      '<div class="rp-stars">' +
        '<span class="s-base" aria-hidden="true">★★★★★</span>' +
        '<span class="s-fill" aria-hidden="true">★★★★★</span>' +
      '</div>' +
      '<div class="rp-hint">' + d.hint + '</div>' +
    '</div>';
  }

  function buildRateMask() {
    const m = document.createElement('div');
    m.className = 'modal-mask rate-mask';
    m.innerHTML =
      '<div class="rate-panel">' +
        '<div class="rp-title">发布者验收评分</div>' +
        '<div class="rp-sub"></div>' +
        '<div class="rp-body">' +
          RATE_DIMS.map(rateRowHtml).join('') +
          '<textarea class="rp-comment" maxlength="120" rows="2" placeholder="选填：给这次交付补充一句真实反馈"></textarea>' +
        '</div>' +
        '<div class="rp-tip"></div>' +
        '<div class="modal-btns">' +
          '<button type="button" class="modal-btn cancel" data-v="cancel">暂不评分</button>' +
          '<button type="button" class="modal-btn" data-v="ok">提交评分</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(m);

    // 遮罩点击关闭
    m.addEventListener('click', function (e) {
      if (e.target === m) closeRate(null);
    });

    const btns = m.querySelectorAll('.modal-btns button');
    btns[0].addEventListener('click', function () { closeRate(null); });
    btns[1].addEventListener('click', function () {
      const get = function (k) {
        const r = m.querySelector('.rp-row[data-k="' + k + '"]');
        return r ? r._cur : 0;
      };
      const c = get('completion');
      const a = get('attitude');
      if (!c || !a) {
        UI.toast('请先为完成度和服务态度各打一颗星');
        return;
      }
      const comment = m.querySelector('.rp-comment').value.trim();
      closeRate({ completion: c, attitude: a, comment: comment });
    });

    // 星星行：鼠标移到哪颗星就点亮到第几颗，点击定值（整星）
    m.querySelectorAll('.rp-row').forEach(function (row) {
      row._cur = 0;
      row._hover = 0;
      const starsEl = row.querySelector('.rp-stars');
      starsEl.addEventListener('mousemove', function (e) {
        row._hover = rateValueFromEvent(starsEl, e);
        paintRateRow(row);
      });
      starsEl.addEventListener('mouseleave', function () {
        row._hover = 0;
        paintRateRow(row);
      });
      starsEl.addEventListener('click', function (e) {
        row._cur = rateValueFromEvent(starsEl, e);
        row._hover = 0;
        paintRateRow(row);
      });
    });
    return m;
  }

  function closeRate(v) {
    if (rateMaskEl) rateMaskEl.classList.remove('show');
    const rs = rateResolve;
    rateResolve = null;
    if (rs) rs(v);
  }

  // info: { title, reward, gain }；resolves 为 {completion, attitude, comment} 或 null
  function openRate(info) {
    return new Promise(function (resolve) {
      if (!rateMaskEl) rateMaskEl = buildRateMask();
      rateResolve = resolve;
      const m = rateMaskEl;

      m.querySelectorAll('.rp-row').forEach(function (row) {
        row._cur = 0;
        row._hover = 0;
        paintRateRow(row);
      });
      const ta = m.querySelector('.rp-comment');
      if (ta) ta.value = '';
      const sub = m.querySelector('.rp-sub');
      if (sub) {
        sub.textContent =
          '任务「' + info.title + '」\n' +
          '本单佣金 ' + info.reward + ' 积分，验收通过后接取者实得 ' + info.gain + ' 积分。' +
          '请从两个维度为本次交付打星（每维 1~5 整颗星），评分将公平换算为该次交付的信誉分。';
      }
      const tip = m.querySelector('.rp-tip');
      if (tip) {
        tip.textContent = '换算规则：以 3 星为公平基准，均星每高 0.25 星信誉 +1、每低 0.25 星信誉 -1，单次调整封顶 +5 / -5。';
      }
      m.classList.add('show');
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

  return { showLoading, hideLoading, toast, modal, confirm, choice, openRate, fillWaterfall };
})();
