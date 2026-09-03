/* ============================================================
   邻帮帮 · 控制层：视图路由 / 渲染 / 交互（宽屏网站版）
   ============================================================ */
(function () {
  'use strict';

  const $ = function (id) { return document.getElementById(id); };

  const VIEW_IDS = { home: 'view-home', publish: 'view-publish', me: 'view-me', settings: 'view-settings' };
  const state = { filter: 'all', submitting: false, acting: false };

  /* ===================== 积分同步 ===================== */
  function syncPoints() {
    const p = AppStore.getPoints();
    const targets = ['ptsTop', 'ptsHero', 'pubPoints', 'mePts'];
    targets.forEach(function (id) {
      const el = $(id);
      if (el) el.textContent = p;
    });
  }

  /* ===================== 任务卡片 HTML ===================== */
  const TASK_STATUS = {
    pending: { cls: 'pending', txt: '待接取' },
    doing:   { cls: 'doing',   txt: '进行中' },
    done:    { cls: 'done',    txt: '已完成' }
  };

  function cardHtml(t, withAction) {
    const st = TASK_STATUS[t.status] || TASK_STATUS.pending;
    let action = '<span class="done-tag">&#10003; 已完成</span>';
    if (withAction) {
      if (t.status === 'pending') {
        action = '<button class="accept-btn" data-id="' + t.id + '">接取任务</button>';
      } else if (t.status === 'doing') {
        action = '<button class="deliver-btn" data-id="' + t.id + '">交付任务</button>';
      }
    }
    return '<article class="task-card st-' + st.cls + '">' +
      '<div class="tc-head">' +
        '<span class="tc-time">' + escHtml(t.createTime) + '</span>' +
        '<span class="tc-state ' + st.cls + '">' + st.txt + '</span>' +
      '</div>' +
      '<h3 class="tc-title">' + escHtml(t.title) + '</h3>' +
      '<p class="tc-desc">' + escHtml(t.desc) + '</p>' +
      '<div class="tc-foot">' +
        '<span class="tc-reward">悬赏 <b>+' + t.reward + ' 积分</b></span>' +
        action +
      '</div>' +
    '</article>';
  }

  function renderList(gridEl, tasks, emptyEl, withAction) {
    if (tasks.length === 0) {
      gridEl.innerHTML = '';
      if (emptyEl) emptyEl.hidden = false;
      return;
    }
    gridEl.innerHTML = tasks.map(function (t) { return cardHtml(t, withAction); }).join('');
    if (emptyEl) emptyEl.hidden = true;
  }

  /* ===================== 任务广场 ===================== */
  function renderBoard() {
    const all = AppStore.getTasks();
    const f = state.filter;
    const shown = f === 'all' ? all.slice() : all.filter(function (t) { return t.status === f; });

    renderList($('taskGrid'), shown, $('emptyBoard'), true);

    const cnt = function (s) { return all.filter(function (t) { return t.status === s; }).length; };
    $('boardNote').textContent = '共 ' + all.length + ' 条 · 待接取 ' + cnt('pending') + ' · 进行中 ' + cnt('doing') + ' · 已完成 ' + cnt('done');
  }

  function setFilter(f) {
    state.filter = f;
    const btns = document.querySelectorAll('#segStatus .seg-btn');
    for (let i = 0; i < btns.length; i += 1) {
      btns[i].classList.toggle('active', btns[i].dataset.status === f);
    }
    renderBoard();
  }

  /* ===================== 接取任务 ===================== */
  async function acceptTask(id) {
    const tasks = AppStore.getTasks();
    const t = tasks.find(function (x) { return x.id === id; });
    if (!t || t.status !== 'pending') return;

    // 预估实际所得（不落库），交付时按 20% 抽成注入爱心池
    const settle = AppStore.calcTaskReward(t.reward);
    const ok = await UI.confirm({
      title: '接取任务',
      content:
        '确定接取「' + t.title + '」吗？\n\n' +
        '本单悬赏佣金 ' + t.reward + ' 积分。为把善意传递给更多需要帮助的邻里，平台将从中提取 20%（' + settle.commission + ' 积分），汇入爱心公益池，专项用于关怀社区困难人群。\n\n' +
        '接单后请认真按时交付：发布者满意将记一次好评（信誉 +2）；若敷衍、拖延的消极完成，信誉将被扣减。',
      confirmText: '接取',
      cancelText: '再想想'
    });
    if (!ok) return;

    UI.showLoading('正在接取...');
    setTimeout(function () {
      const list = AppStore.getTasks();
      const target = list.find(function (x) { return x.id === id; });
      if (target && target.status === 'pending') {
        target.status = 'doing';
        AppStore.saveTasks(list);
      }
      UI.hideLoading();
      syncPoints();
      renderBoard();
      renderMe();
      UI.toast('接单成功，完成后记得交付任务', 'success');
    }, 300);
  }

  /* ===================== 交付任务（发布者验收 → 信誉结算） ===================== */
  async function deliverTask(id) {
    const tasks = AppStore.getTasks();
    const t = tasks.find(function (x) { return x.id === id; });
    if (!t || t.status !== 'doing') return;

    const settle = AppStore.calcTaskReward(t.reward);
    const quality = await UI.choice({
      title: '交付任务',
      content:
        '「' + t.title + '」已由你完成，请选择本次交付表现，作为发布者验收结果：\n\n' +
        '认真完成 → 邻里满意，信誉 +2，实得 ' + settle.gain + ' 积分\n' +
        '消极完成 → 敷衍/拖延交付，信誉 -5（本单积分仍照常结算）',
      buttons: [
        { text: '认真完成 · 邻里满意', value: 'good' },
        { text: '消极完成 · 敷衍交付', value: 'bad', cls: 'cancel' }
      ]
    });
    if (!quality) return;

    UI.showLoading('正在结算...');
    setTimeout(function () {
      const list = AppStore.getTasks();
      const target = list.find(function (x) { return x.id === id; });
      if (!target || target.status !== 'doing') {
        UI.hideLoading();
        return;
      }
      target.status = 'done';
      AppStore.saveTasks(list);

      const result = AppStore.settleTaskReward(t.reward);
      AppStore.changePoints(result.gain);
      if (quality === 'good') {
        AppStore.changeCredit(2, '任务《' + t.title + '》认真按时交付，获邻里好评');
      } else {
        AppStore.changeCredit(-5, '任务《' + t.title + '》被发布者反馈敷衍、消极完成');
      }

      UI.hideLoading();
      syncPoints();
      renderBoard();
      renderMe();
      UI.toast(
        quality === 'good'
          ? '交付成功 · 信誉 +2 · 爱心 +' + result.gain + ' 积分'
          : '已结算 · 本次消极交付，信誉 -5',
        quality === 'good' ? 'success' : undefined
      );
    }, 300);
  }

  /* ===================== 发布任务 ===================== */
  function setRewardChips(activeVal) {
    const chips = document.querySelectorAll('#rewardChips .chip');
    for (let i = 0; i < chips.length; i += 1) {
      chips[i].classList.toggle('active', chips[i].dataset.val === activeVal);
    }
  }

  function clearForm() {
    $('pubForm').reset();
    $('pubDescCount').textContent = '0 / 200';
    setRewardChips(null);
  }

  function submitPublish(e) {
    e.preventDefault();
    if (state.submitting) return;

    const title = $('pubTitle').value.trim();
    const desc = $('pubDesc').value.trim();
    const rewardRaw = $('pubReward').value.trim();
    const rewardNum = Number(rewardRaw);

    if (!title) { UI.toast('请填写任务标题'); return; }
    if (!desc) { UI.toast('请填写任务说明'); return; }
    if (!rewardRaw || !isFinite(rewardNum) || rewardNum <= 0) { UI.toast('请填写正确的积分'); return; }
    if (rewardNum > AppStore.getPoints()) { UI.toast('积分不足'); return; }

    state.submitting = true;
    UI.showLoading('正在发布...');
    setTimeout(function () {
      const newPoints = AppStore.changePoints(-rewardNum);
      if (newPoints === null) {
        state.submitting = false;
        UI.hideLoading();
        UI.toast('积分不足');
        return;
      }

      const task = {
        id: String(Date.now()),
        title: title,
        desc: desc,
        reward: rewardNum,
        status: 'pending',
        createTime: new Date().toLocaleString()
      };
      const tasks = AppStore.getTasks();
      tasks.unshift(task);
      AppStore.saveTasks(tasks);

      UI.hideLoading();
      syncPoints();
      UI.toast('发布成功', 'success');
      clearForm();
      setFilter('all');
      nav('home');
      state.submitting = false;
    }, 300);
  }

  /* ===================== 我的 ===================== */
  function creditLevel(score) {
    if (score >= 90) return { txt: '邻里之星', cls: 'lv-ex' };
    if (score >= 75) return { txt: '靠谱好邻居', cls: 'lv-good' };
    if (score >= 60) return { txt: '信用一般', cls: 'lv-mid' };
    return { txt: '待改进', cls: 'lv-low' };
  }

  // 信誉分卡片 + 变动明细
  function renderCredit() {
    const score = AppStore.getCreditScore();
    const me = $('meCredit');
    if (me) me.textContent = score;

    const badge = $('creditBadge');
    const lv = creditLevel(score);
    if (badge) {
      badge.textContent = lv.txt;
      badge.className = 'st-badge ' + lv.cls;
    }

    const listEl = $('creditList');
    if (!listEl) return;
    const log = AppStore.getCreditHistory();
    const emptyEl = $('creditEmpty');
    if (log.length === 0) {
      listEl.innerHTML = '';
      if (emptyEl) emptyEl.hidden = false;
      return;
    }
    if (emptyEl) emptyEl.hidden = true;
    listEl.innerHTML = log.slice(0, 12).map(function (r) {
      const up = r.delta > 0;
      return '<li class="credit-item">' +
        '<span class="ci-delta ' + (up ? 'up' : 'down') + '">' + (up ? '+' : '') + r.delta + '</span>' +
        '<span class="ci-tx">' + escHtml(r.text) + '</span>' +
        '<span class="ci-time">' + escHtml(r.time) + '</span>' +
      '</li>';
    }).join('');
  }

  function renderMe() {
    const tasks = AppStore.getTasks();
    $('mePub').textContent = tasks.length;
    $('meDone').textContent = tasks.filter(function (t) { return t.status === 'done'; }).length;
    renderCredit();
    renderList($('meTaskGrid'), tasks.slice(0, 12), $('meEmpty'), true);
  }

  /* ===================== 设置 ===================== */
  async function runSetting(act) {
    if (state.acting) return;

    if (act === 'resetPts') {
      const ok = await UI.confirm({
        title: '重置积分',
        content: '将积分重置为 100，确定吗？',
        confirmText: '重置'
      });
      if (!ok) return;
      state.acting = true;
      UI.showLoading('正在重置积分...');
      setTimeout(function () {
        AppStore.resetPoints();
        UI.hideLoading();
        syncPoints();
        renderBoard();
        renderMe();
        UI.toast('已重置', 'success');
        state.acting = false;
      }, 300);
    } else if (act === 'resetCredit') {
      const ok = await UI.confirm({
        title: '重置信誉分',
        content: '将信誉恢复为初始的 100 并清空信誉记录，确定吗？',
        confirmText: '重置'
      });
      if (!ok) return;
      state.acting = true;
      UI.showLoading('正在重置信誉...');
      setTimeout(function () {
        AppStore.resetCredit();
        UI.hideLoading();
        renderMe();
        UI.toast('信誉已重置', 'success');
        state.acting = false;
      }, 300);
    } else if (act === 'clearTasks') {
      const ok = await UI.confirm({
        title: '清空任务',
        content: '将清空所有任务记录，确定吗？',
        confirmText: '清空'
      });
      if (!ok) return;
      state.acting = true;
      UI.showLoading('正在清空任务...');
      setTimeout(function () {
        AppStore.clearTasks();
        UI.hideLoading();
        renderBoard();
        renderMe();
        UI.toast('已清空', 'success');
        state.acting = false;
      }, 300);
    } else if (act === 'about') {
      UI.modal({
        title: '关于邻帮帮',
        content: '邻帮帮是一款社区任务互助平台，让邻里之间互帮互助，用积分传递温暖。',
        showCancel: false,
        confirmText: '知道了'
      });
    }
  }

  /* ===================== 视图路由 ===================== */
  function nav(name) {
    const sec = $(VIEW_IDS[name]);
    if (!sec) return;

    document.querySelectorAll('.view').forEach(function (v) { v.classList.remove('active'); });
    // 重启动画
    sec.classList.remove('active');
    void sec.offsetWidth;
    sec.classList.add('active');

    document.querySelectorAll('.nav-link').forEach(function (a) {
      a.classList.toggle('active', a.dataset.nav === name);
    });

    syncPoints();
    if (name === 'home') renderBoard();
    if (name === 'me') renderMe();

    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /* ===================== 事件绑定 ===================== */
  function bindEvents() {
    document.addEventListener('click', function (e) {
      const navEl = e.target.closest ? e.target.closest('[data-nav]') : null;
      if (navEl) { nav(navEl.dataset.nav); return; }

      const seg = e.target.closest ? e.target.closest('.seg-btn') : null;
      if (seg) { setFilter(seg.dataset.status); return; }

      const act = e.target.closest ? e.target.closest('[data-act]') : null;
      if (act) { runSetting(act.dataset.act); return; }

      const ab = e.target.closest ? e.target.closest('.accept-btn') : null;
      if (ab) { acceptTask(ab.dataset.id); return; }

      const db = e.target.closest ? e.target.closest('.deliver-btn') : null;
      if (db) { deliverTask(db.dataset.id); }
    });

    // 接取任务快捷按钮：跳到广场并切到“待接取”
    $('btnGrab').addEventListener('click', function () {
      nav('home');
      setFilter('pending');
      const board = $('view-home').querySelector('.board-head');
      if (board) board.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    // 发布表单
    $('pubForm').addEventListener('submit', submitPublish);

    document.querySelectorAll('#rewardChips .chip').forEach(function (chip) {
      chip.addEventListener('click', function () {
        $('pubReward').value = chip.dataset.val;
        setRewardChips(chip.dataset.val);
      });
    });

    $('pubReward').addEventListener('input', function () {
      setRewardChips(null);
    });

    $('pubDesc').addEventListener('input', function () {
      $('pubDescCount').textContent = $('pubDesc').value.length + ' / 200';
    });
  }

  /* ===================== 启动 ===================== */
  UI.fillWaterfall();
  let resizeTimer = null;
  window.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(UI.fillWaterfall, 250);
  });
  bindEvents();
  nav('home');
})();
