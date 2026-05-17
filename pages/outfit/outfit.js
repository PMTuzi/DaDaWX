// pages/outfit/outfit.js
const app = getApp()

Page({
  data: {
    hasReport: false,
    consultCards: [
      {
        type: 'buy',
        title: '买不买',
        subtitle: '想买又犹豫？AI帮你看值不值',
        icon: '🛍️',
        gradient: 'linear-gradient(135deg, #667eea, #764ba2)'
      },
      {
        type: 'keep',
        title: '留不留',
        subtitle: '退货还是留下？AI帮你做决定',
        icon: '🤔',
        gradient: 'linear-gradient(135deg, #f093fb, #f5576c)'
      },
      {
        type: 'compare',
        title: '选哪个',
        subtitle: '几件纠结选哪件？AI帮你横向对比',
        icon: '⚖️',
        gradient: 'linear-gradient(135deg, #4facfe, #00f2fe)'
      }
    ],
    recentConsults: [],
    showHistory: false
  },

  onLoad() {
    this.checkReport()
    this.loadHistory()
  },

  onShow() {
    this.checkReport()
    this.loadHistory()
  },

  checkReport() {
    const reports = wx.getStorageSync('reports') || []
    this.setData({ hasReport: reports.length > 0 })
  },

  loadHistory() {
    const consults = wx.getStorageSync('consultRecords') || []
    this.setData({
      recentConsults: consults.slice(0, 5),
      showHistory: consults.length > 0
    })
  },

  onCardTap(e) {
    const type = e.currentTarget.dataset.type
    wx.navigateTo({
      url: `/pages/consult-publish/consult-publish?type=${type}`
    })
  },

  onViewResult(e) {
    const id = e.currentTarget.dataset.id
    wx.navigateTo({
      url: `/pages/consult-result/consult-result?id=${id}`
    })
  },

  onGoDiagnose() {
    wx.navigateTo({ url: '/pages/diagnose/diagnose' })
  }
})
