// pages/report/report.js
// 报告页已合并进首页（pages/index/index）。
// 本页保留作为旧链接 / 分享链接 / 历史调用方的中转页：
// 把目标 reportId 写入 storage，然后切换到 tabBar 首页统一渲染完整报告。
Page({
  onLoad(options) {
    try {
      const id = options && options.id ? String(options.id) : ''
      if (id) {
        wx.setStorageSync('pendingReportId', id)
      } else {
        // 无 id 视为查看最新报告
        wx.removeStorageSync('pendingReportId')
      }
    } catch (e) {}

    // index 是 tabBar 页，必须用 switchTab
    wx.switchTab({
      url: '/pages/index/index',
      fail: () => {
        wx.redirectTo({ url: '/pages/index/index' })
      }
    })
  }
})
