// pages/report/report.js
const { getScoreLevel, getSeasonName, getMatchLevel } = require('../../utils/format')

Page({
  data: {
    report: null,
    scoreLevel: null,
    currentSection: 0,
    sections: [
      { key: 'summary', name: '综合建议', icon: 'note' },
      { key: 'faceShape', name: '脸型分析', icon: 'search' },
      { key: 'skinColor', name: '肤色诊断', icon: 'palette' },
      { key: 'style', name: '风格基因', icon: 'sparkle' },
      { key: 'bodyShape', name: '身形适配', icon: 'ruler' },
      { key: 'outfitItems', name: '穿搭推荐', icon: 'dress' },
      { key: 'hairRecommend', name: '发型推荐', icon: 'hair' },
      { key: 'makeup', name: '妆容指南', icon: 'makeup' }
    ],
    expandedSections: {},
    scrollTarget: ''
  },

  onLoad(options) {
    const id = options.id
    const reports = wx.getStorageSync('reports') || []
    const report = reports.find(r => r.id === id)
    if (report) {
      this.setData({
        report,
        scoreLevel: getScoreLevel(report.basic?.overallScore || 0)
      })
    } else {
      wx.showToast({ title: '报告不存在', icon: 'none' })
      setTimeout(() => wx.navigateBack(), 1500)
    }
  },

  // 点击导航，滚动到对应板块
  onSectionTap(e) {
    const index = e.currentTarget.dataset.index
    this.setData({
      currentSection: index,
      scrollTarget: `section-${index}`
    })
  },

  // 展开/收起
  onToggleSection(e) {
    const key = e.currentTarget.dataset.key
    const expanded = { ...this.data.expandedSections }
    expanded[key] = !expanded[key]
    this.setData({ expandedSections: expanded })
  },

  // 查看详情页
  onViewDetail(e) {
    const key = e.currentTarget.dataset.key
    const id = this.data.report.id
    wx.navigateTo({ url: `/pages/report-detail/report-detail?id=${id}&section=${key}` })
  },

  // 分享

  onShareAppMessage() {
    const report = this.data.report
    return {
      title: `我的AI形象评分 ${report?.basic?.overallScore || ''}分 — 搭搭`,
      path: `/pages/index/index`,
      imageUrl: ''
    }
  },

  // 重新诊断
  onReDiagnose() {
    wx.redirectTo({ url: '/pages/diagnose/diagnose' })
  }
})
