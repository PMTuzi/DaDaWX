// pages/diagnose/diagnose.js
const { request, API, uploadImage } = require('../../utils/api')

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

  onError(err) {
    console.error('[diagnose] 页面错误:', err)
  },

  // 切换照片类型
  onSwitchType(e) {
    this.setData({ photoType: e.currentTarget.dataset.type })
  },

  // 拍照
  onTakePhoto() {
    try {
      wx.chooseMedia({
        count: 1,
        mediaType: ['image'],
        sourceType: ['camera'],
        camera: 'front',
        success: (res) => {
          try {
            this.setData({ photoUrl: res.tempFiles[0].tempFilePath, guideVisible: false })
          } catch (e) {
            console.error('[diagnose] 拍照回调出错:', e)
          }
        },
        fail: (err) => {
          if (err.errMsg && err.errMsg.indexOf('cancel') > -1) return
          console.warn('[diagnose] chooseMedia 拍照失败:', err.errMsg)
        }
      })
    } catch (e) {
      // chooseMedia 不可用时降级
      wx.chooseImage({
        count: 1,
        sourceType: ['camera'],
        success: (res) => {
          try {
            this.setData({ photoUrl: res.tempFilePaths[0], guideVisible: false })
          } catch (e2) {}
        },
        fail: () => {}
      })
    }
  },

  // 从相册选择
  onChooseFromAlbum() {
    try {
      wx.chooseMedia({
        count: 1,
        mediaType: ['image'],
        sourceType: ['album'],
        success: (res) => {
          try {
            this.setData({ photoUrl: res.tempFiles[0].tempFilePath, guideVisible: false })
          } catch (e) {
            console.error('[diagnose] 相册选择回调出错:', e)
          }
        },
        fail: (err) => {
          if (err.errMsg && err.errMsg.indexOf('cancel') > -1) return
          console.warn('[diagnose] chooseMedia 相册失败:', err.errMsg)
        }
      })
    } catch (e) {
      // chooseMedia 不可用时降级
      wx.chooseImage({
        count: 1,
        sourceType: ['album'],
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

  // 开始分析
  async onStartAnalysis() {
    if (!this.data.photoUrl) {
      wx.showToast({ title: '请先上传照片', icon: 'none' })
      return
    }

    this.setData({ isUploading: true })

    try {
      // 使用全局 uploadImage（内置 base64 降级，确保可靠）
      const imageUrl = await uploadImage(this.data.photoUrl)

      this.setData({ isUploading: false })

      wx.navigateTo({
        url: `/pages/analyzing/analyzing?imageUrl=${encodeURIComponent(imageUrl)}&photoType=${this.data.photoType}&tags=${encodeURIComponent(JSON.stringify(this.data.userTags))}`,
        fail: (err) => {
          console.error('[diagnose] navigateTo 失败:', err)
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
