Page({
  data: { goals: [], newTitle: '', newDeadline: '' },

  onLoad() { this.load(); },
  onShow() { this.load(); },

  load() {
    const goals = (wx.getStorageSync('goal') || []).map(g => {
      const ms = g.milestones || [];
      const doneCount = ms.filter(m => m.done).length;
      return { ...g, totalCount: ms.length, doneCount, progress: ms.length ? Math.round(doneCount/ms.length*100) : 0, newMs: '' };
    });
    this.setData({ goals });
  },

  onInput(e) { this.setData({ newTitle: e.detail.value }); },
  onDeadline(e) { this.setData({ newDeadline: e.detail.value }); },

  addGoal() {
    if (!this.data.newTitle.trim()) { wx.showToast({ title: '请输入目标名称', icon: 'none' }); return; }
    const list = wx.getStorageSync('goal') || [];
    list.push({
      id: 'g' + Date.now(),
      title: this.data.newTitle.trim(),
      deadline: this.data.newDeadline.trim(),
      milestones: []
    });
    wx.setStorageSync('goal', list);
    this.setData({ newTitle: '', newDeadline: '' }); this.load();
    wx.showToast({ title: '目标已创建 🎯', icon: 'success' });
  },

  delGoal(e) {
    wx.showModal({ title: '删除目标？', success: res => {
      if (res.confirm) {
        const list = (wx.getStorageSync('goal') || []).filter(x => x.id !== e.currentTarget.dataset.id);
        wx.setStorageSync('goal', list); this.load();
      }
    }});
  },

  onMsInput(e) {
    const gid = e.currentTarget.dataset.id;
    const goals = this.data.goals.map(g => g.id === gid ? {...g, newMs: e.detail.value} : g);
    this.setData({ goals });
  },
  addMs(e) {
    const gid = e.currentTarget.dataset.id;
    const goals = this.data.goals;
    const g = goals.find(x => x.id === gid); if (!g || !g.newMs.trim()) return;
    if (!g.milestones) g.milestones = [];
    g.milestones.push({ text: g.newMs.trim(), done: false });
    g.newMs = '';
    wx.setStorageSync('goal', goals.map(({newMs,...rest})=>rest)); this.load();
    wx.showToast({ title: '里程碑已添加', icon: 'success' });
  },
  toggleMs(e) {
    const {gid, idx} = e.currentTarget.dataset;
    const list = wx.getStorageSync('goal') || [];
    const g = list.find(x => x.id === gid); if (!g || !g.milestones) return;
    g.milestones[idx].done = !g.milestones[idx].done;
    wx.setStorageSync('goal', list); this.load();
  }
});
