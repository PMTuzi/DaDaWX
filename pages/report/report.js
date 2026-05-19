// pages/report/report.js
// 新架构：纯图片展示报告

Page({
  data: {
    report: null,
    activeTab: 'dna',
    tabKeys: ['dna', 'style', 'hairmakeup', 'optimize'],
    images: {},
    shared: false
  },

  onLoad(options) {
    const id = options.id
    const reports = wx.getStorageSync('reports') || []
    const report = reports.find(r => r.id === id)

    if (!report) {
      wx.showToast({ title: '报告不存在', icon: 'none' })
      setTimeout(() => wx.navigateBack(), 1500)
      return
    }

    this.setData({
      report,
      images: report.images || {}
    })
  },

  onTabTap(e) {
    const tab = e.currentTarget.dataset.tab
    this.setData({ activeTab: tab })
  },

  // 图片预览
  onImagePreview(e) {
    const url = e.currentTarget.dataset.url
    if (!url) return
    const allUrls = this.data.tabKeys
      .map(k => this.data.images[k])
      .filter(v => v)

    wx.previewImage({
      current: url,
      urls: allUrls
    })
  },

  // 保存全部图片到相册
  async onSaveAllImages() {
    if (!this.data.shared) {
      wx.showToast({ title: '请先分享解锁', icon: 'none' })
      return
    }
    const images = this.data.images
    const urls = this.data.tabKeys
      .map(k => images[k])
      .filter(v => v)

    if (urls.length === 0) {
      wx.showToast({ title: '暂无图片', icon: 'none' })
      return
    }

    // 先请求相册权限
    try {
      await new Promise((resolve, reject) => {
        wx.authorize({
          scope: 'scope.writePhotosAlbum',
          success: resolve,
          fail: reject
        })
      })
    } catch (e) {
      wx.showModal({
        title: '需要相册权限',
        content: '请在设置中开启相册访问权限',
        confirmText: '去设置',
        success: (res) => {
          if (res.confirm) wx.openSetting()
        }
      })
      return
    }

    wx.showLoading({ title: '保存中...' })
    let saved = 0
    let failed = 0

    for (const url of urls) {
      try {
        const downloadRes = await new Promise((resolve, reject) => {
          wx.downloadFile({
            url,
            success: resolve,
            fail: reject
          })
        })
        if (downloadRes.statusCode === 200) {
          await new Promise((resolve, reject) => {
            wx.saveImageToPhotosAlbum({
              filePath: downloadRes.tempFilePath,
              success: resolve,
              fail: reject
            })
          })
          saved++
        } else {
          failed++
        }
      } catch (e) {
        failed++
        console.warn('保存图片失败:', url, e.message)
      }
    }

    wx.hideLoading()

    if (failed === 0) {
      wx.showToast({ title: `已保存${saved}张图片`, icon: 'success' })
    } else {
      wx.showToast({ title: `${saved}张成功，${failed}张失败`, icon: 'none' })
    }
  },

  // 重新诊断
  onReDiagnose() {
    if (!this.data.shared) {
      wx.showToast({ title: '请先分享解锁', icon: 'none' })
      return
    }
    wx.navigateTo({ url: '/pages/diagnose/diagnose' })
  },

  // 分享
  onShareAppMessage() {
    if (!this.data.shared) {
      this.setData({ shared: true })
    }
    return {
      title: '我的AI形象诊断报告',
      path: '/pages/index/index'
    }
  }
})
