// pages/report/report.js
const { request, API } = require('../../utils/api')
const { getScoreLevel } = require('../../utils/format')

Page({
  data: {
    report: null,
    scoreLevel: null,
    activeTab: 'bone',
    tabIndex: 0,
    posters: {},
    // 4个模块数据
    bone: {},
    skin: {},
    colorStyle: {},
    outfit: {}
  },

  onLoad(options) {
    const id = options.id
    const reports = wx.getStorageSync('reports') || []
    const report = reports.find(r => r.id === id)

    if (!report) {
      wx.showToast({ title: '报告不存在', icon: 'none' })
      setTimeout(() => wx.navigateBack(), 1500)
      return
    }

    // 从 modules 中提取各模块数据
    const modules = report.modules || {}
    const bone = modules.bone || this._extractBoneFromLegacy(report)
    const skin = modules.skin || this._extractSkinFromLegacy(report)
    const colorStyle = modules.colorStyle || this._extractColorFromLegacy(report)
    const outfit = modules.outfit || this._extractOutfitFromLegacy(report)

    this.setData({
      report,
      scoreLevel: getScoreLevel(report.basic?.overallScore || 0),
      bone,
      skin,
      colorStyle,
      outfit
    })

    // 尝试加载海报
    this._loadPosters(report)
  },

  // Tab切换
  onTabTap(e) {
    const tab = e.currentTarget.dataset.tab
    const tabMap = { bone: 0, skin: 1, colorStyle: 2, outfit: 3 }
    this.setData({ activeTab: tab, tabIndex: tabMap[tab] })
  },

  // Swiper滑动切换
  onSwiperChange(e) {
    const index = e.detail.current
    const tabs = ['bone', 'skin', 'colorStyle', 'outfit']
    this.setData({ activeTab: tabs[index], tabIndex: index })
  },

  // 加载海报（非阻塞）
  async _loadPosters(report) {
    const modules = ['bone', 'skin', 'colorStyle', 'outfit']
    for (const mod of modules) {
      try {
        const result = await request('/api/ai/generate-poster', {
          method: 'POST',
          data: { module: mod, reportData: report },
          timeout: 30000
        })
        if (result.code === 0 && result.data.imageUrl) {
          this.setData({ [`posters.${mod}`]: result.data.imageUrl })
        }
      } catch (e) {
        // 海报生成失败不影响报告展示
      }
    }
  },

  // 兼容旧数据格式
  _extractBoneFromLegacy(report) {
    if (!report.faceShape) return {}
    return {
      title: '骨相分析',
      faceType: report.faceShape.type,
      faceScore: report.faceShape.score,
      boneType: report.faceShape.boneType || '待分析',
      boneDesc: report.faceShape.boneDesc || '',
      threeCourts: report.faceShape.threeCourts || {},
      fiveEyes: report.faceShape.fiveEyes || {},
      faceFeatures: report.faceShape.faceFeatures || [],
      suitableHaircuts: report.faceShape.suitableHaircuts || [],
      avoidHaircuts: report.faceShape.avoidHaircuts || [],
      suitableCollars: report.faceShape.suitableCollars || [],
      keyInsight: report.faceShape.keyInsight || ''
    }
  },

  _extractSkinFromLegacy(report) {
    if (!report.skinColor) return {}
    const sc = report.skinColor
    return {
      title: '皮肤状态',
      skinType: sc.type,
      brightness: sc.brightness,
      purity: sc.purity,
      overallDesc: sc.seasonDetail || '',
      problems: sc.problems || [],
      season: sc.season,
      seasonDetail: sc.seasonDetail || '',
      goodColors: sc.goodColors || [],
      badColors: sc.badColors || [],
      goodHairColors: sc.goodHairColors || [],
      badHairColors: sc.badHairColors || [],
      skincareAdvice: sc.skincareAdvice || [],
      keyInsight: sc.keyInsight || ''
    }
  },

  _extractColorFromLegacy(report) {
    if (!report.style) return {}
    const st = report.style
    return {
      title: '色彩风格',
      mainStyle: st.mainStyle,
      mainScore: st.mainScore,
      styleDesc: st.styleDesc || '',
      subStyles: st.subStyles || [],
      styleFeatures: st.features || {},
      colorPalette: st.colorPalette || {},
      clothingAdvice: st.clothingAdvice || {},
      sceneAdvice: st.sceneAdvice || [],
      outfitItems: (report.outfitItems || {}).recommended || [],
      avoidItems: (report.outfitItems || {}).avoidItems || [],
      keyInsight: st.keyInsight || ''
    }
  },

  _extractOutfitFromLegacy(report) {
    return {
      title: '穿搭风格',
      hairRecommend: report.hairRecommend || { top3: [], alternatives: [], hairColors: [], avoidHair: [] },
      makeup: report.makeup || { style: '待分析', foundation: {}, eyeBrow: {}, lipRecommend: {}, avoidMakeup: [] },
      bodyShape: report.bodyShape || { shoulderType: '待分析', bodyRatio: '待分析', suitableTop: [], suitableBottom: [], avoidStyles: [], tips: [] },
      summary: report.summary || { coreConclusion: '', priorityAdvice: '', dailyTips: [] },
      keyInsight: (report.summary || {}).coreConclusion || ''
    }
  },

  onShareAppMessage() {
    const report = this.data.report
    return {
      title: `我的AI形象评分 ${report?.basic?.overallScore || ''}分 — 搭搭`,
      path: '/pages/index/index'
    }
  },

  onReDiagnose() {
    wx.redirectTo({ url: '/pages/diagnose/diagnose' })
  }
})
