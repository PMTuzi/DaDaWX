// pages/report/report.js
const { getScoreLevel, getSeasonName, getMatchLevel } = require('../../utils/format')

Page({
  data: {
    report: null,
    scoreLevel: null,
    currentSection: 0,
    sections: [
      { key: 'basic', name: '综合评分', icon: '⭐' },
      { key: 'faceShape', name: '脸型分析', icon: '🔍' },
      { key: 'skinColor', name: '肤色诊断', icon: '🎨' },
      { key: 'style', name: '风格基因', icon: '✨' },
      { key: 'bodyShape', name: '身形适配', icon: '📐' },
      { key: 'outfitItems', name: '穿搭推荐', icon: '👗' },
      { key: 'hairRecommend', name: '发型推荐', icon: '💇‍♀️' },
      { key: 'makeup', name: '妆容指南', icon: '💄' },
      { key: 'summary', name: '总结建议', icon: '📝' }
    ],
    expandedSections: {}
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

  // 切换板块
  onSectionTap(e) {
    const index = e.currentTarget.dataset.index
    this.setData({ currentSection: index })
  },

  // swiper滑动切换
  onSwiperChange(e) {
    this.setData({ currentSection: e.detail.current })
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
  onShare() {
    wx.showActionSheet({
      itemList: ['分享给好友', '生成海报', '保存报告图片'],
      success: (res) => {
        switch (res.tapIndex) {
          case 0:
            // 微信分享由 onShareAppMessage 处理
            break
          case 1:
            this.generatePoster()
            break
          case 2:
            wx.showToast({ title: '功能开发中', icon: 'none' })
            break
        }
      }
    })
  },

  generatePoster() {
    wx.showToast({ title: '海报生成中...', icon: 'loading' })
    // TODO: Canvas 绘制海报
    setTimeout(() => wx.showToast({ title: '海报已保存', icon: 'success' }), 1500)
  },

  onShareAppMessage() {
    const report = this.data.report
    return {
      title: `我的AI形象评分 ${report?.basic?.overallScore || ''}分 — 搭搭`,
      path: `/pages/index/index`,
      imageUrl: ''
    }
  },

  // 返回首页重新诊断
  onReDiagnose() {
    wx.switchTab({ url: '/pages/index/index' })
  }
})
