// pages/consult-publish/consult-publish.js
const MAX_BASE64_SIZE = 800 * 1024

Page({
  data: {
    type: 'keep', // buy | keep | compare
    typeName: '留不留',
    typeDesc: '退货还是留下？AI帮你做决定',
    // 图片
    images: [],
    maxImages: 3,
    minImages: 1,
    // ===== 单品标签 =====
    category: '',
    categoryIndex: -1,
    categoryOptions: ['上衣', '裤子', '半裙', '连衣裙', '外套', '衬衫', 'T恤', '针织衫', '卫衣', '风衣', '大衣', '羽绒服', '牛仔', '其他'],
    priceRange: '',
    priceRangeIndex: -1,
    priceRangeOptions: ['50元以下', '50-100元', '100-200元', '200-500元', '500-1000元', '1000-2000元', '2000元以上'],
    // 身型特点（多选 0-3）
    bodyFeatures: [],
    bodyFeatureOptions: ['肩宽', '窄肩', '微胖', '偏瘦', '腿粗', '腿短', '腰粗', '小个子', '高个子', '手臂粗'],
    // 穿着场景（多选 0-2）
    wearScenes: [],
    wearSceneOptions: ['日常通勤', '休闲逛街', '约会聚会', '运动户外', '正式场合', '居家休闲'],
    // 穿搭困扰（单选）
    trouble: '',
    troubleIndex: -1,
    troubleOptions: ['不知道怎么搭', '怕显胖/显矮', '颜色不知道配什么', '不知道适不适合自己', '担心过时快', '没有困扰'],
    // ===== 对比标签 =====
    // 对比场景（单选，必填）
    compareScene: '',
    compareSceneIndex: -1,
    compareSceneOptions: ['日常通勤', '约会聚会', '休闲逛街', '运动户外', '正式场合'],
    // 各款价格
    priceList: [],
    priceListIndexes: [],
    // 风格差异（多选 0-3）
    styleDiff: [],
    styleDiffOptions: ['简约vs华丽', '休闲vs正式', '甜美vs酷飒', '基础vs设计感', '低调vs吸睛', '经典vs流行'],
    // 纠结原因（单选）
    reason: '',
    reasonIndex: -1,
    reasonOptions: ['不知道哪件更显瘦', '不确定哪件更百搭', '不知道哪件质感更好', '价格差异大不知怎么选', '都喜欢不知道选哪件'],
    // 状态
    submitting: false,
    imageErrors: [] // 图片校验错误
  },

  onLoad(options) {
    const type = options.type || 'keep'
    this.initByType(type)
  },

  initByType(type) {
    const typeMap = {
      buy: { name: '买不买', desc: '想买又犹豫？AI帮你看值不值', max: 3, min: 1 },
      keep: { name: '留不留', desc: '退货还是留下？AI帮你做决定', max: 3, min: 1 },
      compare: { name: '选哪个', desc: '几件纠结选哪件？AI帮你横向对比', max: 4, min: 2 }
    }
    const config = typeMap[type] || typeMap.keep
    this.setData({
      type,
      typeName: config.name,
      typeDesc: config.desc,
      maxImages: config.max,
      minImages: config.min
    })
    wx.setNavigationBarTitle({ title: config.name })

    if (type === 'compare') {
      this.setData({
        priceList: ['', ''],
        priceListIndexes: [-1, -1]
      })
    }
  },

  // ===== 图片相关 =====
  onAddImage() {
    const remaining = this.data.maxImages - this.data.images.length
    if (remaining <= 0) return

    wx.chooseMedia({
      count: remaining,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      sizeType: ['compressed'],
      success: (res) => {
        const newImages = []
        res.tempFiles.forEach(f => {
          // 前端图片校验：尺寸检测 <5KB 拦截
          if (f.size < 5 * 1024) {
            wx.showToast({ title: '图片太小，请重新选择', icon: 'none' })
            return
          }
          newImages.push({
            path: f.tempFilePath,
            thumb: f.tempFilePath,
            size: f.size
          })
        })
        if (newImages.length === 0) return

        const images = [...this.data.images, ...newImages]
        this.setData({ images })

        // Type B 动态扩展 priceList
        if (this.data.type === 'compare') {
          const pl = [...this.data.priceList]
          const pli = [...this.data.priceListIndexes]
          while (pl.length < images.length) {
            pl.push('')
            pli.push(-1)
          }
          this.setData({ priceList: pl, priceListIndexes: pli })
        }
      }
    })
  },

  onRemoveImage(e) {
    const idx = e.currentTarget.dataset.index
    const images = [...this.data.images]
    images.splice(idx, 1)
    this.setData({ images })
  },

  onPreviewImage(e) {
    const idx = e.currentTarget.dataset.index
    wx.previewImage({
      current: this.data.images[idx].path,
      urls: this.data.images.map(i => i.path)
    })
  },

  // ===== 单品标签 =====
  onCategoryChange(e) {
    this.setData({
      categoryIndex: e.detail.value,
      category: this.data.categoryOptions[e.detail.value]
    })
  },

  onPriceRangeChange(e) {
    this.setData({
      priceRangeIndex: e.detail.value,
      priceRange: this.data.priceRangeOptions[e.detail.value]
    })
  },

  onBodyFeatureTap(e) {
    const val = e.currentTarget.dataset.value
    let list = [...this.data.bodyFeatures]
    const idx = list.indexOf(val)
    if (idx > -1) {
      list.splice(idx, 1)
    } else if (list.length < 3) {
      list.push(val)
    }
    this.setData({ bodyFeatures: list })
  },

  onWearSceneTap(e) {
    const val = e.currentTarget.dataset.value
    let list = [...this.data.wearScenes]
    const idx = list.indexOf(val)
    if (idx > -1) {
      list.splice(idx, 1)
    } else if (list.length < 2) {
      list.push(val)
    }
    this.setData({ wearScenes: list })
  },

  onTroubleChange(e) {
    this.setData({
      troubleIndex: e.detail.value,
      trouble: this.data.troubleOptions[e.detail.value]
    })
  },

  // ===== 对比标签 =====
  onCompareSceneChange(e) {
    this.setData({
      compareSceneIndex: e.detail.value,
      compareScene: this.data.compareSceneOptions[e.detail.value]
    })
  },

  onPriceListChange(e) {
    const idx = e.currentTarget.dataset.index
    const pl = [...this.data.priceList]
    const pli = [...this.data.priceListIndexes]
    pl[idx] = this.data.priceRangeOptions[e.detail.value]
    pli[idx] = e.detail.value
    this.setData({ priceList: pl, priceListIndexes: pli })
  },

  onStyleDiffTap(e) {
    const val = e.currentTarget.dataset.value
    let list = [...this.data.styleDiff]
    const idx = list.indexOf(val)
    if (idx > -1) {
      list.splice(idx, 1)
    } else if (list.length < 3) {
      list.push(val)
    }
    this.setData({ styleDiff: list })
  },

  onReasonChange(e) {
    this.setData({
      reasonIndex: e.detail.value,
      reason: this.data.reasonOptions[e.detail.value]
    })
  },

  // ===== 提交 =====
  async onSubmit() {
    if (this.data.submitting) return

    // 校验图片
    if (this.data.images.length < this.data.minImages) {
      wx.showToast({ title: `请上传至少${this.data.minImages}张图片`, icon: 'none' })
      return
    }

    // 单品必填校验
    if (this.data.type !== 'compare') {
      if (!this.data.category) {
        wx.showToast({ title: '请选择服饰类别', icon: 'none' }); return
      }
      if (!this.data.priceRange) {
        wx.showToast({ title: '请选择价格区间', icon: 'none' }); return
      }
    }

    // 对比必填校验
    if (this.data.type === 'compare') {
      if (!this.data.compareScene) {
        wx.showToast({ title: '请选择对比场景', icon: 'none' }); return
      }
    }

    this.setData({ submitting: true })

    try {
      // 图片转base64
      const imageDataList = []
      for (const img of this.data.images) {
        const base64 = await this.imageToBase64(img.path)
        imageDataList.push({ imageBase64: base64 })
      }

      // 组装咨询数据
      const consultData = {
        type: this.data.type,
        images: imageDataList,
      }

      if (this.data.type !== 'compare') {
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

      wx.setStorageSync('consultData', consultData)

      wx.navigateTo({
        url: `/pages/consult-analyzing/consult-analyzing?type=${this.data.type}`
      })
    } catch (err) {
      console.error('提交失败:', err)
      wx.showToast({ title: '图片处理失败，请重试', icon: 'none' })
    } finally {
      this.setData({ submitting: false })
    }
  },

  imageToBase64(filePath) {
    return new Promise((resolve, reject) => {
      const tryCompress = (quality, attempt) => {
        wx.compressImage({
          src: filePath,
          quality,
          success: (compRes) => {
            wx.getFileSystemManager().readFile({
              filePath: compRes.tempFilePath,
              encoding: 'base64',
              success: (readRes) => {
                let base64Str = readRes.data
                if (base64Str.length > MAX_BASE64_SIZE && attempt < 3) {
                  tryCompress(Math.max(10, quality - 20), attempt + 1)
                } else {
                  resolve(base64Str)
                }
              },
              fail: reject
            })
          },
          fail: () => {
            wx.getFileSystemManager().readFile({
              filePath,
              encoding: 'base64',
              success: (readRes) => resolve(readRes.data),
              fail: reject
            })
          }
        })
      }
      tryCompress(50, 1)
    })
  }
})
