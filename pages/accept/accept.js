const app = getApp();

Page({
  data: {
    points: 0,
    tasks: [],
    loading: false,
    loadingText: '加载中...'
  },

  onLoad() {
    this._accepting = false;
    this._timer = null;
    this._firstLoad = true;
    // 首次进入展示加载动画
    this.setData({ loading: true, loadingText: '正在获取任务...' });
  },

  onShow() {
    this._accepting = false;
    this.refresh();

    // 首次进入保留短暂动画时长，后续返回静默刷新（读内存缓存，无感知）
    if (this._firstLoad) {
      this._firstLoad = false;
      this._timer = setTimeout(() => {
        this._timer = null;
        this.setData({ loading: false });
      }, 200);
    }
  },

  onHide() {
    this.setData({ loading: false });
  },

  onUnload() {
    if (this._timer) clearTimeout(this._timer);
  },

  // 从内存缓存同步刷新，零延迟
  refresh() {
    this.setData({
      points: app.getPoints(),
      tasks: app.getTasks()
    });
  },

  acceptTask(e) {
    if (this._accepting) return;

    const id = e.currentTarget.dataset.id;
    const task = this.data.tasks.find(t => t.id === id);
    if (!task || task.status !== 'pending') return;

    wx.showModal({
      title: '接取任务',
      content: `确定接取「${task.title}」吗？完成后将获得 ${task.reward} 积分。`,
      confirmText: '接取',
      cancelText: '再想想',
      success: (res) => {
        if (!res.confirm) return;

        this._accepting = true;
        this.setData({ loading: true, loadingText: '正在接取...' });

        this._timer = setTimeout(() => {
          this._timer = null;

          const tasks = app.getTasks();
          const target = tasks.find(t => t.id === id);
          if (target) {
            target.status = 'done';
            app.saveTasks(tasks);
          }

          const newPoints = app.changePoints(task.reward);
          this.refresh();
          this.setData({ loading: false });
          this._accepting = false;

          wx.showToast({ title: '接取成功 +' + task.reward, icon: 'success' });
        }, 300);
      }
    });
  }
});
