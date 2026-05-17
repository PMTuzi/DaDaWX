App({
  onLaunch() {
    // 初始化云开发（如需）
    const logs = wx.getStorageSync('logs') || []
    logs.unshift(Date.now())
    wx.setStorageSync('logs', logs)
  },
  globalData: {
    userInfo: null,
    latestReport: null,
    reports: []
  }
})
