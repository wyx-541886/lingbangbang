/* ============================================================
   邻帮帮 · 控制层：视图路由 / 渲染 / 交互（宽屏网站版）
   ============================================================ */
(function () {
  'use strict';

  const $ = function (id) { return document.getElementById(id); };

  const VIEW_IDS = { home: 'view-home', publish: 'view-publish', me: 'view-me', jury: 'view-jury', settings: 'view-settings' };
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

  function cardHtml(t, withAction, showAppeal) {
    const st = TASK_STATUS[t.status] || TASK_STATUS.pending;
    let action;
    if (withAction && t.status === 'pending') {
      action = '<button class="accept-btn" data-id="' + t.id + '">接取任务</button>';
    } else if (withAction && t.status === 'doing') {
      action = '<button class="deliver-btn" data-id="' + t.id + '">交付任务</button>';
    } else if (t.status === 'done') {
      // 已完成：展示验收星级；若被差评，在“我的任务”中提供申诉入口
      const rv = AppStore.getReviewByTask(t.id);
      const ap = AppStore.getAppealByTaskId(t.id);
      let stateTxt = '<span class="done-tag">&#10003; 已完成</span>';
      if (rv) {
        if (rv.appealStatus === 'upheld') {
          stateTxt += '<span class="done-appeal ok">&#9878; 申诉成立 · 差评撤销</span>';
        } else if (rv.appealStatus === 'rejected') {
          stateTxt += '<span class="done-appeal no">申诉被驳回</span>';
        } else {
          stateTxt += '<span class="done-rate">&#9733; ' + rv.avg + ' 均星</span>';
        }
      }
      if (showAppeal && rv && rv.delta < 0 && !ap) {
        action = '<span class="done-actions">' +
          '<span class="done-meta">' + stateTxt + '</span>' +
          '<button class="appeal-btn" data-appeal="' + t.id + '">&#9878; 不服 · 去申诉</button>' +
        '</span>';
      } else {
        action = '<span class="done-meta">' + stateTxt + '</span>';
      }
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

  function renderList(gridEl, tasks, emptyEl, withAction, showAppeal) {
    if (tasks.length === 0) {
      gridEl.innerHTML = '';
      if (emptyEl) emptyEl.hidden = false;
      return;
    }
    gridEl.innerHTML = tasks.map(function (t) { return cardHtml(t, withAction, showAppeal); }).join('');
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
        '接单后请按时认真交付：任务完成时，发布者将按「完成度 + 服务态度」为你打星验收（五星整星制），星级会公平换算为信誉分增减。',
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

    // 交付 → 发布者验收评分（完成度 + 服务态度，五星整星制）
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
    renderHonor();
    renderList($('meTaskGrid'), tasks.slice(0, 12), $('meEmpty'), true, true);
  }

  /* ===================== 五级志愿荣誉机制 ===================== */
  // 头衔绑定真实记录：荣誉值 = 信誉贡献(0~28) + 交付数量(0~22) + 验收质量(0~26) + 实得积分(0~24)，满分 100
  const HONOR_LEVELS = [
    { need: 0,  name: '萌芽志愿者',   tag: '善意的种子，正在发芽', mark: '萌' },
    { need: 30, name: '热心志愿者',   tag: '邻里间越来越熟的搭把手', mark: '热' },
    { need: 55, name: '口碑志愿者',   tag: '认真交付攒出的社区口碑', mark: '口' },
    { need: 75, name: '金牌志愿之星', tag: '社区里最靠谱的担当', mark: '金' },
    { need: 90, name: '功勋志愿大使', tag: '把公益过成日常的社区之光', mark: '功' }
  ];
  const HONOR_CAP = { credit: 28, done: 22, rate: 26, earn: 24 }; // 合计 100
  const HONOR_DONE_LADDER = [[0, 0], [1, 4], [2, 6], [3, 8], [4, 10], [5, 12], [6, 14], [7, 15], [9, 17], [12, 19], [16, 21], [20, 22]];
  const HONOR_EARN_LADDER = [[0, 0], [5, 3], [12, 6], [25, 10], [45, 13], [70, 16], [100, 19], [150, 22], [200, 24]];

  // 档位计分：取不超过实际值的最高档积分
  function ladderPts(ladder, val) {
    let pts = 0;
    for (let i = 0; i < ladder.length; i += 1) {
      if (val >= ladder[i][0]) pts = ladder[i][1];
    }
    return pts;
  }

  function honorLevel(honor) {
    let lv = HONOR_LEVELS[0];
    for (let i = 0; i < HONOR_LEVELS.length; i += 1) {
      if (honor >= HONOR_LEVELS[i].need) lv = HONOR_LEVELS[i];
    }
    return lv;
  }

  // 依据真实记录计算全部荣誉维度
  function computeHonor() {
    const creditScore = AppStore.getCreditScore();
    const sum = AppStore.getRatingSummary();
    const done = AppStore.getTasks().filter(function (t) { return t.status === 'done'; });
    const doneCount = done.length;
    let earn = 0;
    done.forEach(function (t) { earn += AppStore.calcTaskReward(t.reward).gain; });

    const parts = {
      credit: Math.round(creditScore / 100 * HONOR_CAP.credit),
      done: ladderPts(HONOR_DONE_LADDER, doneCount),
      rate: (sum && sum.count > 0) ? Math.min(HONOR_CAP.rate, Math.round(sum.avg / 5 * HONOR_CAP.rate)) : 0,
      earn: ladderPts(HONOR_EARN_LADDER, earn)
    };
    const honor = Math.min(100, parts.credit + parts.done + parts.rate + parts.earn);
    const level = honorLevel(honor);
    let next = null;
    for (let i = 0; i < HONOR_LEVELS.length; i += 1) {
      if (honor < HONOR_LEVELS[i].need) { next = HONOR_LEVELS[i]; break; }
    }
    return { creditScore: creditScore, sum: sum, done: done, doneCount: doneCount, earn: earn, parts: parts, honor: honor, level: level, next: next, levelIdx: Math.max(0, HONOR_LEVELS.indexOf(level)) };
  }

  function renderHonor() {
    const h = computeHonor();
    const li = h.levelIdx + 1;

    const markEl = $('honorMark');
    const medal = $('honorMedal');
    if (medal) medal.className = 'honor-medal h' + li;
    if (markEl) markEl.textContent = h.level.mark;

    const nameEl = $('honorName');
    if (nameEl) nameEl.textContent = h.level.name;
    const tagEl = $('honorTag');
    if (tagEl) tagEl.textContent = h.level.tag;
    const lvEl = $('honorLv');
    if (lvEl) lvEl.textContent = 'Lv.' + li + ' · 五级志愿荣誉';
    const fillEl = $('honorFill');
    if (fillEl) fillEl.style.width = h.honor + '%';
    const ptsEl = $('honorPts');
    if (ptsEl) {
      ptsEl.innerHTML = h.honor + '<u>/ 100</u>';
    }
    const noteEl = $('honorNote');
    if (noteEl) {
      noteEl.textContent = h.next
        ? '当前荣誉 ' + h.honor + ' / 100 · 距「' + h.next.name + '」还差 ' + (h.next.need - h.honor) + ' 点'
        : '当前荣誉 ' + h.honor + ' / 100 · 已登顶五级志愿荣誉，感谢你让社区更温暖';
    }
    const pfEl = $('pfTitle');
    if (pfEl) pfEl.textContent = '志愿称号 · ' + h.level.name;

    const grid = $('honorGrid');
    if (!grid) return;
    const s = h.sum;
    const metric = function (k, pts, cap, desc) {
      const pct = Math.min(100, Math.round(pts / cap * 100));
      return '<div class="hm-cell">' +
        '<div class="hm-head"><span>' + k + '</span><b>' + pts + '<u>/ ' + cap + '</u></b></div>' +
        '<span class="hm-bar"><i style="width:' + pct + '%"></i></span>' +
        '<p class="hm-src">' + desc + '</p>' +
      '</div>';
    };
    grid.innerHTML =
      metric('信誉贡献', h.parts.credit, HONOR_CAP.credit, '信誉分 ' + h.creditScore + ' / 100') +
      metric('交付数量', h.parts.done, HONOR_CAP.done, '已完成交付 ' + h.doneCount + ' 笔') +
      metric('验收质量', h.parts.rate, HONOR_CAP.rate, s && s.count ? '综合均星 ' + fmtNum(s.avg) + '（' + s.count + ' 次评价）' : '暂无验收评价') +
      metric('实得积分', h.parts.earn, HONOR_CAP.earn, '累计实得 ' + h.earn + ' 积分');
  }

  function honorBlock(title, source, items) {
    return '<div class="hd-block">' +
      '<h5>' + title + '</h5>' +
      '<p class="hd-src">' + source + '</p>' +
      (items ? '<ul class="hd-list">' + items + '</ul>' : '') +
    '</div>';
  }

  // “查看荣誉绑定记录”：把每一维分值背后的真实流水逐条摊开
  function openHonorDetail() {
    const h = computeHonor();
    const logs = AppStore.getCreditHistory();
    const reviews = AppStore.getReviews();
    const li = h.levelIdx + 1;

    const creditItems = logs.slice(0, 10).map(function (r) {
      return '<li><b class="' + (r.delta > 0 ? 'ok' : 'bad') + '">' + (r.delta > 0 ? '+' : '') + r.delta + '</b>' +
        escHtml(r.text) + '<u>' + escHtml(r.time) + '</u></li>';
    }).join('');

    const doneItems = h.done.slice(0, 12).map(function (t) {
      const g = AppStore.calcTaskReward(t.reward).gain;
      return '<li><b class="ok">实得 +' + g + '</b>' + escHtml(t.title) + '（悬赏 ' + t.reward + '）<u>' + escHtml(t.createTime) + '</u></li>';
    }).join('');

    const reviewItems = reviews.slice(0, 12).map(function (r) {
      const canceled = r.appealStatus === 'upheld';
      return '<li><b class="' + (r.delta < 0 && !canceled ? 'bad' : 'ok') + '">' + (r.delta > 0 ? '+' : '') + r.delta + '</b>' +
        '《' + escHtml(r.taskTitle) + '》均星 ' + r.avg + '（完成度 ' + r.completion + ' · 态度 ' + r.attitude + '）' +
        (canceled ? '<em class="hd-muted">评审已撤销</em>' : '') +
        '<u>' + escHtml(r.time) + '</u></li>';
    }).join('');

    const sum = h.sum;
    const html =
      '<div class="honor-detail">' +
        '<div class="hd-levels">' +
          HONOR_LEVELS.map(function (lv, i) {
            return '<span class="hd-lv' + (i === li - 1 ? ' cur h' + li : '') + '">' +
              '<i>' + lv.mark + '</i><b>' + lv.name + '</b><u>' + lv.need + ' 点起</u></span>';
          }).join('') +
        '</div>' +
        '<div class="hd-cur"><b>当前志愿称号：' + h.level.name + '</b>' +
          '<span>荣誉值 ' + h.honor + ' / 100' + (h.next ? ' · 距「' + h.next.name + '」还差 ' + (h.next.need - h.honor) + ' 点' : ' · 已登顶') + '</span></div>' +
        honorBlock('① 信誉贡献　+' + h.parts.credit + ' / ' + HONOR_CAP.credit,
          '当前信誉分 ' + h.creditScore + ' / 100，贡献点 = 信誉分 / 100 × ' + HONOR_CAP.credit,
          creditItems || '<li class="muted">暂无信誉变动——认真完成一单、收获好评后，这里会留下第一笔记录</li>') +
        honorBlock('② 交付数量　+' + h.parts.done + ' / ' + HONOR_CAP.done,
          '已完成交付 ' + h.doneCount + ' 笔（1 笔 +4 · 3 笔 +8 · 7 笔 +15 · 12 笔 +19 · 20 笔封顶 +22）',
          doneItems || '<li class="muted">还没有交付记录</li>') +
        honorBlock('③ 验收质量　+' + h.parts.rate + ' / ' + HONOR_CAP.rate,
          sum && sum.count
            ? '有效评价 ' + sum.count + ' 笔 · 综合均星 ' + fmtNum(sum.avg) + '，质量点 = 均星 / 5 × ' + HONOR_CAP.rate + '（被评审撤销的差评不计入）'
            : '暂无有效验收评价，交付后由发布者打星即可积累',
          reviewItems || '<li class="muted">暂无验收评价</li>') +
        honorBlock('④ 累计实得积分　+' + h.parts.earn + ' / ' + HONOR_CAP.earn,
          '累计实得 ' + h.earn + ' 积分（25 分 +10 · 70 分 +16 · 150 分 +22 · 200 分封顶 +24），明细见②每笔「实得」',
          '') +
      '</div>';
    UI.modal({ title: '志愿荣誉 · 绑定记录', html: html, showCancel: false, confirmText: '知道了', align: 'left' });
  }

  /* ===================== 申诉 & 大众评审团 ===================== */
  // 差评卡片上的“去申诉”：打开申诉面板，陈述理由后提交到大众评审团
  let appealMaskEl = null;
  let appealTaskId = null;

  function buildAppealMask() {
    const m = document.createElement('div');
    m.className = 'modal-mask appeal-mask';
    m.innerHTML =
      '<div class="appeal-panel">' +
        '<button class="modal-x" type="button" aria-label="关闭">&times;</button>' +
        '<div class="ap-title">申诉差评 · 请求大众评审</div>' +
        '<div class="ap-task"></div>' +
        '<div class="ap-verdict"></div>' +
        '<textarea class="ap-reason" maxlength="200" rows="4" placeholder="请说明你的申诉理由，例如：任务其实完成得很好，对方因私人原因给了低分……"></textarea>' +
        '<div class="ap-tip">提交后该案件将进入「大众评审团」，全社区公开投票：支持申诉一方满 3 票且领先至少 2 票，即撤销差评并恢复你的信誉分。每笔任务限申诉一次。</div>' +
        '<div class="modal-btns">' +
          '<button type="button" class="modal-btn cancel">暂不申诉</button>' +
          '<button type="button" class="modal-btn submit">提交申诉</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(m);

    m.addEventListener('click', function (e) {
      if (e.target === m) closeAppeal(null);
    });
    m.querySelector('.modal-x').addEventListener('click', function () { closeAppeal(null); });
    m.querySelector('.modal-btns .cancel').addEventListener('click', function () { closeAppeal(null); });
    m.querySelector('.modal-btns .submit').addEventListener('click', function () {
      const reason = m.querySelector('.ap-reason').value.trim();
      if (!reason) { UI.toast('请先填写申诉理由'); return; }
      closeAppeal(reason);
    });
    return m;
  }

  function showAppealMask(info) {
    if (!appealMaskEl) appealMaskEl = buildAppealMask();
    const m = appealMaskEl;
    m.querySelector('.ap-reason').value = '';
    const task = m.querySelector('.ap-task');
    if (task) {
      task.innerHTML =
        '<span class="ap-tk">《' + escHtml(info.title) + '》</span>' +
        '<span class="ap-td">' + escHtml(info.desc || '') + '</span>' +
        '<span class="ap-tw">悬赏 ' + info.reward + ' 积分 · 交付于 ' + escHtml(info.time) + '</span>';
    }
    const vd = m.querySelector('.ap-verdict');
    if (vd) {
      vd.innerHTML =
        '<span class="ap-vt">你收到的验收</span>' +
        '<div class="ap-stars">' +
          '<span class="s-base" aria-hidden="true">★★★★★</span>' +
          '<span class="s-fill" style="width:' + (info.avg / 5 * 100) + '%" aria-hidden="true">★★★★★</span>' +
        '</div>' +
        '<span class="ap-rate">完成度 ' + info.completion + '★ · 态度 ' + info.attitude + '★ · 均星 ' + info.avg + '</span>' +
        (info.comment ? '<span class="ap-cm">评语：「' + escHtml(info.comment) + '」</span>' : '') +
        '<span class="ap-punish">本次差评扣除信誉 <b>' + info.delta + '</b> 分</span>';
    }
    m.classList.add('show');
  }

  function closeAppeal(reason) {
    if (!appealMaskEl) return;
    const id = appealTaskId;
    appealTaskId = null;
    appealMaskEl.classList.remove('show');
    if (reason && id) doSubmitAppeal(id, reason);
  }

  function doSubmitAppeal(taskId, reason) {
    const r = AppStore.submitAppeal({ taskId: taskId, reason: reason });
    if (!r.ok) { UI.toast(r.msg); return; }
    renderMe();
    renderBoard();
    UI.toast('申诉已提交，等待大众评审', 'success');
    setTimeout(function () { nav('jury'); }, 420);
  }

  function openAppeal(taskId) {
    const tasks = AppStore.getTasks();
    const t = tasks.find(function (x) { return x.id === taskId; });
    const rv = t ? AppStore.getReviewByTask(t.id) : null;
    if (!t || !rv || t.status !== 'done') { UI.toast('该任务暂不支持申诉'); return; }
    if (rv.delta >= 0) { UI.toast('本次验收未扣信誉，无需申诉'); return; }
    if (AppStore.getAppealByTaskId(taskId)) {
      UI.toast('该任务已提交申诉，请前往大众评审团查看');
      nav('jury');
      return;
    }
    appealTaskId = taskId;
    showAppealMask({
      title: t.title,
      desc: t.desc,
      reward: t.reward,
      time: rv.time,
      avg: rv.avg,
      completion: rv.completion,
      attitude: rv.attitude,
      comment: rv.comment,
      delta: rv.delta
    });
  }

  // 一桩申诉的卡片 HTML
  function juryCardHtml(a) {
    const c = AppStore.countAppealVotes(a);
    const total = c.support + c.reject;
    const voting = a.status === 'voting';
    const per = function (x) { return total ? Math.round(x / total * 100) : 0; };

    let stateTag = '';
    if (voting) stateTag = '<span class="jv-tag voting">评审中</span>';
    else if (a.status === 'upheld') stateTag = '<span class="jv-tag ok">申诉成立</span>';
    else stateTag = '<span class="jv-tag no">维持差评</span>';

    let body = '';
    if (voting) {
      let hint = '双方未达裁决条件';
      if (Math.max(c.support, c.reject) >= 3 && Math.abs(c.support - c.reject) < 2) {
        hint = '高票方仅领先 1 票，再得 1 票即结案';
      } else if (Math.max(c.support, c.reject) < 3) {
        hint = '任一方再得 ' + (3 - Math.max(c.support, c.reject)) + ' 票且领先 2 票即结案';
      }
      body =
        '<div class="jv-ballot">' +
          '<div class="jb-votes">' +
            '<div class="jb-side support"><b>' + c.support + '</b><i>支持申诉</i></div>' +
            '<div class="jb-side reject"><b>' + c.reject + '</b><i>维持差评</i></div>' +
          '</div>' +
          '<div class="jb-bar">' +
            '<span class="jb-fill support" style="width:' + per(c.support) + '%"></span>' +
            '<span class="jb-fill reject" style="width:' + per(c.reject) + '%"></span>' +
          '</div>' +
          '<div class="jb-hint">' + hint + '</div>' +
          '<div class="jb-btns">' +
            '<button type="button" class="vote-btn support" data-vote="' + a.id + '" data-side="support">&#10003; 支持申诉 · 撤销差评</button>' +
            '<button type="button" class="vote-btn reject" data-vote="' + a.id + '" data-side="reject">维持差评</button>' +
          '</div>' +
        '</div>';
    } else if (a.status === 'upheld') {
      body =
        '<div class="jv-verdict ok">' +
          '<span class="jv-vi">&#10003;</span>' +
          '<span class="jv-vt"><b>大众裁定：申诉成立</b>该差评已撤销，扣除的 ' + (-a.review.delta) + ' 信誉分已恢复。</span>' +
          '<span class="jv-vm">支持 ' + c.support + ' 票 · 维持 ' + c.reject + ' 票 · 结案于 ' + escHtml(a.closed) + '</span>' +
        '</div>';
    } else {
      body =
        '<div class="jv-verdict no">' +
          '<span class="jv-vi">&#10005;</span>' +
          '<span class="jv-vt"><b>大众裁定：维持原差评</b>本次申诉未获支持，原差评与信誉扣除保持不变。</span>' +
          '<span class="jv-vm">支持 ' + c.support + ' 票 · 维持 ' + c.reject + ' 票 · 结案于 ' + escHtml(a.closed) + '</span>' +
        '</div>';
    }

    return '<article class="jury-card ' + a.status + '">' +
      '<div class="jc-head">' +
        '<span class="jc-tt">申诉案件 · 任务《' + escHtml(a.taskTitle) + '》</span>' +
        stateTag +
      '</div>' +
      '<div class="jc-meta">' +
        '<span class="jc-diff">原差评扣 <b>' + a.review.delta + '</b></span>' +
        '<span class="jc-star">&#9733; ' + a.review.avg + ' 均星（完成度 ' + a.review.completion + ' / 态度 ' + a.review.attitude + '）</span>' +
        '<span class="jc-cm">评语：' + escHtml(a.review.comment || '无') + '</span>' +
      '</div>' +
      '<div class="jc-reason">' +
        '<span class="jc-rl">申诉陈述</span>' +
        '<p class="jc-rt">' + escHtml(a.reason) + '</p>' +
      '</div>' +
      body +
      '<div class="jc-foot"><span class="jc-time">' + escHtml(a.created) + ' 立案' + (a.closed ? ' · ' + escHtml(a.closed) + ' 结案' : '') + '</span></div>' +
    '</article>';
  }

  function renderJury() {
    const list = AppStore.getAppeals().sort(function (x, y) {
      if (x.status === 'voting' && y.status !== 'voting') return -1;
      if (y.status === 'voting' && x.status !== 'voting') return 1;
      return 0;
    });
    const grid = $('juryList');
    const emptyEl = $('juryEmpty');
    if (!list.length) {
      grid.innerHTML = '';
      if (emptyEl) emptyEl.hidden = false;
      return;
    }
    if (emptyEl) emptyEl.hidden = true;
    grid.innerHTML = list.map(juryCardHtml).join('');
  }

  function doVote(appealId, side) {
    const r = AppStore.voteAppeal(appealId, side);
    if (!r.ok) { UI.toast(r.msg); return; }
    if (r.decided) {
      if (r.result === 'upheld') {
        UI.toast('评审达成共识：申诉成立，差评撤销、信誉已恢复', 'success');
      } else {
        UI.toast('评审达成共识：维持原差评');
      }
    } else {
      UI.toast('你的投票已计入（支持 ' + r.support + ' : 维持 ' + r.reject + '）');
    }
    renderJury();
    renderBoard();
    renderMe();
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
        content: '将信誉恢复为初始的 100，并清空信誉记录、历史评分与全部申诉案件，确定吗？',
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
          '每次任务交付后，发布者对交付者按两个维度打整星（每维 1~5 颗星）：\n' +
          '· 完成度：任务是否保质保量、结果是否到位\n' +
          '· 服务态度：沟通配合、守时与礼貌程度\n\n' +
          '二、换算规则（单次）\n' +
          '两维平均得"本次均星"，以 3 星为公平基准：均星每高 1 星信誉 +4，每低 1 星信誉 -4，均星含半星时按 ±2 折算。\n' +
          '速查：两维都打 5★→+5 · 4★→+4 · 3★→0 · 2★→-4 · 1★→-5\n\n' +
          '三、公平保护\n' +
          '1. 单次封顶：一次评价最多 +5、最多 -5，防止信誉暴涨暴跌，让评分回归真实；\n' +
          '2. 一次一评：每笔任务只能验收一次，交付即评，没有补分空间；\n' +
          '3. 长期累计：信誉来自多笔交付的综合，零星高分无法维持，杜绝刷分。\n\n' +
          '四、等级影响（满分 100）\n' +
          '· 90-100 邻里之星\n· 75-89 靠谱好邻居\n· 60-74 信用一般\n· 60 以下 待改进\n\n' +
          '分数长期低于 60 的邻里将被标注为"待改进"，影响后续接单机会。\n\n' +
          '五、申诉救济（大众评审团）\n' +
          '如果你认为某次验收评分不公（例如被恶意差评），可前往「我的 → 我的任务」，找到该笔任务点击「去申诉」发起申诉，陈述理由后案件进入大众评审团。\n' +
          '评审团面向全社区公开：支持申诉 / 维持差评任一方先满 3 票且领先至少 2 票即自动结案。申诉成立 → 撤销该笔差评、恢复信誉；申诉失败 → 维持原判。每笔任务限申诉一次。\n\n' +
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
    if (name === 'jury') renderJury();

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
      if (db) { deliverTask(db.dataset.id); return; }

      const apb = e.target.closest ? e.target.closest('.appeal-btn') : null;
      if (apb) { openAppeal(apb.dataset.appeal); return; }

      const vb = e.target.closest ? e.target.closest('.vote-btn') : null;
      if (vb) { doVote(vb.dataset.vote, vb.dataset.side); return; }
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

    // 志愿荣誉：查看绑定记录
    const hdBtn = $('btnHonorDetail');
    if (hdBtn) hdBtn.addEventListener('click', openHonorDetail);
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
