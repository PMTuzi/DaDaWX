// pages/diagnose/diagnose.js
const { request, API, uploadImage, ensureLogin } = require('../../utils/api')

Page({
  data: {
    photoType: 'face', // face | fullbody
    photoUrl: '',
    isUploading: false,
    guideVisible: true
  },

  onLoad(options) {
    if (options.type) {
      this.setData({ photoType: options.type })
    }
  },

  onError(err) {
    console.error('[diagnose] 页面错误:', err)
  },

  // 切换照片类型
  onSwitchType(e) {
    this.setData({ photoType: e.currentTarget.dataset.type })
  },

  // 选择照片（拍照或相册）
  onChoosePhoto() {
    try {
      wx.chooseMedia({
        count: 1,
        mediaType: ['image'],
        sourceType: ['album', 'camera'],
        camera: 'front',
        success: (res) => {
          try {
            this.setData({ photoUrl: res.tempFiles[0].tempFilePath, guideVisible: false })
          } catch (e) {
            console.error('[diagnose] 选择照片回调出错:', e)
          }
        },
        fail: (err) => {
          if (err.errMsg && err.errMsg.indexOf('cancel') > -1) return
          console.warn('[diagnose] chooseMedia 失败:', err.errMsg)
        }
      })
    } catch (e) {
      // chooseMedia 不可用时降级
      wx.chooseImage({
        count: 1,
        sizeType: ['compressed'],
        sourceType: ['album', 'camera'],
        success: (res) => {
          try {
            this.setData({ photoUrl: res.tempFilePaths[0], guideVisible: false })
          } catch (e2) {}
        },
        fail: () => {}
      })
    }
  },

  // 重新选择
  onRechoose() {
    this.setData({ photoUrl: '', guideVisible: true })
  },

  // 开始分析
  async onStartAnalysis() {
    if (!this.data.photoUrl) {
      wx.showToast({ title: '请先上传照片', icon: 'none' })
      return
    }

    // 登录拦截：确保用户已登录
    try {
      await ensureLogin()
    } catch (e) {
      wx.showToast({ title: '请先登录', icon: 'none' })
      return
    }

    this.setData({ isUploading: true })

    try {
      // 先持久化本地副本，避免微信清理 http://tmp 路径导致后续读取失败
      const { uploadImage, saveLocalPhoto } = require('../../utils/api')
      const savedPhoto = await saveLocalPhoto(this.data.photoUrl)
      const sourcePath = savedPhoto || this.data.photoUrl

      // 仅 OSS 直传，失败直接报错（架构已纯 OSS 化）
      let imageUrl = ''
      let lastErr
      for (let i = 0; i < 2; i++) {
        try {
          imageUrl = await uploadImage(sourcePath)
          if (imageUrl && /^https?:\/\//.test(imageUrl)) break
        } catch (err) {
          lastErr = err
          console.warn(`[diagnose] OSS 上传失败 (第${i + 1}次):`, err && err.message)
        }
      }
      if (!imageUrl || !/^https?:\/\//.test(imageUrl)) {
        throw new Error((lastErr && lastErr.message) || '图片上传失败，请检查网络')
      }

      this.setData({ isUploading: false })

      const params = [
        `imageUrl=${encodeURIComponent(imageUrl)}`,
        `photoType=${this.data.photoType}`,
        `gender=auto`,
        `localPhoto=${encodeURIComponent(savedPhoto || this.data.photoUrl)}`
      ].join('&')

      wx.redirectTo({
        url: `/pages/analyzing/analyzing?${params}`,
        fail: (err) => {
          console.error('[diagnose] redirectTo 失败:', err)
          wx.showToast({ title: '页面跳转失败', icon: 'none' })
        }
      })
    } catch (err) {
      console.error('[diagnose] 图片上传失败:', err)
      this.setData({ isUploading: false })
      wx.showModal({
        title: '上传失败',
        content: '图片上传失败，请检查网络连接后重试',
        showCancel: false
      })
    }
  }
})
