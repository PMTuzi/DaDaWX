// pages/reports/reports.js
Page({
  data: {
    reports: [],
    shared: false
  },

  onLoad() {
    this.loadReports()
  },

  onShow() {
    this.loadReports()
  },

  loadReports() {
    const reports = wx.getStorageSync('reports') || []
    this.setData({ reports })
  },

  onViewReport(e) {
    const id = e.currentTarget.dataset.id
    wx.navigateTo({ url: `/pages/report/report?id=${id}` })
  },

  onDeleteReport(e) {
    const id = e.currentTarget.dataset.id
    wx.showModal({
      title: '确认删除',
      content: '删除后无法恢复，确定要删除这份报告吗？',
      confirmColor: '#e74c3c',
      success: (res) => {
        if (res.confirm) {
          const reports = this.data.reports.filter(r => r.id !== id)
          wx.setStorageSync('reports', reports)
          this.setData({ reports })
          wx.showToast({ title: '已删除', icon: 'success' })
        }
      }
    })
  },

  onGoDiagnose() {
    wx.navigateTo({ url: '/pages/diagnose/diagnose' })
  },

  onReDiagnose() {
    if (!this.data.shared) {
      wx.showToast({ title: '请先分享解锁', icon: 'none' })
      return
    }
    wx.navigateTo({ url: '/pages/diagnose/diagnose' })
  },

  onShareAppMessage() {
    if (!this.data.shared) {
      this.setData({ shared: true })
    }
    return {
      title: 'AI形象诊断 - 发现你的专属风格密码',
      path: '/pages/index/index',
      imageUrl: '/images/finalbanner1.jpg'
    }
  }
})
