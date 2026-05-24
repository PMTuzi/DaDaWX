// pages/mine/mine.js
// 使用微信头像昵称填写能力（wx.getUserProfile 已废弃）
const { request, API, ensureLogin, uploadImage, saveLocalPhoto } = require('../../utils/api')

Page({
  data: {
    userInfo: null,
    hasReport: false,
    reportCount: 0,
    favoriteCount: 0,
    consultCount: 0,
    isLoggedIn: false
  },

  onLoad() {
    this.loadUserInfo()
  },

  onShow() {
    this.loadUserInfo()
  },

  loadUserInfo() {
    const token = wx.getStorageSync('token')
    let userInfo = wx.getStorageSync('userInfo')

    // 清理无效的临时头像路径（热重载后失效）
    if (userInfo && userInfo.avatarUrl && this._isTempUrl(userInfo.avatarUrl)) {
      userInfo.avatarUrl = ''
      wx.setStorageSync('userInfo', userInfo)
    }

    const reports = wx.getStorageSync('reports') || []
    const favorites = wx.getStorageSync('favorites') || []
    const consults = wx.getStorageSync('consultRecords') || []
    this.setData({
      userInfo,
      isLoggedIn: !!token,
      hasReport: reports.length > 0,
      reportCount: reports.length,
      favoriteCount: favorites.length,
      consultCount: consults.length
    })

    // 已登录时从服务端同步最新用户信息
    if (token) {
      this.syncUserProfile()
    }
  },

  // 从服务端同步用户信息
  async syncUserProfile() {
    try {
      const res = await request(API.getProfile, { method: 'GET' })
      if (res && res.code === 0 && res.data) {
        const serverInfo = res.data
        const userInfo = {
          openid: serverInfo.openid,
          nickName: serverInfo.nickName || '搭搭用户',
          avatarUrl: serverInfo.avatarUrl || ''
        }
        wx.setStorageSync('userInfo', userInfo)
        this.setData({ userInfo })
      }
    } catch (e) {
      // 静默失败
    }
  },

  // 点击头像区域 - 未登录时触发登录
  async onTapUserHeader() {
    if (this.data.isLoggedIn) return
    try {
      await ensureLogin()
      this.loadUserInfo()
    } catch (e) {
      wx.showToast({ title: '登录失败，请重试', icon: 'none' })
    }
  },

  // 头像图片加载失败
  onAvatarError() {
    const userInfo = this.data.userInfo || {}
    userInfo.avatarUrl = ''
    this.setData({ userInfo })
    wx.setStorageSync('userInfo', userInfo)
  },

  // 判断是否为临时URL（会话内有效，热重载后失效）
  _isTempUrl(url) {
    if (!url) return false
    return url.startsWith('http://127.0.0.1') || url.startsWith('wxfile://') || url.includes('/__tmp__/')
  },

  // 选择头像（微信头像昵称填写能力）
  async onChooseAvatar(e) {
    const tempUrl = e.detail.avatarUrl
    if (!tempUrl) return
    if (this._chooseAvatarInFlight) return  // 防双击：避免 another chooseAvatar in progress
    this._chooseAvatarInFlight = true

    try {
      // 先持久化到本地（wxfile://），再渲染——避免 http://127.0.0.1/__tmp__ 时序失效
      const persistPath = await saveLocalPhoto(tempUrl)
      const userInfo = this.data.userInfo || {}
      userInfo.avatarUrl = persistPath || tempUrl
      this.setData({ userInfo })

      // 上传到 OSS 获取永久URL
      const cloudUrl = await uploadImage(persistPath || tempUrl)
      userInfo.avatarUrl = cloudUrl
      this.setData({ userInfo })
      wx.setStorageSync('userInfo', userInfo)
      this.updateProfileToServer({ avatarUrl: cloudUrl })
    } catch (err) {
      console.warn('[mine] 头像上传失败:', err.message)
      wx.showToast({ title: '头像上传失败', icon: 'none' })
    } finally {
      this._chooseAvatarInFlight = false
    }
  },

  // 输入昵称
  onNicknameInput(e) {
    const nickName = e.detail.value
    if (!nickName) return

    const userInfo = this.data.userInfo || {}
    userInfo.nickName = nickName
    this.setData({ userInfo })
    wx.setStorageSync('userInfo', userInfo)

    // 上传到服务端
    this.updateProfileToServer({ nickName })
  },

  // 更新用户信息到服务端
  async updateProfileToServer(updates) {
    try {
      await ensureLogin()
      await request(API.updateProfile, {
        method: 'PUT',
        data: updates
      })
    } catch (e) {
      console.warn('[mine] 更新用户信息失败:', e.message)
    }
  },

  onGoReports() {
    this.requireLogin(() => {
      wx.navigateTo({ url: '/pages/reports/reports' })
    })
  },

  onGoBeautyPlan() {
    wx.navigateTo({ url: '/pages/beauty-plan/beauty-plan' })
  },

  onGoConsultHistory() {
    this.requireLogin(() => {
      wx.switchTab({ url: '/pages/outfit/outfit' })
    })
  },

  onGoFavorites() {
    this.requireLogin(() => {
      wx.navigateTo({ url: '/pages/favorites/favorites' })
    })
  },

  onGoDiagnose() {
    this.requireLogin(() => {
      wx.navigateTo({ url: '/pages/diagnose/diagnose' })
    })
  },

  // 登录拦截：未登录时先登录再执行操作
  async requireLogin(callback) {
    const token = wx.getStorageSync('token')
    if (token) {
      callback()
      return
    }
    try {
      await ensureLogin()
      this.loadUserInfo()
      callback()
    } catch (e) {
      wx.showToast({ title: '请先登录', icon: 'none' })
    }
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
          this.setData({ userInfo: null, isLoggedIn: false })
          wx.showToast({ title: '已退出', icon: 'success' })
        }
      }
    })
  }
})
