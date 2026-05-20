// pages/mine/mine.js
Page({
  data: {
    userInfo: null,
    hasReport: false,
    reportCount: 0,
    favoriteCount: 0,
    consultCount: 0
  },

  onLoad() {
    this.loadUserInfo()
  },

  onShow() {
    this.loadUserInfo()
  },

  loadUserInfo() {
    const userInfo = wx.getStorageSync('userInfo')
    const reports = wx.getStorageSync('reports') || []
    const favorites = wx.getStorageSync('favorites') || []
    const consults = wx.getStorageSync('consultRecords') || []
    this.setData({
      userInfo,
      hasReport: reports.length > 0,
      reportCount: reports.length,
      favoriteCount: favorites.length,
      consultCount: consults.length
    })
  },

  onGetUserProfile() {
    wx.getUserProfile({
      desc: '用于完善个人资料',
      success: (res) => {
        this.setData({ userInfo: res.userInfo })
        wx.setStorageSync('userInfo', res.userInfo)
      }
    })
  },

  onGoReports() {
    wx.navigateTo({ url: '/pages/reports/reports' })
  },

  onGoConsultHistory() {
    wx.navigateTo({ url: '/pages/outfit/outfit' })
  },

  onGoFavorites() {
    wx.navigateTo({ url: '/pages/favorites/favorites' })
  },

  onGoDiagnose() {
    wx.navigateTo({ url: '/pages/diagnose/diagnose' })
  },

  onContact() {
    wx.showToast({ title: '客服功能开发中', icon: 'none' })
  },

  onAbout() {
    wx.showModal({
      title: '关于美哒',
      content: '国内首款「反种草」AI 形象风格分析平台\n版本: 1.0.0\n\n基于美哒 Meeta自研大模型，为您提供专业级形象分析与穿搭决策。',
      showCancel: false
    })
  },

  onPrivacy() {
    wx.showModal({
      title: '隐私协议',
      content: '1. 您的照片仅用于AI分析，7天后自动清除\n2. 诊断报告存储在本地，不会上传至服务器\n3. 我们不会收集或分享您的个人信息\n4. 您可随时删除所有个人数据',
      showCancel: false
    })
  },

  onLogout() {
    wx.showModal({
      title: '确认退出',
      content: '退出后需要重新登录',
      success: (res) => {
        if (res.confirm) {
          wx.removeStorageSync('token')
          wx.removeStorageSync('userInfo')
          this.setData({ userInfo: null })
          wx.showToast({ title: '已退出', icon: 'success' })
        }
      }
    })
  }
})
