App({
  globalData: {
    pointsKey: 'linbangbang_user_points',
    tasksKey: 'linbangbang_tasks',
    // 内存缓存：避免频繁调用同步存储接口阻塞 JS 线程
    points: null,
    tasks: null
  },

  onLaunch() {
    this.initData();
  },

  // 首次启动时读一次存储并写入内存缓存
  initData() {
    let points = wx.getStorageSync(this.globalData.pointsKey);
    if (points === '' || points === null || points === undefined) {
      points = 100;
      wx.setStorageSync(this.globalData.pointsKey, points);
    }
    this.globalData.points = Number(points);

    let tasks = wx.getStorageSync(this.globalData.tasksKey);
    if (!Array.isArray(tasks)) {
      tasks = [];
      wx.setStorageSync(this.globalData.tasksKey, tasks);
    }
    this.globalData.tasks = tasks;
  },

  // 获取当前积分（读缓存，O(1)）
  getPoints() {
    if (this.globalData.points === null) {
      this.globalData.points = Number(wx.getStorageSync(this.globalData.pointsKey)) || 0;
    }
    return this.globalData.points;
  },

  // 修改积分：先更新内存，再异步落盘
  changePoints(delta) {
    const cur = this.getPoints();
    const next = cur + delta;
    if (next < 0) return null;
    this.globalData.points = next;
    wx.setStorage({ key: this.globalData.pointsKey, data: next });
    return next;
  },

  // 获取任务列表（读缓存）
  getTasks() {
    if (this.globalData.tasks === null) {
      const t = wx.getStorageSync(this.globalData.tasksKey);
      this.globalData.tasks = Array.isArray(t) ? t : [];
    }
    return this.globalData.tasks;
  },

  // 保存任务：先更新内存，再异步落盘
  saveTasks(tasks) {
    this.globalData.tasks = tasks;
    wx.setStorage({ key: this.globalData.tasksKey, data: tasks });
  }
});
