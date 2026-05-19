// pages/index/index.js
const { wxLogin, runDiagnosis } = require('../../utils/api')
const { formatDate, getScoreLevel } = require('../../utils/format')

Page({
  data: {
    slogan: '国内首款「反种草」AI 形象诊断平台',
    hasReport: false,
    latestReport: null,
    scoreLevel: null,
    bannerImage: '/images/finalbanner2.jpg',
    tickerList: []
  },

  onLoad() {
    this.checkLogin()
    this.loadLatestReport()
    this.generateTickerList()
  },

  onShow() {
    this.loadLatestReport()
  },

  async checkLogin() {
    const token = wx.getStorageSync('token')
    if (!token) {
      try {
        await wxLogin()
      } catch (e) {
        console.log('自动登录失败', e)
      }
    }
  },

  loadLatestReport() {
    const reports = wx.getStorageSync('reports') || []
    if (reports.length > 0) {
      const latest = reports[0]
      this.setData({
        hasReport: true,
        latestReport: latest,
        scoreLevel: getScoreLevel(latest.basic?.overallScore || 0)
      })
    }
  },

  // 立即诊断
  onStartDiagnose() {
    wx.navigateTo({ url: '/pages/diagnose/diagnose' })
  },

  // 查看最新报告
  onViewReport() {
    const reports = wx.getStorageSync('reports') || []
    if (reports.length > 0) {
      wx.navigateTo({ url: `/pages/report/report?id=${reports[0].id}` })
    }
  },

  // 查看历史报告
  onViewHistory() {
    wx.navigateTo({ url: '/pages/reports/reports' })
  },

  // 快捷入口
  onGoOutfit() {
    wx.navigateTo({ url: '/pages/outfit/outfit' })
  },

  // Banner点击
  onBannerTap() {
    // TODO: 跳转广告链接
  },

  onShareAppMessage() {
    return {
      title: '美哒AI - 你的「反种草」形象诊断师',
      path: '/pages/index/index',
      imageUrl: '/images/finalbanner1.jpg'
    }
  },

  generateTickerList() {
    const prefixes = ['小', '大', '阿', '懒', '快乐', '迷糊', '可爱', '甜甜', '温柔', '元气', '佛系', '资深', '野生', '倔强', '傲娇']
    const suffixes = ['橘猫', '桃子', '奶茶', '云朵', '草莓', '布丁', '西瓜', '棉花糖', '小熊', '柠檬', '椰子', '芒果', '松鼠', '鲸鱼', '星星', '泡芙', '果冻', '薯条', '饼干', '樱桃', '泡泡', '饭团', '抹茶', '可可', '豆豆', '糯米', '蜜桃', '柚子', '栗子', '奶酪']
    const actions = [
      '正在进行AI形象风格分析',
      '正在进行穿搭决策',
      '正在生成形象诊断报告',
      '正在查看发型推荐',
      '正在进行妆容分析',
      '正在获取风格建议',
      '正在进行色彩诊断'
    ]
    // 打乱数组，保证相邻项差异大
    const shuffle = arr => arr.slice().sort(() => Math.random() - 0.5)
    const sPrefixes = shuffle(prefixes)
    const sSuffixes = shuffle(suffixes)
    const sActions = shuffle(actions)
    const list = []
    for (let i = 0; i < 50; i++) {
      const prefix = sPrefixes[i % sPrefixes.length]
      const suffix = sSuffixes[i % sSuffixes.length]
      const action = sActions[i % sActions.length]
      list.push(`${prefix}${suffix.charAt(0)}****${action}`)
    }
    this.setData({ tickerList: list })
  }
})
