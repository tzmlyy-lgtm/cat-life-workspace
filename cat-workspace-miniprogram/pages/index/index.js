Page({
  data: {
    today: '',
    todoCount: 0,
    expense: 0,
    goalCount: 0,
    quickNote: '',
    dailyDone: '',
    dailyGrate: '',
    dailyNext: '',
    aiText: ''
  },

  onLoad() {
    this.setData({ today: this.todayStr() });
    this.loadStats();
    this.loadQuickNote();
    this.loadDaily();
  },

  onShow() {
    this.loadStats();
  },

  todayStr() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  },

  loadStats() {
    const t = this.data.today;
    const ym = t.slice(0, 7);

    // 待办
    const schedule = wx.getStorageSync('schedule') || [];
    const habits = wx.getStorageSync('habits') || [];
    let todoCount = 0;
    habits.forEach(h => {
      const rec = h.records && h.records[t];
      if (h.mode === 'check' ? !rec : (rec !== undefined && rec !== '')) todoCount++;
    });
    schedule.forEach(s => { if (!s.done && s.date <= t) todoCount++; });

    // 支出
    const finance = wx.getStorageSync('finance') || [];
    let expense = 0;
    finance.forEach(f => {
      if (f.type === 'expense' && f.date && f.date.startsWith(ym)) expense += Number(f.amount) || 0;
    });

    // 目标
    const goals = wx.getStorageSync('goal') || [];
    let goalCount = 0;
    goals.forEach(g => {
      const ms = g.milestones || [];
      if (ms.length === 0 || ms.some(m => !m.done)) goalCount++;
    });

    this.setData({ todoCount, expense: expense.toFixed(0), goalCount });
  },

  // 便利填写
  loadQuickNote() {
    const key = 'qn_' + this.data.today;
    this.setData({ quickNote: wx.getStorageSync(key) || '' });
  },
  onQnInput(e) { this.setData({ quickNote: e.detail.value }); },
  qnAppend(e) {
    const pre = e.currentTarget.dataset.pre;
    this.setData({ quickNote: (this.data.quickNote ? this.data.quickNote + '\n' : '') + pre });
  },
  saveQn() {
    const key = 'qn_' + this.data.today;
    wx.setStorageSync(key, this.data.quickNote);
    wx.showToast({ title: '已保存', icon: 'success' });
  },

  // 一日总结
  loadDaily() {
    const t = this.data.today;
    const d = wx.getStorageSync('daily_' + t) || {};
    this.setData({
      dailyDone: d.done || '',
      dailyGrate: d.grate || '',
      dailyNext: d.next || ''
    });
  },
  onDailyDone(e) { this.setData({ dailyDone: e.detail.value }); },
  onDailyGrate(e) { this.setData({ dailyGrate: e.detail.value }); },
  onDailyNext(e) { this.setData({ dailyNext: e.detail.value }); },
  saveDaily() {
    const t = this.data.today;
    const v = {
      done: this.data.dailyDone.trim(),
      grate: this.data.dailyGrate.trim(),
      next: this.data.dailyNext.trim()
    };
    if (!v.done && !v.grate && !v.next) {
      wx.showToast({ title: '先写点什么吧～', icon: 'none' }); return;
    }
    wx.setStorageSync('daily_' + t, JSON.stringify(v));
    wx.showToast({ title: '✅ 已保存', icon: 'success' });
  },

  // AI 智能总结
  aiSummary() {
    const t = this.data.today, ym = t.slice(0, 7);
    const parts = [];

    // 待办
    const schedule = wx.getStorageSync('schedule') || [];
    const done = schedule.filter(s => s.done && s.date === t).length;
    const pending = schedule.filter(s => !s.done && s.date <= t).length;
    parts.push(`📌 今日日程：${done ? `已完成 ${done} 项` : ''}${pending ? `；还有 ${pending} 项待处理` : ''}。`);

    // 习惯
    const habits = wx.getStorageSync('habits') || [];
    const hDone = habits.filter(h => { const r = h.records && h.records[t]; return h.mode==='check'?!!r:(r!==undefined&&r!==''&&r!==0); }).length;
    if (habits.length) parts.push(`🐾 习惯打卡：今日 ${hDone}/${habits.length}${hDone===habits.length?' 🎉':''}`);

    // 便利填写
    const qn = (wx.getStorageSync('qn_' + t) || '').trim();
    if (qn) parts.push(`📝 随手记：${qn.split('\n').filter(Boolean).slice(0,2).map(x=>'「'+x.slice(0,20)+'」').join(' ')}`);

    // 支出
    const finance = wx.getStorageSync('finance') || [];
    const out = finance.filter(f => f.type==='expense' && f.date && f.date.startsWith(ym)).reduce((a,f)=>a+Number(f.amount)||0,0);
    parts.push(`💰 本月已花 ¥${out.toFixed(0)}`);

    // 目标
    const goals = wx.getStorageSync('goal') || [];
    const activeGoals = goals.filter(g => { const ms=g.milestones||[]; return ms.length===0||ms.some(m=>!m.done); });
    if (activeGoals.length) parts.push(`🎯 进行中 ${activeGoals.length} 个目标，例「${activeGoals[0].title}」`);

    // 用户写的三段
    if (this.data.dailyDone || this.data.dailyGrate || this.data.dailyNext) {
      const seg = [];
      if (this.data.dailyDone) seg.push('完成：'+this.data.dailyDone.slice(0,30));
      if (this.data.dailyGrate) seg.push('感恩：'+this.data.dailyGrate.slice(0,30));
      if (this.data.dailyNext) seg.push('明日：'+this.data.dailyNext.slice(0,30));
      parts.push('📔 你已记录：' + seg.join('；'));
    }

    parts.push(done+hDone >= (done+hDone+pending+habits.length-done-hDone) ? '今天节奏很稳，继续保持 🐱' : '今天也辛苦啦，循序渐进就好。');

    this.setData({ aiText: `【${t} 一日总结 · AI 归纳】\n` + parts.join('\n') });
    wx.showToast({ title: '✨ 已生成总结', icon: 'success' });
  },

  copyAi() {
    wx.setClipboardData({ data: this.data.aiText });
  }
});
