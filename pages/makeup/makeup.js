// pages/makeup/makeup.js
Page({
  data: {
    hasReport: false,
    report: null,
    makeupGuide: null
  },

  onLoad() {
    this.loadReportData()
  },

  onShow() {
    this.loadReportData()
  },

  loadReportData() {
    const reports = wx.getStorageSync('reports') || []
    if (reports.length > 0) {
      const report = reports[0]
      this.setData({ hasReport: true, report })
      this.buildMakeupGuide(report)
    }
  },

  buildMakeupGuide(report) {
    // 基于报告数据构建妆容指南
    const makeup = report.makeup || {}
    this.setData({
      makeupGuide: {
        style: makeup.style || '待诊断',
        foundation: makeup.foundation || {},
        eyeBrow: makeup.eyeBrow || {},
        lipRecommend: makeup.lipRecommend || {},
        avoidMakeup: makeup.avoidMakeup || []
      }
    })
  },

  onGoDiagnose() {
    wx.navigateTo({ url: '/pages/diagnose/diagnose' })
  }
})
