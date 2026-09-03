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
    let action;
    if (withAction && t.status === 'pending') {
      action = '<button class="accept-btn" data-id="' + t.id + '">接取任务</button>';
    } else if (withAction && t.status === 'doing') {
      action = '<button class="deliver-btn" data-id="' + t.id + '">交付任务</button>';
    } else if (t.status === 'done') {
      let rateTxt = '';
      const rv = AppStore.getReviewByTask(t.id);
      if (rv) {
        rateTxt = '<span class="done-rate">&#9733; ' + rv.avg + ' 均星</span>';
      }
      action = '<span class="done-meta"><span class="done-tag">&#10003; 已完成</span>' + rateTxt + '</span>';
    } else {
      action = '<span class="done-tag">待接取</span>';
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
        '接单后请按时认真交付：任务完成时，发布者将按「完成度 + 服务态度」为你打星验收（五星制、支持半星），星级会公平换算为信誉分增减。',
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

  /* ===================== 交付任务（发布者五星评分验收 → 信誉结算） ===================== */
  async function deliverTask(id) {
    const tasks = AppStore.getTasks();
    const t = tasks.find(function (x) { return x.id === id; });
    if (!t || t.status !== 'doing') return;

    const settle = AppStore.calcTaskReward(t.reward);

    // 交付 → 发布者验收评分（完成度 + 服务态度，五星半星制）
    const rating = await UI.openRate({
      title: t.title,
      reward: t.reward,
      gain: settle.gain
    });
    if (!rating) return;

    UI.showLoading('正在验收结算...');
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
      const rec = AppStore.addReview({
        taskId: t.id,
        taskTitle: t.title,
        completion: rating.completion,
        attitude: rating.attitude,
        comment: rating.comment
      });

      UI.hideLoading();
      syncPoints();
      renderBoard();
      renderMe();
      const d = rec.delta;
      if (d > 0) {
        UI.toast('验收完成 · 实得 ' + result.gain + ' 积分 · 信誉 +' + d, 'success');
      } else if (d < 0) {
        UI.toast('验收完成 · 实得 ' + result.gain + ' 积分 · 信誉 ' + d);
      } else {
        UI.toast('验收完成 · 实得 ' + result.gain + ' 积分 · 信誉无变动', 'success');
      }
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
      const star = typeof r.starAvg === 'number' ? '<span class="ci-star">&#9733; ' + r.starAvg + '</span>' : '';
      return '<li class="credit-item">' +
        '<span class="ci-delta ' + (up ? 'up' : 'down') + '">' + (up ? '+' : '') + r.delta + '</span>' +
        star +
        '<span class="ci-tx">' + escHtml(r.text) + '</span>' +
        '<span class="ci-time">' + escHtml(r.time) + '</span>' +
      '</li>';
    }).join('');
  }

  /* ===================== 综合评分统计 ===================== */
  // 填充星星进度：value / 5 决定金色填充宽度
  function paintStars(fillId, value) {
    const el = $(fillId);
    if (el) el.style.width = (value / 5 * 100) + '%';
  }

  function fmtNum(x) {
    return (Math.round(x * 100) / 100).toString();
  }

  function renderRatingSummary() {
    const sum = AppStore.getRatingSummary();
    const box = $('rateSummary');
    const meRate = $('meRate');
    const meRateCnt = $('meRateCnt');

    if (!sum) {
      if (box) box.hidden = true;
      if (meRate) meRate.textContent = '--';
      if (meRateCnt) meRateCnt.textContent = '暂无评分';
      return;
    }
    if (box) {
      box.hidden = false;
      const set = function (fillId, numId, v) {
        paintStars(fillId, v);
        const num = $(numId);
        if (num) num.textContent = fmtNum(v);
      };
      set('rsFillComp', 'rsNumComp', sum.completion);
      set('rsFillAtt', 'rsNumAtt', sum.attitude);
      set('rsFillAvg', 'rsNumAvg', sum.avg);
      const cnt = $('rsCnt');
      if (cnt) cnt.textContent = '累计 ' + sum.count + ' 次交付验收';
    }
    if (meRate) meRate.textContent = fmtNum(sum.avg);
    if (meRateCnt) meRateCnt.textContent = '已积累 ' + sum.count + ' 次评价';
  }

  function renderMe() {
    const tasks = AppStore.getTasks();
    $('mePub').textContent = tasks.length;
    $('meDone').textContent = tasks.filter(function (t) { return t.status === 'done'; }).length;
    renderCredit();
    renderRatingSummary();
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
        content: '将信誉恢复为初始的 100，并清空信誉记录与全部历史评分，确定吗？',
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
    } else if (act === 'creditRules') {
      UI.modal({
        title: '信誉奖惩制度',
        content:
          '一、评分方式\n' +
          '每次任务交付后，发布者对交付者按两个维度打星（五星制，支持半星）：\n' +
          '· 完成度：任务是否保质保量、结果是否到位\n' +
          '· 服务态度：沟通配合、守时与礼貌程度\n\n' +
          '二、换算规则（单次）\n' +
          '两维平均得"本次均星"，以 3 星为公平基准：均星每高 0.25 星信誉 +1，每低 0.25 星信誉 -1（约合每差 1 星 ±4 分）。\n' +
          '速查：5★→+5 · 4.5★→+5 · 4★→+4 · 3.5★→+2 · 3★→0 · 2.5★→-2 · 2★→-4 · ≤1.5★→-5\n\n' +
          '三、公平保护\n' +
          '1. 单次封顶：一次评价最多 +5、最多 -5，防止信誉暴涨暴跌，让评分回归真实；\n' +
          '2. 一次一评：每笔任务只能验收一次，交付即评，没有补分空间；\n' +
          '3. 长期累计：信誉来自多笔交付的综合，零星高分无法维持，杜绝刷分。\n\n' +
          '四、等级影响（满分 100）\n' +
          '· 90-100 邻里之星\n· 75-89 靠谱好邻居\n· 60-74 信用一般\n· 60 以下 待改进\n\n' +
          '分数长期低于 60 的邻里将被标注为"待改进"，影响后续接单机会。\n\n' +
          '公益互助基于信任。评分不是惩罚工具，而是让每一次善意与尽责，都积累成看得见的信用。',
        showCancel: false,
        confirmText: '知道了',
        align: 'left'
      });
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
