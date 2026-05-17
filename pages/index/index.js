// pages/index/index.js
const { wxLogin, runDiagnosis } = require('../../utils/api')
const { formatDate, getScoreLevel } = require('../../utils/format')

Page({
  data: {
    slogan: '国内首款「反种草」AI 形象诊断平台',
    hasReport: false,
    latestReport: null,
    scoreLevel: null
  },

  onLoad() {
    this.checkLogin()
    this.loadLatestReport()
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
  onGoHairStyle() {
    wx.switchTab({ url: '/pages/hairstyle/hairstyle' })
  },

  onGoOutfit() {
    wx.switchTab({ url: '/pages/outfit/outfit' })
  },

  onGoMakeup() {
    wx.navigateTo({ url: '/pages/makeup/makeup' })
  }
})
