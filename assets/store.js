/* ============================================================
   邻帮帮 · 数据层（对应小程序 app.js）
   积分 + 任务列表，localStorage 持久化
   ============================================================ */
const AppStore = (function () {
  const POINTS_KEY = 'linbangbang_user_points';
  const TASKS_KEY = 'linbangbang_tasks';
  const mem = { points: null, tasks: null };

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

  return {
    getPoints,
    changePoints,
    getTasks,
    saveTasks,
    resetPoints,
    clearTasks
  };
})();
