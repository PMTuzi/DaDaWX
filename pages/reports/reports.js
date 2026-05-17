// pages/reports/reports.js
Page({
  data: {
    reports: []
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
  }
})
