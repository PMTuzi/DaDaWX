// pages/consult-publish/consult-publish.js
const { request, API, uploadImage, ensureLogin } = require('../../utils/api')

Page({
  data: {
    // 图片
    images: [],
    maxImages: 4,

    // 两步流程
    step: 0,                    // 0=上传, 1=场景
    mode: '',                   // 'buy' | 'compare'，由图片数自动决定

    // AI识别品类（仅buy模式）
    category: '',
    categoryDetected: false,
    categoryDetecting: false,
    categoryOptions: ['上衣', '裤装', '裙装', '连衣裙', '外套', '鞋', '包', '配饰'],
    showCategoryPicker: false,

    // 场景选择
    scene: '',
    sceneOptions: [
      { value: '日常通勤', label: '日常通勤', icon: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA0OCA0OCI+PHJlY3QgeD0iNiIgeT0iMTYiIHdpZHRoPSIzNiIgaGVpZ2h0PSIyNiIgcng9IjQiIGZpbGw9Im5vbmUiIHN0cm9rZT0iJTIzOEM3MzQwIiBzdHJva2Utd2lkdGg9IjIuNSIvPjxwYXRoIGQ9Ik0xNiAxNlYxMmE4IDggMCAwIDEgMTYgMHY0IiBmaWxsPSJub25lIiBzdHJva2U9IiUyMzhDNzM0MCIgc3Ryb2tlLXdpZHRoPSIyLjUiLz48L3N2Zz4=', iconActive: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA0OCA0OCI+PHJlY3QgeD0iNiIgeT0iMTYiIHdpZHRoPSIzNiIgaGVpZ2h0PSIyNiIgcng9IjQiIGZpbGw9Im5vbmUiIHN0cm9rZT0iJTIzQjg5OTY4IiBzdHJva2Utd2lkdGg9IjIuNSIvPjxwYXRoIGQ9Ik0xNiAxNlYxMmE4IDggMCAwIDEgMTYgMHY0IiBmaWxsPSJub25lIiBzdHJva2U9IiUyM0I4OTk2OCIgc3Ryb2tlLXdpZHRoPSIyLjUiLz48L3N2Zz4=' },
      { value: '休闲逛街', label: '休闲逛街', icon: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA0OCA0OCI+PHBhdGggZD0iTTEyIDZoMjRsNiAxMnYyNGEyIDIgMCAwIDEtMiAySDhhMiAyIDAgMCAxLTItMlYxOHoiIGZpbGw9Im5vbmUiIHN0cm9rZT0iJTIzOEM3MzQwIiBzdHJva2Utd2lkdGg9IjIuNSIvPjxsaW5lIHgxPSI4IiB5MT0iMTgiIHgyPSI0MCIgeTI9IjE4IiBzdHJva2U9IiUyMzhDNzM0MCIgc3Ryb2tlLXdpZHRoPSIyLjUiLz48L3N2Zz4=', iconActive: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA0OCA0OCI+PHBhdGggZD0iTTEyIDZoMjRsNiAxMnYyNGEyIDIgMCAwIDEtMiAySDhhMiAyIDAgMCAxLTItMlYxOHoiIGZpbGw9Im5vbmUiIHN0cm9rZT0iJTIzQjg5OTY4IiBzdHJva2Utd2lkdGg9IjIuNSIvPjxsaW5lIHgxPSI4IiB5MT0iMTgiIHgyPSI0MCIgeTI9IjE4IiBzdHJva2U9IiUyM0I4OTk2OCIgc3Ryb2tlLXdpZHRoPSIyLjUiLz48L3N2Zz4=' },
      { value: '约会聚会', label: '约会聚会', icon: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA0OCA0OCI+PHBhdGggZD0iTTI0IDQycy0xOC0xMi0xOC0yNGE5IDkgMCAwIDEgMTggMCA5IDkgMCAwIDEgMTggMGMwIDEyLTE4IDI0LTE4IDI0eiIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIlMjM4QzczNDAiIHN0cm9rZS13aWR0aD0iMi41Ii8+PC9zdmc+', iconActive: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA0OCA0OCI+PHBhdGggZD0iTTI0IDQycy0xOC0xMi0xOC0yNGE5IDkgMCAwIDEgMTggMCA5IDkgMCAwIDEgMTggMGMwIDEyLTE4IDI0LTE4IDI0eiIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIlMjNCODk5NjgiIHN0cm9rZS13aWR0aD0iMi41Ii8+PC9zdmc+' },
      { value: '运动户外', label: '运动户外', icon: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA0OCA0OCI+PGNpcmNsZSBjeD0iMjQiIGN5PSIyNCIgcj0iMTgiIGZpbGw9Im5vbmUiIHN0cm9rZT0iJTIzOEM3MzQwIiBzdHJva2Utd2lkdGg9IjIuNSIvPjxwYXRoIGQ9Ik0yNCAxMnYyNE0xNCAyMGwxMC04IDEwIDhNMTQgMjhsMTAgOCAxMC04IiBmaWxsPSJub25lIiBzdHJva2U9IiUyMzhDNzM0MCIgc3Ryb2tlLXdpZHRoPSIyLjUiLz48L3N2Zz4=', iconActive: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA0OCA0OCI+PGNpcmNsZSBjeD0iMjQiIGN5PSIyNCIgcj0iMTgiIGZpbGw9Im5vbmUiIHN0cm9rZT0iJTIzQjg5OTY4IiBzdHJva2Utd2lkdGg9IjIuNSIvPjxwYXRoIGQ9Ik0yNCAxMnYyNE0xNCAyMGwxMC04IDEwIDhNMTQgMjhsMTAgOCAxMC04IiBmaWxsPSJub25lIiBzdHJva2U9IiUyM0I4OTk2OCIgc3Ryb2tlLXdpZHRoPSIyLjUiLz48L3N2Zz4=' },
      { value: '正式场合', label: '正式场合', icon: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA0OCA0OCI+PHBhdGggZD0iTTI0IDRsMTYgOHYyOGEyIDIgMCAwIDEtMiAySDEwYTIgMiAwIDAgMS0yLTJWMTJ6IiBmaWxsPSJub25lIiBzdHJva2U9IiUyMzhDNzM0MCIgc3Ryb2tlLXdpZHRoPSIyLjUiLz48cGF0aCBkPSJNMTggNDJWMjZoMTJ2MTYiIGZpbGw9Im5vbmUiIHN0cm9rZT0iJTIzOEM3MzQwIiBzdHJva2Utd2lkdGg9IjIuNSIvPjwvc3ZnPg==', iconActive: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA0OCA0OCI+PHBhdGggZD0iTTI0IDRsMTYgOHYyOGEyIDIgMCAwIDEtMiAySDEwYTIgMiAwIDAgMS0yLTJWMTJ6IiBmaWxsPSJub25lIiBzdHJva2U9IiUyM0I4OTk2OCIgc3Ryb2tlLXdpZHRoPSIyLjUiLz48cGF0aCBkPSJNMTggNDJWMjZoMTJ2MTYiIGZpbGw9Im5vbmUiIHN0cm9rZT0iJTIzQjg5OTY4IiBzdHJva2Utd2lkdGg9IjIuNSIvPjwvc3ZnPg==' },
      { value: '居家休闲', label: '居家休闲', icon: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA0OCA0OCI+PHBhdGggZD0iTTggMjBMMjQgOGwxNiAxMnYyNGEyIDIgMCAwIDEtMiAySDEwYTIgMiAwIDAgMS0yLTJ6IiBmaWxsPSJub25lIiBzdHJva2U9IiUyMzhDNzM0MCIgc3Ryb2tlLXdpZHRoPSIyLjUiLz48cGF0aCBkPSJNMTggNDJWMjhoMTJ2MTQiIGZpbGw9Im5vbmUiIHN0cm9rZT0iJTIzOEM3MzQwIiBzdHJva2Utd2lkdGg9IjIuNSIvPjwvc3ZnPg==', iconActive: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA0OCA0OCI+PHBhdGggZD0iTTggMjBMMjQgOGwxNiAxMnYyNGEyIDIgMCAwIDEtMiAySDEwYTIgMiAwIDAgMS0yLTJ6IiBmaWxsPSJub25lIiBzdHJva2U9IiUyM0I4OTk2OCIgc3Ryb2tlLXdpZHRoPSIyLjUiLz48cGF0aCBkPSJNMTggNDJWMjhoMTJ2MTQiIGZpbGw9Im5vbmUiIHN0cm9rZT0iJTIzQjg5OTY4IiBzdHJva2Utd2lkdGg9IjIuNSIvPjwvc3ZnPg==' }
    ],

    submitting: false
  },

  onLoad() {
    try { wx.setNavigationBarTitle({ title: '发布咨询' }) } catch (e) {}
  },

  // ============ 步骤控制 ============
  onNext() {
    if (this.data.step === 0) {
      if (this.data.images.length === 0) {
        wx.showToast({ title: '请先上传照片', icon: 'none' })
        return
      }
      if (this.data.mode === 'buy' && !this.data.category) {
        wx.showToast({ title: 'AI正在识别中，请稍候', icon: 'none' })
        return
      }
      this.setData({ step: 1 })
    }
  },

  onPrev() {
    if (this.data.step === 1) {
      this.setData({ step: 0 })
    }
  },

  onBack() {
    const pages = getCurrentPages()
    if (pages.length > 1) {
      wx.navigateBack({ delta: 1 })
    } else {
      wx.switchTab({ url: '/pages/outfit/outfit' })
    }
  },

  // ============ 图片相关 ============
  onAddImage() {
    const remaining = this.data.maxImages - this.data.images.length
    if (remaining <= 0) return

    const handleNewImages = (newImages) => {
      if (newImages.length === 0) return
      const images = [...this.data.images, ...newImages]
      this.setData({ images })
      this.refreshMode(images)
    }

    const pickFrom = (sourceType) => {
      const count = sourceType === 'camera' ? 1 : remaining
      try {
        wx.chooseMedia({
          count,
          mediaType: ['image'],
          sourceType: [sourceType],
          success: (res) => {
            try {
              const newImages = []
              res.tempFiles.forEach(f => {
                if (f.size < 5 * 1024) {
                  wx.showToast({ title: '图片太小，请重新选择', icon: 'none' })
                  return
                }
                newImages.push({ path: f.tempFilePath, thumb: f.tempFilePath, size: f.size })
              })
              handleNewImages(newImages)
            } catch (e) {
              console.error('[consult-publish] 选择图片回调出错:', e)
              wx.showToast({ title: '图片处理失败', icon: 'none' })
            }
          },
          fail: (err) => {
            if (err.errMsg && err.errMsg.indexOf('cancel') > -1) return
            console.warn('[consult-publish] chooseMedia 失败:', err.errMsg)
          }
        })
      } catch (e) {
        console.warn('[consult-publish] chooseMedia 不可用，回退 chooseImage:', e)
        wx.chooseImage({
          count,
          sizeType: ['compressed'],
          sourceType: [sourceType],
          success: (res) => {
            try {
              const newImages = (res.tempFiles || res.tempFilePaths || []).map(f => {
                if (typeof f === 'string') return { path: f, thumb: f, size: 0 }
                return { path: f.path || f.tempFilePath, thumb: f.path || f.tempFilePath, size: f.size }
              })
              handleNewImages(newImages)
            } catch (e2) {
              console.error('[consult-publish] chooseImage 回调出错:', e2)
            }
          },
          fail: () => {}
        })
      }
    }

    wx.showActionSheet({
      itemList: [`从相册选择（最多 ${remaining} 张）`, '拍照'],
      success: (r) => {
        if (r.tapIndex === 0) pickFrom('album')
        else if (r.tapIndex === 1) pickFrom('camera')
      },
      fail: () => {}
    })
  },

  onRemoveImage(e) {
    const idx = e.currentTarget.dataset.index
    const images = [...this.data.images]
    images.splice(idx, 1)
    this.setData({ images })
    this.refreshMode(images)
  },

  onPreviewImage(e) {
    const idx = e.currentTarget.dataset.index
    wx.previewImage({
      current: this.data.images[idx].path,
      urls: this.data.images.map(i => i.path)
    })
  },

  // ============ 模式 & AI识别 ============
  refreshMode(images) {
    const mode = images.length > 1 ? 'compare' : 'buy'
    this.setData({ mode, category: '', categoryDetected: false })

    if (images.length === 1) {
      this.autoDetectCategory(images[0].path).catch(() => {})
    }
  },

  async autoDetectCategory(imagePath) {
    this.setData({ categoryDetected: false, categoryDetecting: true })
    try {
      const { checkServerReachable } = require('../../utils/api')
      const reachable = await checkServerReachable()
      if (!reachable) { this.setData({ categoryDetecting: false }); return }

      try {
        const fs = wx.getFileSystemManager()
        fs.accessSync(imagePath)
      } catch (e) { this.setData({ categoryDetecting: false }); return }

      let imageUrl
      try {
        imageUrl = await Promise.race([
          uploadImage(imagePath),
          new Promise((_, reject) => setTimeout(() => reject(new Error('上传超时')), 15000))
        ])
      } catch (e) {
        console.warn('[consult-publish] OSS 上传失败:', e.message)
        this.setData({ categoryDetecting: false })
        return
      }

      const result = await request(API.detectCategory, {
        method: 'POST',
        timeout: 15000,
        data: { images: [{ imageUrl }] }
      })

      if (result && result.code === 0 && result.data && result.data.category) {
        const detected = String(result.data.category).trim()
        if (detected) {
          const opts = [...this.data.categoryOptions]
          if (!opts.includes(detected)) opts.unshift(detected)
          this.setData({
            category: detected,
            categoryDetected: true,
            categoryOptions: opts
          })
        }
      }
    } catch (err) {
      console.warn('[consult-publish] 类别识别失败:', err && err.message)
    } finally {
      this.setData({ categoryDetecting: false })
    }
  },

  // ============ 品类选择弹窗 ============
  onShowCategoryPicker() {
    this.setData({ showCategoryPicker: true })
  },

  onHideCategoryPicker() {
    this.setData({ showCategoryPicker: false })
  },

  onPreventBubble() {},

  onCategoryPick(e) {
    const val = e.currentTarget.dataset.value
    this.setData({ category: val, showCategoryPicker: false })
  },

  // ============ 场景选择 ============
  onSceneTap(e) {
    const val = e.currentTarget.dataset.value
    this.setData({ scene: this.data.scene === val ? '' : val })
  },

  // ============ 提交 ============
  async onSubmit() {
    if (this.data.submitting) return

    if (!this.data.scene) {
      wx.showToast({ title: '请选择穿搭场景', icon: 'none' })
      return
    }

    try {
      await ensureLogin()
    } catch (e) {
      wx.showToast({ title: '请先登录', icon: 'none' })
      return
    }

    this.setData({ submitting: true })

    try {
      const imageDataList = []
      for (const img of this.data.images) {
        const localPath = await this.saveImageToLocal(img.path)
        imageDataList.push({ localPath })
      }

      const { checkServerReachable } = require('../../utils/api')
      const serverReachable = await checkServerReachable()
      if (!serverReachable) {
        wx.showToast({ title: '服务器连接失败，请检查网络', icon: 'none' })
        this.setData({ submitting: false })
        return
      }

      const uploadPromises = imageDataList.map(async (item, i) => {
        const uploadPath = item.localPath || this.data.images[i].path
        let lastErr
        for (let attempt = 0; attempt < 2; attempt++) {
          try {
            const url = await Promise.race([
              uploadImage(uploadPath),
              new Promise((_, reject) => setTimeout(() => reject(new Error('上传超时')), 30000))
            ])
            item.imageUrl = url
            return
          } catch (err) {
            lastErr = err
            console.warn(`[consult-publish] 图片${i}上传第${attempt+1}次失败:`, err.message)
          }
        }
        throw new Error(`第${i+1}张图片上传失败：${lastErr.message}`)
      })

      try {
        await Promise.all(uploadPromises)
      } catch (uploadErr) {
        wx.showModal({
          title: '图片上传失败',
          content: uploadErr.message + '，请重试或检查网络',
          showCancel: false
        })
        this.setData({ submitting: false })
        return
      }

      const type = this.data.mode
      const consultData = { type, images: imageDataList }

      if (type === 'buy') {
        consultData.category = this.data.category
      }
      consultData.scene = this.data.scene

      getApp().globalData.consultData = consultData
      wx.setStorageSync('consultData', consultData)

      wx.redirectTo({
        url: `/pages/consult-analyzing/consult-analyzing?type=${type}`,
        fail: (err) => {
          console.error('[consult-publish] redirectTo 失败:', err)
          wx.showToast({ title: '页面跳转失败', icon: 'none' })
        }
      })
    } catch (err) {
      console.error('[consult-publish] 提交失败:', err)
      wx.showModal({
        title: '提交失败',
        content: err.message || '请检查网络后重试',
        showCancel: false
      })
    } finally {
      this.setData({ submitting: false })
    }
  },

  async saveImageToLocal(tempPath) {
    try {
      const fs = wx.getFileSystemManager()
      const m = tempPath.match(/\.(jpg|jpeg|png|webp)$/i)
      const ext = m ? m[0] : '.jpg'
      const fileName = `${Date.now()}_${Math.random().toString(36).substr(2, 8)}${ext}`
      const destPath = `${wx.env.USER_DATA_PATH}/${fileName}`
      fs.saveFileSync(tempPath, destPath)
      return destPath
    } catch (e) {
      console.warn('[consult-publish] 保存本地图片失败:', e.message)
      return tempPath
    }
  }
})
