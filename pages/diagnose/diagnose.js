// pages/diagnose/diagnose.js
const { request, API } = require('../../utils/api')

Page({
  data: {
    photoType: 'face', // face | fullbody
    photoUrl: '',
    isUploading: false,
    userTags: [],
    tagInput: '',
    showTagInput: false,
    guideVisible: true
  },

  onLoad(options) {
    if (options.type) {
      this.setData({ photoType: options.type })
    }
  },

  // 切换照片类型
  onSwitchType(e) {
    this.setData({ photoType: e.currentTarget.dataset.type })
  },

  // 拍照
  onTakePhoto() {
    const that = this
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['camera'],
      sizeType: ['compressed'],
      success(res) {
        that.setData({ photoUrl: res.tempFiles[0].tempFilePath, guideVisible: false })
      }
    })
  },

  // 从相册选择
  onChooseFromAlbum() {
    const that = this
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album'],
      sizeType: ['compressed'],
      success(res) {
        that.setData({ photoUrl: res.tempFiles[0].tempFilePath, guideVisible: false })
      }
    })
  },

  // 重新选择
  onRechoose() {
    this.setData({ photoUrl: '', guideVisible: true })
  },

  // 标签输入
  onShowTagInput() {
    this.setData({ showTagInput: true })
  },

  onTagInput(e) {
    this.setData({ tagInput: e.detail.value })
  },

  onAddTag() {
    const { tagInput, userTags } = this.data
    if (!tagInput.trim()) return
    if (userTags.length >= 5) {
      wx.showToast({ title: '最多添加5个标签', icon: 'none' })
      return
    }
    this.setData({
      userTags: [...userTags, tagInput.trim()],
      tagInput: '',
      showTagInput: false
    })
  },

  onRemoveTag(e) {
    const idx = e.currentTarget.dataset.index
    const userTags = this.data.userTags
    userTags.splice(idx, 1)
    this.setData({ userTags })
  },

  // 将图片转为 base64（先压缩，确保不超过微信请求限制）
  imageToBase64(filePath) {
    return new Promise((resolve, reject) => {
      // 微信 wx.request POST body 上限约 1MB，base64 需控制在 800KB 以内
      const MAX_BASE64_SIZE = 800 * 1024

      const tryCompress = (quality, attempt) => {
        wx.compressImage({
          src: filePath,
          quality,
          success: (compressRes) => {
            const compressedPath = compressRes.tempFilePath
            wx.getFileSystemManager().readFile({
              filePath: compressedPath,
              encoding: 'base64',
              success(res) {
                const ext = compressedPath.split('.').pop().toLowerCase()
                const mimeMap = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' }
                const mime = mimeMap[ext] || 'image/jpeg'
                const base64Str = `data:${mime};base64,${res.data}`
                console.log(`[diagnose] 压缩质量:${quality} base64大小:${(base64Str.length / 1024).toFixed(0)}KB (尝试${attempt})`)

                if (base64Str.length > MAX_BASE64_SIZE && attempt < 3) {
                  // 仍然太大，继续降低质量
                  console.log(`[diagnose] base64过大，降低质量重试`)
                  tryCompress(Math.max(10, quality - 20), attempt + 1)
                } else {
                  resolve(base64Str)
                }
              },
              fail: reject
            })
          },
          fail: () => {
            if (attempt < 3) {
              // 压缩失败，直接读取原图
              wx.getFileSystemManager().readFile({
                filePath,
                encoding: 'base64',
                success(res) {
                  const ext = filePath.split('.').pop().toLowerCase()
                  const mimeMap = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' }
                  const mime = mimeMap[ext] || 'image/jpeg'
                  const base64Str = `data:${mime};base64,${res.data}`
                  console.log(`[diagnose] 原图base64大小:${(base64Str.length / 1024).toFixed(0)}KB`)
                  resolve(base64Str)
                },
                fail: reject
              })
            } else {
              reject(new Error('图片压缩失败'))
            }
          }
        })
      }

      tryCompress(50, 1)
    })
  },

  // 开始分析
  onStartAnalysis() {
    if (!this.data.photoUrl) {
      wx.showToast({ title: '请先上传照片', icon: 'none' })
      return
    }

    this.setData({ isUploading: true })
    const that = this

    // 直接转 base64，通过 storage 传递给 analyzing 页面
    this.imageToBase64(this.data.photoUrl).then(base64Str => {
      wx.setStorageSync('tempImageBase64', base64Str)
      that.setData({ isUploading: false })

      wx.navigateTo({
        url: `/pages/analyzing/analyzing?hasBase64=1&photoType=${that.data.photoType}&tags=${encodeURIComponent(JSON.stringify(that.data.userTags))}`
      })
    }).catch(err => {
      console.error('[diagnose] base64转换失败:', err)
      that.setData({ isUploading: false })
      wx.showToast({ title: '图片处理失败，请重试', icon: 'none' })
    })
  }
})
