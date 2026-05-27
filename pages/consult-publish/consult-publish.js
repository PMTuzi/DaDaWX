// pages/consult-publish/consult-publish.js
const { request, API, uploadImage, ensureLogin } = require('../../utils/api')

Page({
  data: {
    // 图片
    images: [],
    maxImages: 4,
    minImages: 1,

    // ===== 流程控制 =====
    currentIdx: 0,
    mode: 'buy',                // 'buy' | 'compare'，由图片数自动决定
    slideKeys: ['upload', 'category', 'scene', 'trouble', 'extra'],
    nextLabel: '下一步',

    // ===== 单品 =====
    category: '',
    categoryDetected: false,
    categoryDetecting: false,
    categoryOptions: ['上衣', '裤装', '裙装', '连衣裙', '外套', '鞋', '包', '配饰'],
    showCategoryInput: false,
    customCategory: '',

    priceRange: '',
    priceRangeIndex: -1,
    priceRangeOptions: ['100元以下', '100-300元', '300-500元', '500-1000元', '1000元以上'],

    bodyFeatures: [],
    bodyFeatureOptions: ['肩宽', '窄肩', '微胖', '偏瘦', '腿粗', '腿短', '腰粗', '小个子', '高个子', '手臂粗'],

    wearScenes: [],
    wearSceneOptions: ['日常通勤', '休闲逛街', '约会聚会', '运动户外', '正式场合', '居家休闲'],

    trouble: '',
    troubleIndex: -1,
    troubleOptions: ['不知道怎么搭', '怕显胖/显矮/显黑', '颜色不知道配什么', '不知道适不适合自己', '担心过时快', '不确定质感好不好', '没有困扰'],

    // ===== 对比 =====
    compareScene: '',
    compareSceneIndex: -1,
    compareSceneOptions: ['日常通勤', '约会聚会', '休闲逛街', '运动户外', '正式场合', '聚会派对'],

    priceList: [],
    priceListIndexes: [],

    styleDiff: [],
    styleDiffOptions: ['简约vs华丽', '休闲vs正式', '甜美vs酷飒', '基础vs设计感', '低调vs吸睛', '经典vs流行', '日常vs派对'],

    reason: '',
    reasonIndex: -1,
    reasonOptions: ['不知道哪个更适合我', '不确定哪个更百搭', '不知道哪个质感更好', '价格差异大不知怎么选', '都喜欢不知道选哪个', '不确定哪个颜色更衬我'],

    submitting: false,
    summaryText: ''
  },

  onLoad() {
    try { wx.setNavigationBarTitle({ title: '发布咨询' }) } catch (e) {}
    this.refreshSlideKeys()
  },

  // ============ 流程控制 ============
  refreshSlideKeys() {
    const compare = this.data.images.length > 1
    const mode = compare ? 'compare' : 'buy'
    const slideKeys = compare
      ? ['upload', 'compareScene', 'reason', 'extra']
      : ['upload', 'category', 'scene', 'trouble', 'extra']
    // 如果模式切换导致 currentIdx 越界，回退
    let currentIdx = this.data.currentIdx
    if (currentIdx >= slideKeys.length) currentIdx = slideKeys.length - 1
    this.setData({ mode, slideKeys, currentIdx })
    this.updateNextLabel()
  },

  updateNextLabel() {
    const key = this.data.slideKeys[this.data.currentIdx]
    let label = '下一步'
    if (key === 'upload' && this.data.images.length === 0) label = '请先上传'
    if (key === 'extra') label = '完成'
    // 选填步骤显示「跳过」
    if (key === 'scene' && !this.data.wearScenes.length) label = '跳过'
    if (key === 'trouble' && !this.data.trouble) label = '跳过'
    if (key === 'reason' && !this.data.reason) label = '跳过'
    this.setData({ nextLabel: label })
  },

  onSwiperChange(e) {
    if (e.detail.source === 'touch' || e.detail.source === 'autoplay' || e.detail.source === '') {
      this.setData({ currentIdx: e.detail.current })
      this.updateNextLabel()
    }
  },

  onPrev() {
    if (this.data.currentIdx <= 0) return
    this.setData({ currentIdx: this.data.currentIdx - 1 })
    this.updateNextLabel()
  },

  onBack() {
    const pages = getCurrentPages()
    if (pages.length > 1) {
      wx.navigateBack({ delta: 1 })
    } else {
      wx.switchTab({ url: '/pages/outfit/outfit' })
    }
  },

  onNext() {
    const key = this.data.slideKeys[this.data.currentIdx]

    // 必填校验
    if (key === 'upload' && this.data.images.length < 1) {
      wx.showToast({ title: '请先上传至少 1 张照片', icon: 'none' }); return
    }
    if (key === 'category' && !this.data.category) {
      wx.showToast({ title: '请选择穿搭类别', icon: 'none' }); return
    }
    if (key === 'compareScene' && !this.data.compareScene) {
      wx.showToast({ title: '请选择对比场景', icon: 'none' }); return
    }

    if (this.data.currentIdx < this.data.slideKeys.length - 1) {
      this.setData({ currentIdx: this.data.currentIdx + 1 })
      this.updateNextLabel()
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

      if (images.length > 1) {
        const pl = [...this.data.priceList]
        const pli = [...this.data.priceListIndexes]
        while (pl.length < images.length) {
          pl.push('')
          pli.push(-1)
        }
        this.setData({ priceList: pl, priceListIndexes: pli })
      }

      if (images.length === 1 && !this.data.category) {
        this.autoDetectCategory(images[0].path).catch(() => {})
      }
      this.refreshSlideKeys()
      this.updateSummary()
    }

    try {
      wx.chooseMedia({
        count: remaining,
        mediaType: ['image'],
        sourceType: ['album', 'camera'],
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
      console.warn('[consult-publish] chooseMedia 不可用，尝试 chooseImage:', e)
      wx.chooseImage({
        count: remaining,
        sizeType: ['compressed'],
        sourceType: ['album', 'camera'],
        success: (res) => {
          try {
            const newImages = res.tempFiles.map(f => ({ path: f.tempFilePath, thumb: f.tempFilePath, size: f.size }))
            handleNewImages(newImages)
          } catch (e2) {
            console.error('[consult-publish] chooseImage 回调出错:', e2)
          }
        },
        fail: () => {}
      })
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
            categoryOptions: opts,
            showCategoryInput: false
          })
          this.updateSummary()
        }
      }
    } catch (err) {
      console.warn('[consult-publish] 类别识别失败:', err && err.message)
    } finally {
      this.setData({ categoryDetecting: false })
    }
  },

  onRemoveImage(e) {
    const idx = e.currentTarget.dataset.index
    const images = [...this.data.images]
    images.splice(idx, 1)
    this.setData({ images })

    if (images.length > 1) {
      const pl = [...this.data.priceList]
      const pli = [...this.data.priceListIndexes]
      pl.splice(idx, 1)
      pli.splice(idx, 1)
      this.setData({ priceList: pl, priceListIndexes: pli })
    } else {
      this.setData({ priceList: [], priceListIndexes: [] })
    }
    this.refreshSlideKeys()
    this.updateSummary()
  },

  onPreviewImage(e) {
    const idx = e.currentTarget.dataset.index
    wx.previewImage({
      current: this.data.images[idx].path,
      urls: this.data.images.map(i => i.path)
    })
  },

  // ============ 通用：单选 chip ============
  onSingleChipTap(e) {
    const { field, value } = e.currentTarget.dataset
    if (!field) return
    const patch = {}
    patch[field] = this.data[field] === value ? '' : value
    if (field === 'priceRange') {
      patch.priceRangeIndex = this.data.priceRangeOptions.indexOf(patch[field])
    } else if (field === 'trouble') {
      patch.troubleIndex = this.data.troubleOptions.indexOf(patch[field])
    } else if (field === 'compareScene') {
      patch.compareSceneIndex = this.data.compareSceneOptions.indexOf(patch[field])
    } else if (field === 'reason') {
      patch.reasonIndex = this.data.reasonOptions.indexOf(patch[field])
    } else if (field === 'category') {
      patch.categoryDetected = false
      patch.showCategoryInput = false
      patch.customCategory = ''
    }
    this.setData(patch)
    this.updateNextLabel()
    this.updateSummary()
  },

  onTapOtherCategory() {
    const showing = this.data.showCategoryInput
    this.setData({
      showCategoryInput: !showing,
      category: showing ? this.data.category : '',
      categoryDetected: false
    })
  },

  onCustomCategoryInput(e) {
    const val = e.detail.value
    this.setData({
      customCategory: val,
      category: val,
      categoryDetected: false
    })
    this.updateSummary()
  },

  // ============ 多选 chip ============
  onWearSceneTap(e) {
    const val = e.currentTarget.dataset.value
    let list = [...this.data.wearScenes]
    const idx = list.indexOf(val)
    if (idx > -1) list.splice(idx, 1)
    else if (list.length < 2) list.push(val)
    else { wx.showToast({ title: '最多选 2 项', icon: 'none' }); return }
    this.setData({ wearScenes: list })
    this.updateNextLabel()
    this.updateSummary()
  },

  onBodyFeatureTap(e) {
    const val = e.currentTarget.dataset.value
    let list = [...this.data.bodyFeatures]
    const idx = list.indexOf(val)
    if (idx > -1) list.splice(idx, 1)
    else if (list.length < 3) list.push(val)
    else { wx.showToast({ title: '最多选 3 项', icon: 'none' }); return }
    this.setData({ bodyFeatures: list })
  },

  onStyleDiffTap(e) {
    const val = e.currentTarget.dataset.value
    let list = [...this.data.styleDiff]
    const idx = list.indexOf(val)
    if (idx > -1) list.splice(idx, 1)
    else if (list.length < 3) list.push(val)
    else { wx.showToast({ title: '最多选 3 项', icon: 'none' }); return }
    this.setData({ styleDiff: list })
  },

  onPriceListChange(e) {
    const idx = e.currentTarget.dataset.index
    const pl = [...this.data.priceList]
    const pli = [...this.data.priceListIndexes]
    pl[idx] = this.data.priceRangeOptions[e.detail.value]
    pli[idx] = e.detail.value
    this.setData({ priceList: pl, priceListIndexes: pli })
  },

  // ============ 汇总 ============
  updateSummary() {
    const d = this.data
    const parts = []
    if (d.images.length > 1) {
      parts.push(`${d.images.length} 件 PK`)
      if (d.compareScene) parts.push(d.compareScene)
      if (d.reason) parts.push(d.reason)
    } else if (d.images.length === 1) {
      if (d.category) parts.push(d.category)
      if (d.wearScenes.length) parts.push(d.wearScenes.join('/'))
      if (d.trouble) parts.push(d.trouble)
    }
    this.setData({ summaryText: parts.length ? parts.join(' · ') : '' })
  },

  // ============ 持久化图片 ============
  async saveImageToLocal(tempPath) {
    try {
      const fs = wx.getFileSystemManager()
      const ext = tempPath.match(/\.(jpg|jpeg|png|webp)$/i) ? tempPath.match(/\.(jpg|jpeg|png|webp)$/i)[0] : '.jpg'
      const fileName = `${Date.now()}_${Math.random().toString(36).substr(2, 8)}${ext}`
      const destPath = `${wx.env.USER_DATA_PATH}/${fileName}`
      fs.saveFileSync(tempPath, destPath)
      return destPath
    } catch (e) {
      console.warn('[consult-publish] 保存本地图片失败:', e.message)
      return tempPath
    }
  },

  // ============ 提交 ============
  async onSubmit() {
    if (this.data.submitting) return

    try {
      await ensureLogin()
    } catch (e) {
      wx.showToast({ title: '请先登录', icon: 'none' })
      return
    }

    if (this.data.images.length < 1) {
      wx.showToast({ title: '请上传至少 1 张图片', icon: 'none' })
      this.setData({ currentIdx: 0 })
      return
    }

    const isCompare = this.data.images.length > 1

    if (!isCompare && !this.data.category) {
      wx.showToast({ title: '请选择穿搭类别', icon: 'none' })
      const idx = this.data.slideKeys.indexOf('category')
      if (idx > -1) this.setData({ currentIdx: idx })
      return
    }
    if (isCompare && !this.data.compareScene) {
      wx.showToast({ title: '请选择对比场景', icon: 'none' })
      const idx = this.data.slideKeys.indexOf('compareScene')
      if (idx > -1) this.setData({ currentIdx: idx })
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

      const type = isCompare ? 'compare' : 'buy'
      const consultData = { type, images: imageDataList }

      if (!isCompare) {
        consultData.category = this.data.category
        consultData.priceRange = this.data.priceRange
        consultData.bodyFeatures = this.data.bodyFeatures
        consultData.wearScenes = this.data.wearScenes
        consultData.trouble = this.data.trouble
      } else {
        consultData.compareScene = this.data.compareScene
        consultData.priceList = this.data.priceList
        consultData.styleDiff = this.data.styleDiff
        consultData.reason = this.data.reason
      }

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
  }
})
