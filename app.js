App({
  onLaunch() {
    // 初始化云开发（callContainer 需要）
    if (wx.cloud) {
      wx.cloud.init({
        env: 'dada-d9gw8x8fb426caba5',
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
  silentLogin() {
    const token = wx.getStorageSync('token')
    if (token) return // 已有 token，不需要重新登录

    wx.login({
      success: (res) => {
        if (!res.code) return
        // 调用后端登录接口换取 token
        wx.cloud.callContainer({
          config: { env: 'dada-d9gw8x8fb426caba5' },
          path: '/api/user/login',
          method: 'POST',
          service: 'dada-server',
          data: { code: res.code },
          header: { 'Content-Type': 'application/json' },
          success: (result) => {
            const data = result.data
            if (result.statusCode === 200 && data && data.code === 0) {
              wx.setStorageSync('token', data.data.token)
              wx.setStorageSync('userInfo', data.data.userInfo)
              this.globalData.userInfo = data.data.userInfo
            }
          },
          fail: (err) => {
            console.warn('[App] 静默登录失败:', err.errMsg)
          }
        })
      }
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
