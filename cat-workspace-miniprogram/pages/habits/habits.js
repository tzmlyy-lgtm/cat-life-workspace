Page({
  data: { habits: [], newName: '', modes: ['勾选', '计数'], modeIdx: 0, today: '' },

  onLoad() {
    this.setData({ today: this.todayStr() });
    this.load();
  },
  onShow() { this.load(); },

  todayStr() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  },

  load() {
    const t = this.data.today;
    const habits = (wx.getStorageSync('habits') || []).map(h => {
      const rec = h.records && h.records[t];
      const checked = h.mode === 'check' ? !!rec : (rec !== undefined && rec !== '');
      // 构建30天历史
      const history = [];
      for (let i = 29; i >= 0; i--) {
        const dd = new Date(); dd.setDate(dd.getDate() - i);
        const ds = `${dd.getFullYear()}-${String(dd.getMonth()+1).padStart(2,'0')}-${String(dd.getDate()).padStart(2,'0')}`;
        const r = h.records && h.records[ds];
        history.push(h.mode === 'check' ? !!r : (r !== undefined && r !== ''));
      }
      return { ...h, checked, todayVal: Number(rec) || 0, history };
    });
    this.setData({ habits });
  },

  onInput(e) { this.setData({ newName: e.detail.value }); },
  onModeChange(e) { this.setData({ modeIdx: Number(e.detail.value) }); },

  addHabit() {
    if (!this.data.newName.trim()) return;
    const list = wx.getStorageSync('habits') || [];
    list.push({
      id: 'h' + Date.now(),
      name: this.data.newName.trim(),
      mode: this.data.modeIdx === 0 ? 'check' : 'count',
      unit: this.data.modeIdx === 0 ? '' : '次',
      target: this.data.modeIdx === 0 ? 0 : 1,
      records: {}
    });
    wx.setStorageSync('habits', list);
    this.setData({ newName: '' }); this.load();
    wx.showToast({ title: '已添加', icon: 'success' });
  },

  checkin(e) {
    const id = e.currentTarget.dataset.id;
    const list = wx.getStorageSync('habits') || [];
    const h = list.find(x => x.id === id); if (!h) return;
    const t = this.data.today;
    if (!h.records) h.records = {};
    if (h.mode === 'check') {
      h.records[t] = h.records[t] ? undefined : true;
    } else {
      const cur = Number(h.records[t]) || 0;
      h.records[t] = cur + 1;
    }
    wx.setStorageSync('habits', list); this.load();
  }
});
