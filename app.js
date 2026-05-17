App({
  onLaunch() {
    // 初始化云开发（如需）
    const logs = wx.getStorageSync('logs') || []
    logs.unshift(Date.now())
    wx.setStorageSync('logs', logs)
  },
  onError(err) {
    console.error('[App] 全局错误:', err)
  },
  globalData: {
    userInfo: null,
    latestReport: null,
    reports: [],
    tempImageBase64: '' // 大图 base64 用 globalData 传递，避免 storage 1MB 限制
  }
})
