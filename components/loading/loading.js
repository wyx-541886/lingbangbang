Component({
  properties: {
    show: {
      type: Boolean,
      value: false
    },
    text: {
      type: String,
      value: '加载中...'
    }
  },

  methods: {
    // 阻止遮罩层穿透滚动
    noop() {}
  }
});
