/* ============================================================
   邻帮帮 · 数据层（对应小程序 app.js）
   积分 + 任务列表，localStorage 持久化
   ============================================================ */
const AppStore = (function () {
  const POINTS_KEY = 'linbangbang_user_points';
  const TASKS_KEY = 'linbangbang_tasks';
  const HEART_POOL_KEY = 'linbangbang_heart_pool'; // 爱心池：任务佣金抽成累积，界面不展示
  const CREDIT_KEY = 'linbangbang_credit'; // 信誉：score 0-100 + 变动记录
  const REVIEWS_KEY = 'linbangbang_reviews'; // 交付评分：发布者对完成度/态度的五星评价（半星粒度）
  const COMMISSION_RATE = 0.2; // 任务佣金抽成比例：20%
  const mem = { points: null, tasks: null, heartPool: null, credit: null, reviews: null };

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

  function clearTasks() { saveTasks([]); }

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
  // 星级取值合法化：支持半星（0.5 步进），范围 0.5 ~ 5
  function clampStar(v) {
    if (!isFinite(v)) v = 3;
    return Math.max(0.5, Math.min(5, Math.round(Number(v) * 2) / 2));
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

  // 某笔任务是否已有验收评分
  function getReviewByTask(taskId) {
    const id = String(taskId == null ? '' : taskId);
    for (let i = 0; i < mem.reviews.length; i += 1) {
      if (mem.reviews[i].taskId === id) return mem.reviews[i];
    }
    return null;
  }

  // 综合评分统计：完成度均值、态度均值、综合均星
  function getRatingSummary() {
    const n = mem.reviews.length;
    if (!n) return null;
    let c = 0;
    let a = 0;
    mem.reviews.forEach(function (r) { c += r.completion; a += r.attitude; });
    const round = function (x) { return Math.round(x * 100) / 100; };
    return {
      count: n,
      completion: round(c / n),
      attitude: round(a / n),
      avg: round((c + a) / (2 * n))
    };
  }

  function resetCredit() {
    mem.credit = { score: 100, history: [] };
    mem.reviews = [];
    write(CREDIT_KEY, mem.credit);
    write(REVIEWS_KEY, mem.reviews);
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
    getCreditScore,
    getCreditHistory,
    changeCredit,
    calcReviewDelta,
    addReview,
    getReviewByTask,
    getRatingSummary,
    resetCredit
  };
})();
