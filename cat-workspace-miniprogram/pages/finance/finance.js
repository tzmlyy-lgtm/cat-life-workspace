Page({
  data: {
    records: [], monthOut: 0, monthIn: 0, balance: 0,
    formType: 'expense', formAmount: '', formCategory: '', formNote: ''
  },

  onLoad() { this.load(); },
  onShow() { this.load(); },

  load() {
    const d = new Date();
    const ym = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
    const list = (wx.getStorageSync('finance') || []).sort((a,b) => (b.date||'').localeCompare(a.date||''));
    let out = 0, inc = 0;
    list.forEach(f => {
      if (f.date && f.date.startsWith(ym)) {
        if (f.type === 'expense') out += Number(f.amount) || 0;
        else inc += Number(f.amount) || 0;
      }
    });
    this.setData({ records: list.slice(0, 30), monthOut: out.toFixed(0), monthIn: inc.toFixed(0), balance: (inc - out).toFixed(0) });
  },

  setType(e) { this.setData({ formType: e.currentTarget.dataset.type }); },
  onAmtInput(e) { this.setData({ formAmount: e.detail.value }); },
  onCatInput(e) { this.setData({ formCategory: e.detail.value }); },
  onNoteInput(e) { this.setData({ formNote: e.detail.value }); },

  saveRecord() {
    const amt = Number(this.data.formAmount);
    if (!amt || amt <= 0) { wx.showToast({ title: '请输入有效金额', icon: 'none' }); return; }
    const list = wx.getStorageSync('finance') || [];
    const d = new Date();
    list.unshift({
      id: 'f' + Date.now(),
      type: this.data.formType,
      amount: amt,
      category: this.data.formCategory.trim(),
      note: this.data.formNote.trim(),
      date: `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
    });
    wx.setStorageSync('finance', list);
    this.setData({ formAmount: '', formCategory: '', formNote: '' }); this.load();
    wx.showToast({ title: '已记录', icon: 'success' });
  },

  delRec(e) {
    wx.showModal({
      title: '确认删除',
      success: res => {
        if (res.confirm) {
          const list = (wx.getStorageSync('finance') || []).filter(x => x.id !== e.currentTarget.dataset.id);
          wx.setStorageSync('finance', list); this.load();
        }
      }
    });
  }
});
