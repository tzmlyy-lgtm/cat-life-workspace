Page({
  data: { today: '', done: '', grate: '', next: '', aiText: '', history: [] },

  onLoad() {
    this.setData({ today: this.todayStr() });
    this.loadToday();
    this.loadHistory();
  },
  onShow() { this.loadToday(); this.loadHistory(); },

  todayStr() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  },

  loadToday() {
    const d = wx.getStorageSync('daily_' + this.data.today) || {};
    this.setData({ done: d.done || '', grate: d.grate || '', next: d.next || '' });
  },

  onDone(e) { this.setData({ done: e.detail.value }); },
  onGrate(e) { this.setData({ grate: e.detail.value }); },
  onNext(e) { this.setData({ next: e.detail.value }); },

  save() {
    const v = { done: this.data.done.trim(), grate: this.data.grate.trim(), next: this.data.next.trim() };
    if (!v.done && !v.grate && !v.next) { wx.showToast({ title: '先写点什么吧～', icon: 'none' }); return; }
    wx.setStorageSync('daily_' + this.data.today, v);
    wx.showToast({ title: '✅ 已保存', icon: 'success' });
    this.loadHistory();
  },

  loadHistory() {
    const hist = [];
    for (let i = 1; i <= 30; i++) {
      const dd = new Date(); dd.setDate(dd.getDate() - i);
      const ds = `${dd.getFullYear()}-${String(dd.getMonth()+1).padStart(2,'0')}-${String(dd.getDate()).padStart(2,'0')}`;
      const v = wx.getStorageSync('daily_' + ds);
      if (v) hist.unshift({ date: ds, ...v });
      if (hist.length >= 10) break;
    }
    this.setData({ history: hist });
  },

  aiSum() {
    // 复用首页的AI逻辑
    const app = getApp();
    const t = this.data.today;
    const parts = [];
    const schedule = wx.getStorageSync('schedule') || [];
    const habits = wx.getStorageSync('habits') || [];
    const finance = wx.getStorageSync('finance') || [];
    const goals = wx.getStorageSync('goal') || [];

    const doneS = schedule.filter(s => s.done && s.date === t).length;
    const pendS = schedule.filter(s => !s.done && s.date <= t).length;
    parts.push(`📌 日程：${doneS}已完成 / ${pendS}待处理`);

    const hDone = habits.filter(h => { const r=h.records&&h.records[t]; return h.mode==='check'?!!r:(r!==undefined&&r!==''); }).length;
    parts.push(`🐾 习惯 ${hDone}/${habits.length}`);

    const qn = (wx.getStorageSync('qn_' + t)||'').trim();
    if (qn) parts.push(`📝 随手记：${qn.slice(0,40)}`);

    const out = finance.filter(f=>f.type==='expense'&&f.date&&f.date.startsWith(t.slice(0,7))).reduce((a,f)=>a+Number(f.amount)||0,0);
    parts.push(`💰 本月 ¥${out.toFixed(0)}`);

    const activeG = goals.filter(g => {const ms=g.milestones||[]; return ms.length===0||ms.some(m=>!m.done);});
    if (activeG.length) parts.push(`🎯 ${activeG.length}个进行中目标`);

    if (this.data.done||this.data.grate||this.data.next)
      parts.push(`📔 你已记录：${[this.data.done,this.data.grate,this.data.next].filter(Boolean).join('；')}`);

    parts.push(doneS+hDone>0?'节奏很稳 🐱':'循序渐进就好。');

    this.setData({ aiText: `【${t} 一日总结 · AI 归纳】\n` + parts.join('\n') });
    wx.showToast({ title: '✨ 已生成', icon: 'success' });
  },

  copyAi() { wx.setClipboardData({ data: this.data.aiText }); }
});
