const app = getApp();

Page({
  data: {
    points: 0,
    publishCount: 0,
    acceptCount: 0,
    loading: false,
    loadingText: '加载中...'
  },

  onLoad() {
    this._timer = null;
    this._firstLoad = true;
    this.setData({ loading: true, loadingText: '正在加载...' });
  },

  onShow() {
    this.refresh();

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
    const tasks = app.getTasks();
    this.setData({
      points: app.getPoints(),
      publishCount: tasks.length,
      acceptCount: tasks.filter(t => t.status === 'done').length
    });
  }
});
