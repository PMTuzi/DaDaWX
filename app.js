App({
  onLaunch() {
    // 初始化云开发（callContainer 需要）
    if (wx.cloud) {
      wx.cloud.init({
        env: 'dada0810-d6g6aowp1aeffc3ce',
        traceUser: true,
      })
    }
    const logs = wx.getStorageSync('logs') || []
    logs.unshift(Date.now())
    wx.setStorageSync('logs', logs)

    // 静默登录：确保进入小程序就有 token
    this.silentLogin()
  },

  // 静默登录（wx.login → 获取 openid + token，用户无感）
  // 复用 utils/api 的 wxLogin：自带 3 次重试 + 102002 自动 fallback 到 HTTP 直连。
  // 手机预览时云托管容器常是冷的，首发大概率 102002，裸调 callContainer 会直接失败拿不到 token。
  silentLogin() {
    const token = wx.getStorageSync('token')
    if (token) return // 已有 token，不需要重新登录

    const { wxLogin } = require('./utils/api')
    wxLogin().then((data) => {
      this.globalData.userInfo = data && data.userInfo
    }).catch((err) => {
      console.warn('[App] 静默登录失败:', (err && (err.message || err.errMsg)) || err)
    })
  },

  onError(err) {
    console.error('[App] 全局错误:', err)
  },
  globalData: {
    userInfo: null,
    latestReport: null,
    reports: []
  }
})
