/* ============================================================
   邻帮帮 · 数据层（对应小程序 app.js）
   积分 + 任务列表，localStorage 持久化
   ============================================================ */
const AppStore = (function () {
  const POINTS_KEY = 'linbangbang_user_points';
  const TASKS_KEY = 'linbangbang_tasks';
  const HEART_POOL_KEY = 'linbangbang_heart_pool'; // 爱心池：任务佣金抽成累积，界面不展示
  const CREDIT_KEY = 'linbangbang_credit'; // 信誉：score 0-100 + 变动记录
  const REVIEWS_KEY = 'linbangbang_reviews'; // 交付评分：发布者对完成度/态度的五星整星评价
  const APPEALS_KEY = 'linbangbang_appeals'; // 申诉案件：被差评方可发起申诉，交由大众评审团公开投票
  const COMMISSION_RATE = 0.2; // 任务佣金抽成比例：20%
  const APPEAL_VOTE_NEED = 3; // 评审团裁决门槛：某一方向票数达到该值
  const mem = { points: null, tasks: null, heartPool: null, credit: null, reviews: null, appeals: null };

  function read(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw === null ? fallback : JSON.parse(raw);
    } catch (e) { return fallback; }
  }

  function write(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) { /* 忽略 */ }
  }

  // 首次启动：积分 100，任务空数组
  function init() {
    let points = read(POINTS_KEY, null);
    if (typeof points !== 'number' || !isFinite(points)) {
      points = 100;
      write(POINTS_KEY, points);
    }
    mem.points = points;

    let tasks = read(TASKS_KEY, null);
    if (!Array.isArray(tasks)) {
      tasks = [];
      write(TASKS_KEY, tasks);
    }
    mem.tasks = tasks;

    // 爱心池初始为 0（不随用户积分重置而清空）
    let heartPool = read(HEART_POOL_KEY, null);
    if (typeof heartPool !== 'number' || !isFinite(heartPool)) {
      heartPool = 0;
      write(HEART_POOL_KEY, heartPool);
    }
    mem.heartPool = heartPool;

    // 信誉分：初始 100（满分 100），保留最近变动记录
    let credit = read(CREDIT_KEY, null);
    if (!credit || typeof credit.score !== 'number' || !isFinite(credit.score) || !Array.isArray(credit.history)) {
      credit = { score: 100, history: [] };
      write(CREDIT_KEY, credit);
    }
    mem.credit = credit;

    // 交付评分记录：旧数据无此 key 时初始化为空数组
    let reviews = read(REVIEWS_KEY, null);
    if (!Array.isArray(reviews)) {
      reviews = [];
      write(REVIEWS_KEY, reviews);
    }
    mem.reviews = reviews;

    // 申诉案件：旧数据无此 key 时初始化为空数组
    let appeals = read(APPEALS_KEY, null);
    if (!Array.isArray(appeals)) {
      appeals = [];
      write(APPEALS_KEY, appeals);
    }
    mem.appeals = appeals;
  }
  init();

  function getPoints() { return mem.points; }

  // 修改积分：余额不足返回 null，否则返回新余额
  function changePoints(delta) {
    const next = mem.points + delta;
    if (next < 0) return null;
    mem.points = next;
    write(POINTS_KEY, next);
    return next;
  }

  function getTasks() { return mem.tasks; }

  function saveTasks(list) {
    mem.tasks = list;
    write(TASKS_KEY, list);
  }

  function resetPoints() {
    mem.points = 100;
    write(POINTS_KEY, 100);
    return mem.points;
  }

  function clearTasks() {
    saveTasks([]);
    mem.appeals = [];
    write(APPEALS_KEY, mem.appeals);
  }

  function getHeartPool() { return mem.heartPool; }

  /* 任务佣金结算：按比例抽取积分注入爱心池，返回接取者实际所得
     - 抽成 = Math.floor(reward * 比例)，向下取整，避免凭空产生积分
     - 接取者实得 = reward - 抽成，余量更友好 */
  function calcTaskReward(reward, rate) {
    const rewardNum = Number(reward) || 0;
    const r = Number(rate) >= 0 && Number(rate) < 1 ? Number(rate) : COMMISSION_RATE;
    const commission = Math.floor(rewardNum * r);
    return { gain: rewardNum - commission, commission: commission };
  }

  // 计算并真正将抽成注入爱心池（仅在接取确认后调用）
  function settleTaskReward(reward, rate) {
    const s = calcTaskReward(reward, rate);
    if (s.commission > 0) {
      mem.heartPool += s.commission;
      write(HEART_POOL_KEY, mem.heartPool);
    }
    return s;
  }

  // 追加积分悬赏：发布者给仍未被接取的任务追加悬赏金额（从当前积分实时扣减）
  function addBounty(taskId, addAmount) {
    const id = String(taskId == null ? '' : taskId);
    const amount = Math.floor(Number(addAmount) || 0);
    if (amount <= 0) return { ok: false, msg: '请填写大于 0 的整数积分' };
    if (amount > mem.points) return { ok: false, msg: '积分不足，无法追加悬赏' };
    const t = mem.tasks.find(function (x) { return String(x.id) === id; });
    if (!t) return { ok: false, msg: '任务不存在或已被移除' };
    if (t.status !== 'pending') return { ok: false, msg: '任务已被接取或已完成，无法追加悬赏' };
    mem.points -= amount;
    write(POINTS_KEY, mem.points);
    t.reward = (Number(t.reward) || 0) + amount;
    if (!Array.isArray(t.rewardLog)) t.rewardLog = [];
    t.rewardLog.push({ add: amount, total: t.reward, time: new Date().toLocaleString() });
    if (t.rewardLog.length > 20) t.rewardLog.length = 20;
    write(TASKS_KEY, mem.tasks);
    return { ok: true, reward: t.reward, points: mem.points };
  }

  /* ===================== 信誉分 ===================== */
  function getCreditScore() { return mem.credit.score; }

  function getCreditHistory() { return mem.credit.history; }

  // 变动信誉：delta 正为加分、负为扣分，分数夹在 0-100；text 为变动说明（记入明细）
  // meta 可选：{ starAvg } 供明细展示本次评分均星
  function changeCredit(delta, text, meta) {
    const d = Math.round(Number(delta) || 0);
    if (!d) return mem.credit.score;
    mem.credit.score = Math.max(0, Math.min(100, mem.credit.score + d));
    if (text) {
      const item = {
        time: new Date().toLocaleString(),
        delta: d,
        text: String(text)
      };
      if (meta && typeof meta.starAvg === 'number') item.starAvg = meta.starAvg;
      mem.credit.history.unshift(item);
      if (mem.credit.history.length > 50) mem.credit.history.length = 50;
    }
    write(CREDIT_KEY, mem.credit);
    return mem.credit.score;
  }

  /* ===================== 交付评分系统 ===================== */
  // 星级取值合法化：只允许整颗星（1~5），历史遗留的 0.5 步进值会吸附到最近整星
  function clampStar(v) {
    if (!isFinite(v)) v = 3;
    return Math.max(1, Math.min(5, Math.round(Number(v))));
  }

  // 换算规则：以 3 星为公平基准，每高/低 0.25 星信誉 ±1（即每 1 星 ±4）
  // 单次封顶：最高 +5、最低 -5，防信誉暴涨暴跌
  function calcReviewDelta(completion, attitude) {
    const avg = Math.round((completion + attitude) / 2 * 4) / 4; // 两维均值，0.25 步
    return Math.max(-5, Math.min(5, Math.round((avg - 3) * 4)));
  }

  // 记录一次发布者验收评分：换算信誉 + 追加评价记录，返回 {avg, delta, ...}
  function addReview(info) {
    const completion = clampStar(Number(info.completion));
    const attitude = clampStar(Number(info.attitude));
    const avg = Math.round((completion + attitude) / 2 * 4) / 4;
    const delta = calcReviewDelta(completion, attitude);
    const rec = {
      id: String(Date.now()),
      taskId: String(info.taskId == null ? '' : info.taskId),
      taskTitle: String(info.taskTitle == null ? '邻里任务' : info.taskTitle),
      completion: completion,
      attitude: attitude,
      avg: avg,
      delta: delta,
      comment: String(info.comment == null ? '' : info.comment).slice(0, 120),
      time: new Date().toLocaleString()
    };
    if (delta) {
      const part = delta > 0 ? '交付到位，获邻里好评' : '交付质量欠佳，获邻里差评';
      changeCredit(delta,
        '任务《' + rec.taskTitle + '》验收：完成度 ' + completion + '★ + 态度 ' + attitude + '★（均星 ' + avg + '），' + part,
        { starAvg: avg });
    }
    mem.reviews.unshift(rec);
    if (mem.reviews.length > 50) mem.reviews.length = 50;
    write(REVIEWS_KEY, mem.reviews);
    return rec;
  }

  // 全部验收评分记录（含被评审撤销的，调用方自行过滤展示）
  function getReviews() { return mem.reviews; }

  // 某笔任务是否已有验收评分
  function getReviewByTask(taskId) {
    const id = String(taskId == null ? '' : taskId);
    for (let i = 0; i < mem.reviews.length; i += 1) {
      if (mem.reviews[i].taskId === id) return mem.reviews[i];
    }
    return null;
  }

  // 综合评分统计：完成度均值、态度均值、综合均星
  // 经大众评审团裁定撤销（upheld）的差评不计入统计
  function getRatingSummary() {
    const valid = mem.reviews.filter(function (r) { return r.appealStatus !== 'upheld'; });
    const n = valid.length;
    if (!n) return null;
    let c = 0;
    let a = 0;
    valid.forEach(function (r) { c += r.completion; a += r.attitude; });
    const round = function (x) { return Math.round(x * 100) / 100; };
    return {
      count: n,
      completion: round(c / n),
      attitude: round(a / n),
      avg: round((c + a) / (2 * n))
    };
  }

  /* ===================== 申诉 & 大众评审团 ===================== */
  function getAppeals() { return mem.appeals.slice(); }

  function getAppealByTaskId(taskId) {
    const id = String(taskId == null ? '' : taskId);
    for (let i = 0; i < mem.appeals.length; i += 1) {
      if (mem.appeals[i].taskId === id) return mem.appeals[i];
    }
    return null;
  }

  function getAppealById(id) {
    for (let i = 0; i < mem.appeals.length; i += 1) {
      if (mem.appeals[i].id === id) return mem.appeals[i];
    }
    return null;
  }

  // 统计一桩申诉当前的票箱：{ support: 支持申诉票数, reject: 维持差评票数 }
  function countAppealVotes(a) {
    let support = 0;
    let reject = 0;
    (a.votes || []).forEach(function (v) {
      if (v.side === 'support') support += 1;
      else if (v.side === 'reject') reject += 1;
    });
    return { support: support, reject: reject };
  }

  // 被差评方提交申诉（一笔任务只可申诉一次）
  function submitAppeal(info) {
    const taskId = String(info.taskId == null ? '' : info.taskId);
    if (getAppealByTaskId(taskId)) {
      return { ok: false, msg: '该任务已提交过申诉，请前往大众评审团查看进展' };
    }
    const rv = getReviewByTask(taskId);
    if (!rv) return { ok: false, msg: '该任务还没有验收评分，无法申诉' };
    if (rv.delta >= 0) return { ok: false, msg: '本次验收未扣信誉，无需申诉' };
    const reason = String(info.reason == null ? '' : info.reason).trim().slice(0, 200);
    if (!reason) return { ok: false, msg: '请先说明你的申诉理由' };

    const a = {
      id: String(Date.now()) + '-' + Math.floor(Math.random() * 1000),
      taskId: taskId,
      reviewId: rv.id,
      taskTitle: rv.taskTitle,
      review: {
        completion: rv.completion,
        attitude: rv.attitude,
        avg: rv.avg,
        delta: rv.delta,
        comment: rv.comment,
        time: rv.time
      },
      reason: reason,
      status: 'voting', // voting 评审中 / upheld 申诉成立 / rejected 维持差评
      votes: [],
      created: new Date().toLocaleString(),
      closed: null
    };
    mem.appeals.unshift(a);
    write(APPEALS_KEY, mem.appeals);
    return { ok: true, appeal: a };
  }

  // 某票是否使双方中一方达到裁决条件：任一方向 ≥3 票且领先 ≥2
  function canDecide(support, reject) {
    const high = Math.max(support, reject);
    return high >= APPEAL_VOTE_NEED && Math.abs(support - reject) >= 2;
  }

  // 邻里投票：side = support（支持申诉，撤销差评）| reject（维持差评）
  // 达到裁决条件即自动结案；申诉成立会撤销该次差评并恢复信誉
  function voteAppeal(appealId, side) {
    const a = getAppealById(String(appealId));
    if (!a || a.status !== 'voting') {
      return { ok: false, msg: '该申诉已结案或不存在' };
    }
    if (side !== 'support' && side !== 'reject') return { ok: false, msg: '无效的投票' };

    a.votes.push({ side: side, at: new Date().toLocaleString() });
    const c = countAppealVotes(a);

    let decided = false;
    let result = null;
    if (canDecide(c.support, c.reject)) {
      decided = true;
      result = c.support > c.reject ? 'upheld' : 'rejected';
    }

    if (decided) {
      a.status = result;
      a.closed = new Date().toLocaleString();
      const rv = getReviewByTask(a.taskId);
      if (result === 'upheld') {
        // 撤销扣分：把该笔差评扣掉的信誉加回，并公示撤销状态
        if (rv && rv.delta < 0 && rv.appealStatus !== 'upheld') {
          rv.appealStatus = 'upheld';
          write(REVIEWS_KEY, mem.reviews);
          changeCredit(-rv.delta,
            '任务《' + a.taskTitle + '》差评经大众评审团裁定申诉成立，原扣 ' + rv.delta + ' 分已撤销，信誉恢复',
            { appeal: 'upheld' });
        }
      } else if (rv) {
        rv.appealStatus = 'rejected';
        write(REVIEWS_KEY, mem.reviews);
      }
    }
    write(APPEALS_KEY, mem.appeals);
    return { ok: true, decided: decided, result: result, appeal: a, support: c.support, reject: c.reject };
  }

  function resetCredit() {
    mem.credit = { score: 100, history: [] };
    mem.reviews = [];
    mem.appeals = [];
    write(CREDIT_KEY, mem.credit);
    write(REVIEWS_KEY, mem.reviews);
    write(APPEALS_KEY, mem.appeals);
    return mem.credit.score;
  }

  return {
    getPoints,
    changePoints,
    getTasks,
    saveTasks,
    resetPoints,
    clearTasks,
    getHeartPool,
    calcTaskReward,
    settleTaskReward,
    addBounty,
    getCreditScore,
    getCreditHistory,
    changeCredit,
    calcReviewDelta,
    addReview,
    getReviewByTask,
    getReviews,
    getRatingSummary,
    resetCredit,
    getAppeals,
    getAppealByTaskId,
    countAppealVotes,
    submitAppeal,
    voteAppeal
  };
})();
