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
      // 已完成：卡片上展示验收星级摘要；申诉与评分明细收在展开详情里
      const rv = AppStore.getReviewByTask(t.id);
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
      action = '<span class="done-actions">' + stateTxt + '</span>';
    } else {
      action = '<span class="done-tag">待接取</span>';
    }
    const hIdx = Math.min(4, Math.max(0, Number(t.pubHonorIdx) || 0));
    const prio = hIdx >= 2
      ? '<span class="tc-prio h' + (hIdx + 1) + '"><i>&#9733;</i> 荣誉头衔「' + escHtml(t.pubHonorName || HONOR_LEVELS[hIdx].name) + '」发布 · 志愿特权优先曝光</span>'
      : '';
    return '<article class="task-card st-' + st.cls + '" data-task="' + t.id + '">' +
      '<div class="tc-head">' +
        '<span class="tc-time">' + escHtml(t.createTime) + '</span>' +
        '<span class="tc-head-right">' +
          '<span class="tc-state ' + st.cls + '">' + st.txt + '</span>' +
          '<span class="tc-more" aria-hidden="true">&#9662;</span>' +
        '</span>' +
      '</div>' +
      prio +
      '<h3 class="tc-title">' + escHtml(t.title) + '</h3>' +
      '<p class="tc-desc">' + escHtml(t.desc) + '</p>' +
      '<div class="tc-foot">' +
        '<span class="tc-reward">悬赏 <b>+' + t.reward + ' 积分</b></span>' +
        action +
      '</div>' +
      taskDetailHtml(t, showAppeal) +
    '</article>';
  }

  // 任务卡展开详情：集中呈现追加悬赏、验收评分、申诉入口与评审进展
  function taskDetailHtml(t, showAppeal) {
    const html = [];
    if (t.status === 'pending') {
      html.push(
        '<div class="td-line"><span class="td-k">等待接取</span>' +
        '<span class="td-v">悬赏总额 <b class="td-hot">+' + t.reward + '</b> 积分，任务发布即已从你的积分中扣减。</span></div>'
      );
      if (Array.isArray(t.rewardLog) && t.rewardLog.length) {
        const items = t.rewardLog.slice(-5).map(function (r) {
          return '<li><b>+' + r.add + '</b> 积分 · 当前总额 +' + r.total + ' · ' + escHtml(r.time) + '</li>';
        }).join('');
        html.push(
          '<div class="td-sec"><span class="td-sec-t">追加悬赏记录</span>' +
          '<ul class="td-log">' + items + '</ul></div>'
        );
      }
      html.push(
        '<div class="td-acts">' +
          '<button type="button" class="td-btn bounty" data-bounty="' + t.id + '">＋ 追加积分悬赏</button>' +
          '<span class="td-tip">迟迟没人接单？追加积分悬赏，让任务更容易被邻里看见。</span>' +
        '</div>'
      );
    } else if (t.status === 'doing') {
      html.push(
        '<div class="td-sec">' +
          '<span class="td-sec-t">进行中</span>' +
          '<p class="td-para">任务已被接取，正在执行中。交付完成后，发布者将按「完成度 + 服务态度」为接单者打星验收（1~5 整星），星级公平换算为信誉分；若接单者收到不公正差评，可在「我的 → 我的任务」中找到该任务发起申诉。</p>' +
        '</div>'
      );
    } else if (t.status === 'done') {
      const rv = AppStore.getReviewByTask(t.id);
      const ap = rv ? AppStore.getAppealByTaskId(t.id) : null;
      if (rv) {
        const upheld = rv.appealStatus === 'upheld';
        html.push(
          '<div class="td-sec td-rate">' +
            '<span class="td-sec-t">验收评分</span>' +
            '<div class="td-stars">' +
              '<span class="s-base" aria-hidden="true">★★★★★</span>' +
              '<span class="s-fill" style="width:' + (rv.avg / 5 * 100) + '%" aria-hidden="true">★★★★★</span>' +
            '</div>' +
            '<p class="td-rv">完成度 ' + rv.completion + '★ · 服务态度 ' + rv.attitude + '★ · 均星 ' + rv.avg +
              (upheld ? ' · <em class="td-cancelled">该差评经评审撤销</em>' : '') + '</p>' +
            (rv.comment ? '<p class="td-cm">评语：「' + escHtml(rv.comment) + '」</p>' : '') +
          '</div>'
        );
        if (rv.delta < 0 && !upheld) {
          if (!ap) {
            // 被差评且尚未申诉：在我的任务中提供申诉入口
            if (showAppeal) {
              html.push(
                '<div class="td-acts">' +
                  '<button type="button" class="appeal-btn" data-appeal="' + t.id + '">&#9878; 不服差评 · 去申诉</button>' +
                  '<span class="td-tip">认为这次验收不公平？可提交大众评审团，由全社区公开投票裁决。</span>' +
                '</div>'
              );
            }
          } else if (ap.status === 'voting') {
            html.push('<div class="td-status voting">&#9878; 已提交申诉 · 大众评审中，等待社区投票裁决。</div>');
          } else if (ap.status === 'rejected') {
            html.push('<div class="td-status no">申诉未获支持，大众评审裁定维持原差评。</div>');
          }
        } else if (rv.delta >= 0) {
          html.push('<p class="td-good">&#10003; 本次验收为好评，信誉' + (rv.delta > 0 ? ' +' + rv.delta : ' 无变动') + '，已记入信誉档案。</p>');
        }
        if (ap) {
          html.push('<div class="td-acts"><button type="button" class="td-btn" data-goto="jury">查看大众评审进展</button></div>');
        }
      } else {
        html.push('<p class="td-para">该任务已完成，暂无验收评分记录。</p>');
      }
    }
    return '<div class="task-detail">' + html.join('') + '</div>';
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

    // 志愿等级特权：发布者荣誉越高的任务，曝光越靠前（等级快照写入发布瞬间）；同级保持发布先后，最新在前
    shown.sort(function (a, b) {
      const ha = Math.min(4, Math.max(0, Number(a.pubHonorIdx) || 0));
      const hb = Math.min(4, Math.max(0, Number(b.pubHonorIdx) || 0));
      return hb - ha;
    });

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

      // 志愿等级特权：发布瞬间快照当前志愿称号并写入任务，广场将据此给任务更优先的曝光
      const honorNow = computeHonor();
      const task = {
        id: String(Date.now()),
        title: title,
        desc: desc,
        reward: rewardNum,
        status: 'pending',
        createTime: new Date().toLocaleString(),
        pubHonorIdx: honorNow.levelIdx,
        pubHonorName: honorNow.level.name
      };
      const tasks = AppStore.getTasks();
      tasks.unshift(task);
      AppStore.saveTasks(tasks);

      UI.hideLoading();
      syncPoints();
      UI.toast(honorNow.levelIdx >= 2 ? '发布成功 · 志愿荣誉特权，任务优先曝光' : '发布成功', 'success');
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
    renderAccountUI();
    const tasks = AppStore.getTasks();
    $('mePub').textContent = tasks.length;
    $('meDone').textContent = tasks.filter(function (t) { return t.status === 'done'; }).length;
    renderCredit();
    renderRatingSummary();
    renderHonor();
    renderList($('meTaskGrid'), tasks.slice(0, 12), $('meEmpty'), true, true);
  }

  /* ===================== 账户登记（手机号绑定）与隐私 ===================== */
  // 隐私设计：
  // 1. 最小收集——仅昵称（选填）+ 手机号；
  // 2. 验证即弃——完整手机号只在本机做一次「格式 + 验证码」校验，通过后立即丢弃，
  //    数据层只接收脱敏后的 masked（如 138****5678），localStorage 中绝无明文；
  // 3. 脱敏展示——所有界面一律只显示打码号码；
  // 4. 同意留痕——须勾选《邻里隐私保护说明》方可登记，并记录同意时间；
  // 5. 用户自控——设置页提供查看 / 解绑 / 注销清空入口。
  const PHONE_RE = /^1[3-9]\d{9}$/; // 中国大陆手机号

  function maskPhone(p) { return p ? p.slice(0, 3) + '****' + p.slice(7) : ''; }
  function tailOf(p) { return p ? p.slice(-4) : ''; }

  const PRIVACY_TEXT =
    '邻帮帮 · 邻里隐私保护说明\n\n' +
    '我们以「最少收集、本地留存、验证即弃」为原则处理你的个人信息：\n\n' +
    '一、我们收集什么\n' +
    '仅收集你主动填写的两项：\n' +
    '· 昵称（选填）：用于社区内的称呼与头像首字；\n' +
    '· 手机号码：作为本账户的绑定凭证。\n\n' +
    '二、手机号怎么保护\n' +
    '1. 完整号码只在本机做一次性校验（格式 + 短信验证码），通过后立即丢弃；\n' +
    '2. 本地仅保存「脱敏号码」（例如 138****5678）与登记时间，用于向你展示绑定状态；\n' +
    '3. 页面中的号码展示均自动打码，不会向任何邻里泄露你的完整号码。\n\n' +
    '三、数据存在哪里\n' +
    '本页面全部数据仅保存在你自己的浏览器（localStorage）中：不上传服务器、不与他人共享、也不与微信小程序互通。清除浏览器数据即全部删除。\n\n' +
    '四、你的权利\n' +
    '可随时到「设置 → 账户与隐私」：\n' +
    '· 查看已登记的脱敏信息与同意留痕；\n' +
    '· 解绑登记（保留积分 / 任务 / 信誉等邻里数据）；\n' +
    '· 注销并清空本浏览器内邻帮帮的全部数据。\n\n' +
    '五、演示说明\n' +
    '当前为演示环境：验证码由系统模拟生成，不会发送真实短信；正式环境将由短信服务商下发验证码，本页承诺同样不落盘完整号码。';

  function openPrivacy() {
    UI.modal({
      title: '邻里隐私保护说明',
      content: PRIVACY_TEXT,
      showCancel: false,
      confirmText: '知道了',
      align: 'left'
    });
  }

  // 账户登记弹窗（复用 modal-mask 遮罩体系，独立面板以承载表单）
  let regMaskEl = null;
  let regCode = null;        // 内存中的验证码 { phone, code }，绝不下沉到 localStorage
  let regCodeTimer = null;

  function buildRegisterMask() {
    const m = document.createElement('div');
    m.className = 'modal-mask reg-mask';
    m.innerHTML =
      '<div class="reg-panel">' +
        '<button class="modal-x" type="button" aria-label="关闭">&times;</button>' +
        '<div class="reg-head">' +
          '<div class="reg-ic">&#128272;</div>' +
          '<div class="reg-title">手机号登记注册</div>' +
          '<div class="reg-sub">绑定手机号，为你在社区的每一份善举建立可追溯的邻里身份。</div>' +
        '</div>' +
        '<div class="reg-note">&#128274; 隐私承诺：我们仅收集<b>昵称</b>与<b>手机号</b>；完整号码只在本机做一次校验，<b>校验后立即丢弃</b>，本地仅留存脱敏号码。</div>' +
        '<div class="reg-field">' +
          '<label class="reg-label" for="regNick">昵称<span class="need">选填 · 默认「邻友+尾号」</span></label>' +
          '<input class="input" id="regNick" type="text" maxlength="12" placeholder="例如：热心老王">' +
        '</div>' +
        '<div class="reg-field">' +
          '<label class="reg-label" for="regPhone">手机号码<span class="need">用于绑定账户</span></label>' +
          '<div class="reg-code-row">' +
            '<input class="input reg-phone-input" id="regPhone" type="tel" maxlength="11" inputmode="numeric" placeholder="请输入 11 位手机号">' +
            '<button type="button" class="reg-send" id="regSend">获取验证码</button>' +
          '</div>' +
        '</div>' +
        '<div class="reg-field">' +
          '<label class="reg-label" for="regCode">短信验证码<span class="need">6 位数字</span></label>' +
          '<input class="input" id="regCode" type="tel" maxlength="6" inputmode="numeric" placeholder="请输入 6 位验证码">' +
        '</div>' +
        '<div class="reg-agree">' +
          '<input type="checkbox" id="regAgree">' +
          '<p class="reg-agree-tx">我已阅读并同意 <button type="button" class="reg-link" data-reg="policy">《邻里隐私保护说明》</button>，并理解平台仅在本地保存脱敏信息。</p>' +
        '</div>' +
        '<div class="reg-err" id="regErr"></div>' +
        '<button type="button" class="reg-submit" id="regSubmit">完成登记</button>' +
        '<div class="reg-foot">演示环境：验证码为系统模拟生成，不会发送真实短信；完整手机号不会被保存或上传。</div>' +
      '</div>';
    document.body.appendChild(m);

    function close() {
      m.classList.remove('show');
      resetRegCode();
    }
    m.addEventListener('click', function (e) { if (e.target === m) close(); });
    m.querySelector('.modal-x').addEventListener('click', close);
    m.querySelector('.reg-link').addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      openPrivacy();
    });
    m.querySelector('#regSend').addEventListener('click', sendRegCode);
    m.querySelector('#regPhone').addEventListener('input', function () {
      this.value = this.value.replace(/\D/g, '').slice(0, 11);
    });
    m.querySelector('#regCode').addEventListener('input', function () {
      this.value = this.value.replace(/\D/g, '').slice(0, 6);
    });
    m.querySelector('#regSubmit').addEventListener('click', submitRegister);
    // 点协议整行 = 切换勾选（按钮与复选框自身除外）
    m.querySelector('.reg-agree').addEventListener('click', function (e) {
      const tag = e.target.tagName;
      if (tag !== 'BUTTON' && e.target.id !== 'regAgree') {
        const cb = m.querySelector('#regAgree');
        cb.checked = !cb.checked;
      }
    });
    return m;
  }

  // 获取验证码：校验手机号格式 → 生成演示码（仅存内存）→ 30 秒倒计时
  function sendRegCode() {
    if (!regMaskEl || regCodeTimer) return;
    const m = regMaskEl;
    const phone = m.querySelector('#regPhone').value.trim();
    const err = m.querySelector('#regErr');
    if (!PHONE_RE.test(phone)) {
      err.textContent = '请输入正确的 11 位手机号（1 开头、第二位为 3-9）';
      return;
    }
    err.textContent = '';
    const code = String(Math.floor(100000 + Math.random() * 900000));
    regCode = { phone: phone, code: code };
    UI.toast('演示验证码：' + code + '（30 秒内有效）');
    const btn = m.querySelector('#regSend');
    let left = 30;
    btn.disabled = true;
    btn.textContent = '重新获取(' + left + 's)';
    regCodeTimer = setInterval(function () {
      left -= 1;
      if (left <= 0) {
        resetRegCode();
        return;
      }
      btn.textContent = '重新获取(' + left + 's)';
    }, 1000);
  }

  function resetRegCode() {
    if (regCodeTimer) { clearInterval(regCodeTimer); regCodeTimer = null; }
    regCode = null;
    if (regMaskEl) {
      const btn = regMaskEl.querySelector('#regSend');
      if (btn) { btn.disabled = false; btn.textContent = '获取验证码'; }
    }
  }

  // 提交登记：全部校验通过后，完整号码就此“功成身退”，仅把脱敏串交给数据层留存
  function submitRegister() {
    if (state.acting || !regMaskEl) return;
    const m = regMaskEl;
    const err = m.querySelector('#regErr');
    const phone = m.querySelector('#regPhone').value.trim();
    const code = m.querySelector('#regCode').value.trim();
    const nick = m.querySelector('#regNick').value.trim();
    const agree = m.querySelector('#regAgree').checked;
    if (!PHONE_RE.test(phone)) { err.textContent = '手机号格式不正确，请检查后重试'; return; }
    if (!regCode || regCode.phone !== phone) { err.textContent = '请先获取该手机号的验证码'; return; }
    if (code !== regCode.code) { err.textContent = '验证码不正确或已失效，请重新获取'; return; }
    if (!agree) { err.textContent = '请先阅读并勾选同意《邻里隐私保护说明》'; return; }

    state.acting = true;
    const btn = m.querySelector('#regSubmit');
    if (btn) btn.disabled = true;
    err.textContent = '';
    setTimeout(function () {
      const r = AppStore.registerAccount({
        nickname: nick || ('邻友' + tailOf(phone)),
        masked: maskPhone(phone)
      });
      state.acting = false;
      if (btn) btn.disabled = false;
      if (!r.ok) { err.textContent = r.msg; return; }
      m.classList.remove('show');
      resetRegCode();
      renderAccountUI();
      UI.toast('登记成功，号码已脱敏保护', 'success');
    }, 350);
  }

  function showRegisterMask() {
    if (AppStore.getAccount()) { openAccountInfo(); return; }
    if (!regMaskEl) regMaskEl = buildRegisterMask();
    const m = regMaskEl;
    m.querySelector('#regNick').value = '';
    m.querySelector('#regPhone').value = '';
    m.querySelector('#regCode').value = '';
    m.querySelector('#regAgree').checked = false;
    m.querySelector('#regErr').textContent = '';
    resetRegCode();
    m.classList.add('show');
    setTimeout(function () {
      const n = m.querySelector('#regPhone');
      if (n) n.focus();
    }, 80);
  }

  // 顶栏账户入口与「我的」页登记引导的统一分发
  function onAcct(what) {
    if (AppStore.getAccount()) openAccountInfo();
    else showRegisterMask();
  }

  // 登记后账户信息（脱敏展示 + 同意留痕）
  function openAccountInfo() {
    const acct = AppStore.getAccount();
    if (!acct) { showRegisterMask(); return; }
    UI.choice({
      title: '账户与隐私',
      html:
        '<div class="acc-card">' +
          '<div class="acc-row"><span class="k">昵称</span><span class="v">' + escHtml(acct.nickname) + '</span></div>' +
          '<div class="acc-row"><span class="k">登记手机号</span><span class="v acc-masked">' + escHtml(acct.masked) + '</span></div>' +
          '<div class="acc-row"><span class="k">登记时间</span><span class="v">' + escHtml(acct.boundAt) + '</span></div>' +
          '<div class="acc-row"><span class="k">同意隐私说明</span><span class="v">' + escHtml(acct.consentAt || acct.boundAt) + '</span></div>' +
          '<div class="acc-sec">你的完整手机号从未被保存：登记时仅做一次性校验即丢弃，本机只留存以上脱敏信息，用于展示绑定状态。</div>' +
        '</div>',
      buttons: [
        { text: '查看隐私说明', value: 'policy' },
        { text: '解绑登记', cls: 'danger', value: 'unbind' },
        { text: '关闭', value: false }
      ],
      colButtons: true
    }).then(function (act) {
      if (act === 'policy') openPrivacy();
      else if (act === 'unbind') doUnbindAccount();
    });
  }

  async function doUnbindAccount() {
    if (state.acting) return;
    const ok = await UI.confirm({
      title: '解绑手机号登记',
      content: '解除手机号与账户的绑定？你的积分、任务与信誉等邻里数据会全部保留，只是不再展示登记身份。',
      confirmText: '解绑'
    });
    if (!ok) return;
    state.acting = true;
    UI.showLoading('正在解绑...');
    setTimeout(function () {
      AppStore.unbindAccount();
      UI.hideLoading();
      state.acting = false;
      renderAccountUI();
      UI.toast('已解绑登记', 'success');
    }, 300);
  }

  async function doWipeLocal() {
    if (state.acting) return;
    const ok = await UI.confirm({
      title: '注销并清空本机数据',
      content: '将删除本浏览器内邻帮帮的全部记录：账户登记、积分、任务、信誉、历史评分与申诉案件，且不可恢复。确定继续吗？',
      confirmText: '全部清空'
    });
    if (!ok) return;
    const sure = await UI.confirm({
      title: '最后确认',
      content: '此操作无法撤销。真的要注销并清空一切吗？',
      confirmText: '确认注销',
      cancelText: '再想想'
    });
    if (!sure) return;
    state.acting = true;
    UI.showLoading('正在注销并清空...');
    setTimeout(function () {
      AppStore.wipeLocalData();
      UI.hideLoading();
      state.acting = false;
      syncPoints();
      renderAccountUI();
      renderBoard();
      renderMe();
      renderJury();
      UI.toast('已注销并清空本机数据', 'success');
      nav('home');
    }, 400);
  }

  // 把登记状态同步到顶栏、我的页与设置页（三处入口共用一份状态）
  function renderAccountUI() {
    const acct = AppStore.getAccount();
    const apV = $('apTopValue');
    if (apV) {
      apV.textContent = acct ? acct.masked : '未登记';
      apV.classList.toggle('guest', !acct);
    }
    const pfName = $('pfName');
    const ava = $('meAvatar');
    if (acct) {
      if (pfName) pfName.textContent = acct.nickname;
      if (ava) ava.textContent = (acct.nickname || '邻').slice(0, 1);
    } else {
      if (pfName) pfName.textContent = '邻帮帮用户';
      if (ava) ava.textContent = '邻';
    }
    const pfAcc = $('pfAccount');
    if (pfAcc) {
      pfAcc.innerHTML = acct
        ? '<span class="acc-badge">&#128274; ' + escHtml(acct.masked) + '<i>· 已登记</i></span>' +
          '<span class="acc-bound">' + escHtml(acct.boundAt) + '</span>'
        : '<button type="button" class="acc-reg-btn" data-acct="reg"><i>&#128272;</i> 登记手机号 · 建立邻里身份</button>';
    }
    const sub = $('cellPhoneSub');
    if (sub) {
      sub.textContent = acct
        ? '已登记 ' + acct.masked + ' · 点击查看账户信息'
        : '未登记 · 点击用手机号守护你的社区身份';
    }
    const unbind = $('cellUnbind');
    if (unbind) unbind.hidden = !acct;
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

  /* ===================== 追加积分悬赏 ===================== */
  let bountyMaskEl = null;
  let bountyTaskId = null;
  let bountyBaseReward = 0;

  function buildBountyMask() {
    const m = document.createElement('div');
    m.className = 'modal-mask bounty-mask';
    m.innerHTML =
      '<div class="bounty-panel">' +
        '<button class="modal-x" type="button" aria-label="关闭">&times;</button>' +
        '<div class="bd-title">追加积分悬赏</div>' +
        '<div class="bd-task"></div>' +
        '<div class="bd-balance"></div>' +
        '<div class="bd-input-row">' +
          '<span class="bd-prefix">+</span>' +
          '<input class="bd-input" type="number" min="1" step="1" inputmode="numeric" placeholder="填入追加积分数量">' +
        '</div>' +
        '<div class="bd-chips">' +
          [5, 10, 20, 50].map(function (v) {
            return '<button type="button" class="bd-chip" data-v="' + v + '">+' + v + '</button>';
          }).join('') +
        '</div>' +
        '<div class="bd-total">追加后悬赏总额：<b>--</b> 积分</div>' +
        '<div class="bd-tip">发布任务时已预先扣减悬赏积分；追加的积分将立即从当前积分中扣除，用于提高任务的吸引力。</div>' +
        '<div class="modal-btns">' +
          '<button type="button" class="modal-btn cancel">取消</button>' +
          '<button type="button" class="modal-btn submit">确认追加</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(m);

    function close() { m.classList.remove('show'); bountyTaskId = null; }
    m.addEventListener('click', function (e) { if (e.target === m) close(); });
    m.querySelector('.modal-x').addEventListener('click', close);
    m.querySelector('.modal-btns .cancel').addEventListener('click', close);
    m.querySelector('.modal-btns .submit').addEventListener('click', submitBounty);

    const input = m.querySelector('.bd-input');
    input.addEventListener('input', updateBountyTotal);
    m.querySelectorAll('.bd-chip').forEach(function (ch) {
      ch.addEventListener('click', function () {
        m.querySelectorAll('.bd-chip').forEach(function (c) { c.classList.remove('on'); });
        ch.classList.add('on');
        input.value = ch.dataset.v;
        updateBountyTotal();
      });
    });
    return m;
  }

  function updateBountyTotal() {
    if (!bountyMaskEl) return;
    const m = bountyMaskEl;
    const v = Math.floor(Number(m.querySelector('.bd-input').value) || 0);
    const total = bountyBaseReward + (v > 0 ? v : 0);
    const b = m.querySelector('.bd-total b');
    if (b) b.textContent = total;
  }

  function openBountyModal(taskId) {
    const t = AppStore.getTasks().find(function (x) { return String(x.id) === String(taskId); });
    if (!t || t.status !== 'pending') { UI.toast('该任务当前无法追加悬赏'); return; }
    if (!bountyMaskEl) bountyMaskEl = buildBountyMask();
    const m = bountyMaskEl;
    bountyTaskId = String(taskId);
    bountyBaseReward = Number(t.reward) || 0;
    m.querySelector('.bd-task').innerHTML =
      '任务《' + escHtml(t.title) + '》<span class="bd-cur">当前悬赏 <b>+' + bountyBaseReward + '</b> 积分</span>';
    m.querySelector('.bd-balance').innerHTML = '当前可用积分 <b>' + AppStore.getPoints() + '</b>';
    const input = m.querySelector('.bd-input');
    input.value = '';
    m.querySelectorAll('.bd-chip').forEach(function (c) { c.classList.remove('on'); });
    updateBountyTotal();
    m.classList.add('show');
    setTimeout(function () { input.focus(); }, 80);
  }

  function submitBounty() {
    if (!bountyMaskEl || !bountyTaskId) return;
    const m = bountyMaskEl;
    const v = Math.floor(Number(m.querySelector('.bd-input').value));
    if (!isFinite(v) || v <= 0) { UI.toast('请填写大于 0 的整数积分'); return; }
    if (v > AppStore.getPoints()) { UI.toast('积分不足，追加失败'); return; }
    const id = bountyTaskId;
    const r = AppStore.addBounty(id, v);
    if (!r.ok) { UI.toast(r.msg); return; }
    m.classList.remove('show');
    bountyTaskId = null;
    UI.showLoading('正在追加悬赏...');
    setTimeout(function () {
      UI.hideLoading();
      syncPoints();
      renderBoard();
      renderMe();
      UI.toast('追加成功，悬赏总额 +' + r.reward + ' 积分', 'success');
    }, 260);
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

    if (act === 'phoneReg') {
      showRegisterMask();
    } else if (act === 'privacyPolicy') {
      openPrivacy();
    } else if (act === 'unbindAccount') {
      if (!AppStore.getAccount()) { UI.toast('当前尚未登记手机号'); return; }
      doUnbindAccount();
    } else if (act === 'wipeLocal') {
      doWipeLocal();
    } else if (act === 'resetPts') {
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

      const acct = e.target.closest ? e.target.closest('[data-acct]') : null;
      if (acct) { onAcct(acct.dataset.acct); return; }

      const ab = e.target.closest ? e.target.closest('.accept-btn') : null;
      if (ab) { acceptTask(ab.dataset.id); return; }

      const db = e.target.closest ? e.target.closest('.deliver-btn') : null;
      if (db) { deliverTask(db.dataset.id); return; }

      const apb = e.target.closest ? e.target.closest('.appeal-btn') : null;
      if (apb) { openAppeal(apb.dataset.appeal); return; }

      const vb = e.target.closest ? e.target.closest('.vote-btn') : null;
      if (vb) { doVote(vb.dataset.vote, vb.dataset.side); return; }

      const bnb = e.target.closest ? e.target.closest('.bounty-btn') : null;
      if (bnb) { openBountyModal(bnb.dataset.bounty); return; }

      const gj = e.target.closest ? e.target.closest('[data-goto="jury"]') : null;
      if (gj) { nav('jury'); return; }

      // 点击任务卡任意区域展开/收起详情（按钮与详情内部区域除外）
      const card = e.target.closest ? e.target.closest('.task-card') : null;
      if (card) {
        const interactive = e.target.closest('button, a, input, textarea, select, [data-nav]');
        const insideDetail = e.target.closest('.task-detail');
        if (!interactive && !insideDetail) {
          card.classList.toggle('open');
        }
      }
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
  renderAccountUI(); // 启动即同步顶栏 / 我的 / 设置中的登记状态
  nav('home');
})();
