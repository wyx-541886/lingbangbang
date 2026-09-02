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
  function cardHtml(t, withAction) {
    const done = t.status === 'done';
    const statusTxt = done ? '已完成' : '待接取';
    return '<article class="task-card st-' + (done ? 'done' : 'pending') + '">' +
        '<div class="tc-head">' +
          '<span class="tc-time">' + escHtml(t.createTime) + '</span>' +
          '<span class="tc-state ' + (done ? 'done' : 'pending') + '">' + statusTxt + '</span>' +
        '</div>' +
        '<h3 class="tc-title">' + escHtml(t.title) + '</h3>' +
        '<p class="tc-desc">' + escHtml(t.desc) + '</p>' +
        '<div class="tc-foot">' +
          '<span class="tc-reward">悬赏 <b>+' + t.reward + ' 积分</b></span>' +
          (withAction && !done
            ? '<button class="accept-btn" data-id="' + t.id + '">接取任务</button>'
            : '<span class="done-tag">&#10003; 已完成</span>') +
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

    const pending = all.filter(function (t) { return t.status === 'pending'; }).length;
    const done = all.length - pending;
    $('boardNote').textContent = '共 ' + all.length + ' 条 · 待接取 ' + pending + ' · 已完成 ' + done;
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

    // 预估实际所得（不落库），确认后按 20% 抽成注入爱心池
    const settle = AppStore.calcTaskReward(t.reward);
    const ok = await UI.confirm({
      title: '接取任务',
      content:
        '确定接取「' + t.title + '」吗？\n\n' +
        '本单悬赏佣金 ' + t.reward + ' 积分。为把善意传递给更多需要帮助的邻里，平台将从中提取 20%（' + settle.commission + ' 积分），汇入爱心公益池，专项用于关怀社区困难人群。\n\n' +
        '任务完成后，您将获得 ' + settle.gain + ' 积分。感谢您的爱心参与。',
      confirmText: '接取',
      cancelText: '再想想'
    });
    if (!ok) return;

    UI.showLoading('正在接取...');
    setTimeout(function () {
      const list = AppStore.getTasks();
      const target = list.find(function (x) { return x.id === id; });
      if (target) {
        target.status = 'done';
        AppStore.saveTasks(list);
      }
      const result = AppStore.settleTaskReward(t.reward);
      AppStore.changePoints(result.gain);
      UI.hideLoading();
      syncPoints();
      renderBoard();
      renderMe();
      UI.toast('接取成功，爱心 +' + result.gain + ' 积分', 'success');
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
  function renderMe() {
    const tasks = AppStore.getTasks();
    $('mePub').textContent = tasks.length;
    $('meDone').textContent = tasks.filter(function (t) { return t.status === 'done'; }).length;
    renderList($('meTaskGrid'), tasks.slice(0, 12), $('meEmpty'), false);
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
      if (ab) { acceptTask(ab.dataset.id); }
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
