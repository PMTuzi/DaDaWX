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
      camera: 'front',
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

  // 上传图片到服务器（避免前端 base64 过大导致真机请求失败）
  uploadImage(filePath) {
    return new Promise((resolve, reject) => {
      const { CONFIG } = require('../../utils/api')
      wx.uploadFile({
        url: CONFIG.baseUrl + '/api/upload',
        filePath,
        name: 'image',
        timeout: 30000,
        success(res) {
          if (res.statusCode === 200) {
            try {
              const data = JSON.parse(res.data)
              if (data.code === 0) {
                console.log('[diagnose] 图片上传成功:', data.data.url)
                resolve(data.data.url)
              } else {
                reject(new Error(data.message || '上传失败'))
              }
            } catch (e) {
              reject(new Error('上传响应解析失败'))
            }
          } else {
            reject(new Error(`上传失败(${res.statusCode})`))
          }
        },
        fail(err) {
          console.error('[diagnose] 图片上传失败:', err.errMsg)
          reject(new Error(err.errMsg || '上传失败'))
        }
      })
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

    // 上传图片到服务器，避免 base64 过大导致真机失败
    this.uploadImage(this.data.photoUrl).then(imageUrl => {
      that.setData({ isUploading: false })

      wx.navigateTo({
        url: `/pages/analyzing/analyzing?imageUrl=${encodeURIComponent(imageUrl)}&photoType=${that.data.photoType}&tags=${encodeURIComponent(JSON.stringify(that.data.userTags))}`
      })
    }).catch(err => {
      console.error('[diagnose] 图片上传失败:', err)
      that.setData({ isUploading: false })
      wx.showToast({ title: '图片上传失败，请重试', icon: 'none' })
    })
  }
})
