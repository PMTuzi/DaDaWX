// pages/report-detail/report-detail.js
Page({
  data: {
    section: '',
    sectionName: '',
    report: null
  },

  onLoad(options) {
    const section = options.section || 'basic'
    const id = options.id
    const reports = wx.getStorageSync('reports') || []
    const report = reports.find(r => r.id === id)

    const nameMap = {
      basic: '综合评分',
      faceShape: '脸型分析',
      skinColor: '肤色诊断',
      style: '风格基因',
      bodyShape: '身形适配',
      outfitItems: '穿搭推荐',
      hairRecommend: '发型推荐',
      makeup: '妆容指南',
      summary: '总结建议'
    }

    if (report) {
      this.setData({
        section,
        sectionName: nameMap[section] || section,
        report
      })
    }
  }
})
