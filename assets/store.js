/* ============================================================
   邻帮帮 · 数据层（对应小程序 app.js）
   积分 + 任务列表，localStorage 持久化
   ============================================================ */
const AppStore = (function () {
  const POINTS_KEY = 'linbangbang_user_points';
  const TASKS_KEY = 'linbangbang_tasks';
  const HEART_POOL_KEY = 'linbangbang_heart_pool'; // 爱心池：任务佣金抽成累积，界面不展示
  const COMMISSION_RATE = 0.2; // 任务佣金抽成比例：20%
  const mem = { points: null, tasks: null, heartPool: null };

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

  return {
    getPoints,
    changePoints,
    getTasks,
    saveTasks,
    resetPoints,
    clearTasks,
    getHeartPool,
    calcTaskReward,
    settleTaskReward
  };
})();
