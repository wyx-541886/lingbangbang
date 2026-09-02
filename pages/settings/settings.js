const app = getApp();

Page({
  data: {
    points: 0,
    loading: false,
    loadingText: '加载中...'
  },

  onLoad() {
    this._running = false;
    this._timer = null;
  },

  onShow() {
    this._running = false;
    this.setData({ points: app.getPoints(), loading: false });
  },

  onUnload() {
    if (this._timer) clearTimeout(this._timer);
  },

  // 执行带加载动画的操作
  runWithLoading(text, action, successText) {
    if (this._running) return;
    this._running = true;
    this.setData({ loading: true, loadingText: text });

    this._timer = setTimeout(() => {
      this._timer = null;
      action();
      this.setData({ loading: false });
      this._running = false;
      wx.showToast({ title: successText, icon: 'success' });
    }, 300);
  },

  resetPoints() {
    wx.showModal({
      title: '重置积分',
      content: '将积分重置为 100，确定吗？',
      success: (res) => {
        if (res.confirm) {
          this.runWithLoading(
            '正在重置积分...',
            () => {
              wx.setStorageSync(app.globalData.pointsKey, 100);
              app.globalData.points = 100;
              this.setData({ points: 100 });
            },
            '已重置'
          );
        }
      }
    });
  },

  clearTasks() {
    wx.showModal({
      title: '清空任务',
      content: '将清空所有任务记录，确定吗？',
      success: (res) => {
        if (res.confirm) {
          this.runWithLoading(
            '正在清空任务...',
            () => app.saveTasks([]),
            '已清空'
          );
        }
      }
    });
  },

  about() {
    wx.showModal({
      title: '关于邻帮帮',
      content: '邻帮帮是一款社区任务互助平台，让邻里之间互帮互助，用积分传递温暖。',
      showCancel: false,
      confirmText: '知道了'
    });
  }
});
