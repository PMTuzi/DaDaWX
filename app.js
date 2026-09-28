
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
