Page({
  data: { items: [], habits: [], newTitle: '', today: '' },

  onLoad() {
    this.setData({ today: this.todayStr() });
    this.loadData();
  },

  onShow() { this.loadData(); },

  todayStr() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  },

  loadData() {
    const t = this.data.today;
    let schedule = wx.getStorageSync('schedule') || [];
    // 过滤逾期+今日
    schedule = schedule.filter(s => !s.done && s.date <= t).map(s => ({
      ...s,
      overdue: s.date < t
    }));
    // 也显示今天已完成的
    const doneToday = (wx.getStorageSync('schedule') || []).filter(s => s.done && s.date === t);

    let habits = (wx.getStorageSync('habits') || []).map(h => {
      const rec = h.records && h.records[t];
      return { ...h, checked: h.mode === 'check' ? !!rec : (rec !== undefined && rec !== ''), todayVal: rec };
    });

    this.setData({ items: [...schedule, ...doneToday], habits });
  },

  onInput(e) { this.setData({ newTitle: e.detail.value }); },
  addTask() {
    if (!this.data.newTitle.trim()) return;
    const list = wx.getStorageSync('schedule') || [];
    list.push({
      id: 't' + Date.now(),
      title: this.data.newTitle.trim(),
      date: this.data.today,
      time: '',
      done: false
    });
    wx.setStorageSync('schedule', list);
    this.setData({ newTitle: '' });
    this.loadData();
    wx.showToast({ title: '已添加', icon: 'success' });
  },

  toggleTask(e) {
    const id = e.currentTarget.dataset.id;
    const list = wx.getStorageSync('schedule') || [];
    const item = list.find(x => x.id === id);
    if (item) { item.done = !item.done; wx.setStorageSync('schedule', list); this.loadData(); }
  },
  delTask(e) {
    const id = e.currentTarget.dataset.id;
    wx.showModal({
      title: '确认删除',
      success: res => {
        if (res.confirm) {
          const list = (wx.getStorageSync('schedule') || []).filter(x => x.id !== id);
          wx.setStorageSync('schedule', list); this.loadData();
        }
      }
    });
  },

  quickCheckin(e) {
    const id = e.currentTarget.dataset.id;
    const habits = wx.getStorageSync('habits') || [];
    const h = habits.find(x => x.id === id);
    if (!h) return;
    const t = this.data.today;
    if (!h.records) h.records = {};
    if (h.mode === 'check') {
      h.records[t] = h.records[t] ? undefined : true;
    } else {
      const cur = Number(h.records[t]) || 0;
      h.records[t] = cur >= (h.target||1) ? 0 : cur + 1;
    }
    wx.setStorageSync('schedule', wx.getStorageSync('schedule'));
    wx.setStorageSync('habits', habits);
    this.loadData();
    wx.showToast({ title: h.mode==='check'?(h.records[t]?'已打卡':'已取消'):`+1 (${h.records[t]}${h.unit||''})`, icon: 'none' });
  }
});
