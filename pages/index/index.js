const app = getApp();

// 瀑布流背景任务卡片（装饰用，onLoad 时构建一次）
const BG_TASKS = [
  { tag: '遛狗', title: '帮忙遛狗半小时', reward: 15, avatar: '王' },
  { tag: '买菜', title: '代购蔬菜水果', reward: 10, avatar: '李' },
  { tag: '陪诊', title: '陪老人去医院取药', reward: 30, avatar: '张' },
  { tag: '取件', title: '代取快递上门', reward: 8, avatar: '刘' },
  { tag: '维修', title: '换灯泡修水管', reward: 25, avatar: '陈' },
  { tag: '辅导', title: '辅导小学生作业', reward: 20, avatar: '赵' },
  { tag: '拍照', title: '帮拍全家福', reward: 12, avatar: '周' },
  { tag: '喂养', title: '出差代喂宠物猫', reward: 18, avatar: '孙' }
];

Page({
  data: {
    points: 0,
    bgTasks: [],
    bgPaused: false,
    loading: false,
    loadingText: '加载中...'
  },

  onLoad() {
    // 防重复点击锁
    this._navigating = false;
    // 构建瀑布流数据（仅一次）
    const col1 = [];
    const col2 = [];
    BG_TASKS.forEach((t, i) => {
      const item = { ...t, h: i % 3 === 0 ? 220 : i % 3 === 1 ? 180 : 260 };
      (i % 2 === 0 ? col1 : col2).push(item);
    });
    this.setData({ bgTasks: [col1, col2] });
  },

  onShow() {
    // 回页时解锁并刷新积分（读内存缓存，瞬时完成）
    this._navigating = false;
    this.setData({ points: app.getPoints(), bgPaused: false, loading: false });
  },

  onHide() {
    // 离开页面时暂停背景动画，释放渲染资源
    this.setData({ bgPaused: true, loading: false });
  },

  onUnload() {
    if (this._timer) clearTimeout(this._timer);
  },

  // 即时跳转：不加遮罩、不加延迟，避免遮罩覆盖新页面造成闪回
  navigate(url) {
    if (this._navigating) return;
    this._navigating = true;
    wx.navigateTo({
      url,
      fail: () => {
        this._navigating = false;
        wx.showToast({ title: '页面打开失败', icon: 'none' });
      }
    });
  },

  goPublish() {
    this.navigate('/pages/publish/publish');
  },

  goAccept() {
    this.navigate('/pages/accept/accept');
  },

  goMe() {
    this.navigate('/pages/me/me');
  },

  goSettings() {
    this.navigate('/pages/settings/settings');
  }
});
