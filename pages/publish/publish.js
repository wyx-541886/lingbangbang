const app = getApp();

Page({
  data: {
    points: 0,
    title: '',
    desc: '',
    reward: '',
    rewardOptions: [5, 10, 20, 50],
    loading: false,
    loadingText: '加载中...'
  },

  onLoad() {
    this._submitting = false;
    this._timer = null;
  },

  onShow() {
    // 读内存缓存，瞬时完成，无需加载动画
    this._submitting = false;
    this.setData({ points: app.getPoints(), loading: false });
  },

  onUnload() {
    if (this._timer) clearTimeout(this._timer);
  },

  onTitleInput(e) {
    this.setData({ title: e.detail.value });
  },

  onDescInput(e) {
    this.setData({ desc: e.detail.value });
  },

  onRewardInput(e) {
    this.setData({ reward: e.detail.value });
  },

  selectReward(e) {
    const val = e.currentTarget.dataset.val;
    this.setData({ reward: String(val) });
  },

  submit() {
    // 防重复提交
    if (this._submitting) return;

    const { title, desc, reward, points } = this.data;
    if (!title.trim()) {
      wx.showToast({ title: '请填写任务标题', icon: 'none' });
      return;
    }
    if (!desc.trim()) {
      wx.showToast({ title: '请填写任务说明', icon: 'none' });
      return;
    }
    const rewardNum = Number(reward);
    if (!reward || rewardNum <= 0) {
      wx.showToast({ title: '请填写正确的积分', icon: 'none' });
      return;
    }
    if (rewardNum > points) {
      wx.showToast({ title: '积分不足', icon: 'none' });
      return;
    }

    this._submitting = true;
    this.setData({ loading: true, loadingText: '正在发布...' });

    // 保留短暂反馈时长，保证动画不闪烁
    this._timer = setTimeout(() => {
      this._timer = null;

      const newPoints = app.changePoints(-rewardNum);
      if (newPoints === null) {
        this._submitting = false;
        this.setData({ loading: false });
        wx.showToast({ title: '积分不足', icon: 'none' });
        return;
      }

      const task = {
        id: Date.now().toString(),
        title: title.trim(),
        desc: desc.trim(),
        reward: rewardNum,
        status: 'pending',
        createTime: new Date().toLocaleString()
      };
      const tasks = app.getTasks();
      tasks.unshift(task);
      app.saveTasks(tasks);

      this.setData({ points: newPoints, loading: false });
      wx.showToast({ title: '发布成功', icon: 'success' });

      this._timer = setTimeout(() => {
        this._timer = null;
        this._submitting = false;
        wx.navigateBack();
      }, 500);
    }, 300);
  }
});
