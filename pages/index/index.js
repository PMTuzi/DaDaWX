// pages/index/index.js
const { wxLogin, ensureLogin, request, API, uploadImage } = require('../../utils/api')
const { formatDate, getScoreLevel } = require('../../utils/format')

Page({
  data: {
    slogan: '国内首款「反种草」AI 形象诊断平台',
    hasReport: false,
    latestReport: null,
    scoreLevel: null,
    bannerImage: '/images/finalbanner2.jpg',
    tickerList: [],
    // 登录确认弹窗
    showLoginModal: false,
    loginAvatarUrl: '',
    loginNickname: '',
    pendingAction: '' // 'diagnose' | 'outfit'
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

  // 立即诊断 - 需要登录确认
  onStartDiagnose() {
    this.requireLogin('diagnose')
  },

  // 穿搭决策 - 需要登录确认
  onGoOutfit() {
    this.requireLogin('outfit')
  },

  // 登录拦截：检查是否需要弹出登录确认
  async requireLogin(action) {
    const token = wx.getStorageSync('token')
    const userInfo = wx.getStorageSync('userInfo')

    // 已登录且有头像昵称，直接进入
    if (token && userInfo && userInfo.avatarUrl && userInfo.nickName && userInfo.nickName !== '搭搭用户') {
      this.navigateTo(action)
      return
    }

    // 需要登录确认：先确保静默登录完成
    try {
      await ensureLogin()
    } catch (e) {
      wx.showToast({ title: '登录失败，请重试', icon: 'none' })
      return
    }

    // 再次检查是否有完整资料
    const info = wx.getStorageSync('userInfo')
    // 清理临时头像URL
    const hasValidAvatar = info?.avatarUrl && !this._isTempUrl(info.avatarUrl)
    if (info && hasValidAvatar && info.nickName && info.nickName !== '搭搭用户') {
      this.navigateTo(action)
      return
    }

    // 弹出登录确认弹窗
    this.setData({
      showLoginModal: true,
      pendingAction: action,
      loginAvatarUrl: hasValidAvatar ? info.avatarUrl : '',
      loginNickname: info?.nickName || ''
    })
  },

  // 判断是否为临时URL
  _isTempUrl(url) {
    if (!url) return false
    return url.startsWith('http://127.0.0.1') || url.startsWith('wxfile://') || url.includes('/__tmp__/')
  },

  // 选择头像
  onChooseAvatar(e) {
    const avatarUrl = e.detail.avatarUrl
    if (avatarUrl) {
      this.setData({ loginAvatarUrl: avatarUrl })
    }
  },

  // 输入昵称
  onNicknameInput(e) {
    this.setData({ loginNickname: e.detail.value })
  },

  // 确认登录
  async onConfirmLogin() {
    const { loginAvatarUrl, loginNickname, pendingAction } = this.data

    if (!loginNickname || !loginNickname.trim()) {
      wx.showToast({ title: '请输入昵称', icon: 'none' })
      return
    }

    wx.showLoading({ title: '保存中...' })

    // 上传头像到云存储（如果是临时路径）
    let avatarCloudUrl = loginAvatarUrl
    if (loginAvatarUrl && (loginAvatarUrl.startsWith('http://127.0.0.1') || loginAvatarUrl.startsWith('wxfile://'))) {
      try {
        avatarCloudUrl = await uploadImage(loginAvatarUrl)
      } catch (err) {
        console.warn('[index] 头像上传失败:', err.message)
        avatarCloudUrl = ''
      }
    }

    // 保存用户信息
    const userInfo = {
      ...wx.getStorageSync('userInfo'),
      avatarUrl: avatarCloudUrl,
      nickName: loginNickname.trim(),
      openid: wx.getStorageSync('userInfo')?.openid || ''
    }
    wx.setStorageSync('userInfo', userInfo)

    // 同步到服务端
    try {
      const updates = {}
      if (avatarCloudUrl) updates.avatarUrl = avatarCloudUrl
      if (loginNickname) updates.nickName = loginNickname.trim()
      await request(API.updateProfile, {
        method: 'PUT',
        data: updates
      })
    } catch (e) {
      console.warn('[index] 同步用户信息失败:', e.message)
    }

    wx.hideLoading()
    this.setData({ showLoginModal: false, pendingAction: '' })
    this.navigateTo(pendingAction)
  },

  // 关闭登录弹窗
  onCloseLoginModal() {
    this.setData({ showLoginModal: false, pendingAction: '' })
  },

  // 阻止弹窗内部点击冒泡
  onPreventBubble() {},

  navigateTo(action) {
    if (action === 'diagnose') {
      wx.navigateTo({ url: '/pages/diagnose/diagnose' })
    } else if (action === 'outfit') {
      wx.navigateTo({ url: '/pages/outfit/outfit' })
    }
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
