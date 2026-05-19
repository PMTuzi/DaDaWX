// pages/diagnose/diagnose.js
const { request, API, uploadImage } = require('../../utils/api')

Page({
  data: {
    photoType: 'face', // face | fullbody
    gender: 'female', // female | male
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

  // 切换性别
  onSwitchGender(e) {
    this.setData({ gender: e.currentTarget.dataset.gender })
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
      // 并行：上传图片 + 读取base64（确保服务端一定能拿到图片数据）
      const { request, API, uploadImage, imageToBase64 } = require('../../utils/api')
      const [imageUrl, imageBase64] = await Promise.all([
        uploadImage(this.data.photoUrl).catch(err => {
          console.warn('[diagnose] 图片上传失败，仅用base64:', err.message)
          return ''
        }),
        imageToBase64(this.data.photoUrl).catch(err => {
          console.warn('[diagnose] base64读取失败:', err.message)
          return ''
        })
      ])

      if (!imageUrl && !imageBase64) {
        throw new Error('图片数据获取失败')
      }

      // 保存base64到全局，analyzing页面通过hasBase64=1取回
      if (imageBase64) {
        getApp().globalData.tempImageBase64 = imageBase64
      }

      this.setData({ isUploading: false })

      const params = [
        `imageUrl=${encodeURIComponent(imageUrl)}`,
        `photoType=${this.data.photoType}`,
        `gender=${this.data.gender}`,
        `tags=${encodeURIComponent(JSON.stringify(this.data.userTags))}`,
        imageBase64 ? 'hasBase64=1' : ''
      ].filter(Boolean).join('&')

      wx.navigateTo({
        url: `/pages/analyzing/analyzing?${params}`,
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
