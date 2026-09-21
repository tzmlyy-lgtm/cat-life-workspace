// 喵星驻地球办事处 · 微信小程序
App({
  globalData: {
    userInfo: null,
    theme: {
      bg: '#f5f0e8',
      panel: '#fffdf8',
      line: '#e8dfd3',
      ink: '#3d3529',
      inkSoft: '#8a8074',
      sage: '#8b9a7f',
      sageDeep: '#6b7a62',
      coral: '#c89060',
      cat: '#c89060',
      sky: '#7fa0c6'
    }
  },

  onLaunch() {
    // 初始化存储
    this.initStorage();
  },

  initStorage() {
    // 确保各模块数据存在
    const keys = ['habits', 'schedule', 'finance', 'goal', 'mood', 'shopping', 'media', 'birthday', 'idea', 'health', 'wish', 'pomodoro', 'fitness', 'quickNote', 'daily'];
    keys.forEach(key => {
      if (!wx.getStorageSync(key)) {
        wx.setStorageSync(key, []);
      }
    });
  },

  // 工具方法
  todayStr() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  },

  saveData(key, data) {
    wx.setStorageSync(key, data);
  },

  getData(key) {
    return wx.getStorageSync(key) || [];
  }
});
