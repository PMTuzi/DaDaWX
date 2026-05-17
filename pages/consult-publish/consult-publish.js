// pages/consult-publish/consult-publish.js
const { request, API } = require('../../utils/api')

Page({
  data: {
    // 图片
    images: [],
    maxImages: 4,
    minImages: 1,
    // ===== 单品标签 =====
    category: '',
    categoryIndex: -1,
    categoryOptions: ['上衣', '裤子', '半裙', '连衣裙', '外套', '衬衫', 'T恤', '针织衫', '卫衣', '风衣', '大衣', '羽绒服', '牛仔', '其他'],
    categoryDetected: false, // AI是否已识别类别
    priceRange: '',
    priceRangeIndex: -1,
    priceRangeOptions: ['100元以下', '100-300元', '300-500元', '500-1000元', '1000元以上'],
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
    imageErrors: []
  },

  onLoad() {
    try { wx.setNavigationBarTitle({ title: '穿搭决策' }) } catch (e) {}
  },

  // ===== 图片相关 =====
  onAddImage() {
    const remaining = this.data.maxImages - this.data.images.length
    if (remaining <= 0) return

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
              newImages.push({
                path: f.tempFilePath,
                thumb: f.tempFilePath,
                size: f.size
              })
            })
            if (newImages.length === 0) return

            const images = [...this.data.images, ...newImages]
            this.setData({ images })

            // 多张图片时动态扩展 priceList
            if (images.length > 1) {
              const pl = [...this.data.priceList]
              const pli = [...this.data.priceListIndexes]
              while (pl.length < images.length) {
                pl.push('')
                pli.push(-1)
              }
              this.setData({ priceList: pl, priceListIndexes: pli })
            }

            // 单张图片时自动识别类别
            if (images.length === 1 && !this.data.category) {
              this.autoDetectCategory(images[0].path).catch(err => {
                console.warn('[consult-publish] autoDetectCategory 未捕获:', err)
              })
            }
          } catch (e) {
            console.error('[consult-publish] 选择图片回调出错:', e)
            wx.showToast({ title: '图片处理失败', icon: 'none' })
          }
        },
        fail: (err) => {
          // 用户取消选择不算错误
          if (err.errMsg && err.errMsg.indexOf('cancel') > -1) return
          console.warn('[consult-publish] chooseMedia 失败:', err.errMsg)
        }
      })
    } catch (e) {
      // chooseMedia API 不可用时的兼容
      console.warn('[consult-publish] chooseMedia 不可用，尝试 chooseImage:', e)
      wx.chooseImage({
        count: remaining,
        sourceType: ['album', 'camera'],
        success: (res) => {
          try {
            const newImages = res.tempFiles.map(f => ({
              path: f.tempFilePath,
              thumb: f.tempFilePath,
              size: f.size
            }))
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
          } catch (e2) {
            console.error('[consult-publish] chooseImage 回调出错:', e2)
          }
        },
        fail: () => {}
      })
    }
  },

  // AI自动识别服饰类别
  async autoDetectCategory(imagePath) {
    try { this.setData({ categoryDetected: false }) } catch (e) {}
    try {
      // 先尝试上传图片，失败则用本地路径
      let imageUrl = imagePath
      try {
        imageUrl = await this.uploadImage(imagePath)
      } catch (e) {
        // 上传失败，用本地路径
      }

      const result = await request(API.detectCategory, {
        method: 'POST',
        data: { images: [{ imageUrl }] },
        timeout: 15000
      })

      if (result && result.code === 0 && result.data && result.data.category) {
        const detected = result.data.category
        const options = this.data.categoryOptions
        const matchIndex = options.findIndex(opt => detected.includes(opt) || opt.includes(detected))
        if (matchIndex > -1) {
          try {
            this.setData({
              category: options[matchIndex],
              categoryIndex: matchIndex,
              categoryDetected: true
            })
          } catch (e) {}
        }
      }
    } catch (err) {
      console.warn('[consult-publish] 类别识别失败:', err && err.message)
    }
  },

  onRemoveImage(e) {
    const idx = e.currentTarget.dataset.index
    const images = [...this.data.images]
    images.splice(idx, 1)
    this.setData({ images })

    // 同步 priceList
    if (images.length > 1) {
      const pl = [...this.data.priceList]
      const pli = [...this.data.priceListIndexes]
      pl.splice(idx, 1)
      pli.splice(idx, 1)
      this.setData({ priceList: pl, priceListIndexes: pli })
    }
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
      category: this.data.categoryOptions[e.detail.value],
      categoryDetected: false
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
    if (this.data.images.length < 1) {
      wx.showToast({ title: '请上传至少1张图片', icon: 'none' })
      return
    }

    const isCompare = this.data.images.length > 1

    // 单品必填校验
    if (!isCompare) {
      if (!this.data.category) {
        wx.showToast({ title: '请选择服饰类别', icon: 'none' }); return
      }
      if (!this.data.priceRange) {
        wx.showToast({ title: '请选择价格区间', icon: 'none' }); return
      }
    }

    // 对比必填校验
    if (isCompare) {
      if (!this.data.compareScene) {
        wx.showToast({ title: '请选择对比场景', icon: 'none' }); return
      }
    }

    this.setData({ submitting: true })

    try {
      // 上传图片到服务器，失败时用本地路径兜底
      const imageDataList = []
      for (const img of this.data.images) {
        try {
          const url = await this.uploadImage(img.path)
          imageDataList.push({ imageUrl: url })
        } catch (uploadErr) {
          console.warn('[consult-publish] 图片上传失败，使用本地路径:', uploadErr.message)
          imageDataList.push({ imageUrl: img.path })
        }
      }

      // 根据图片数量自动决定类型
      const type = isCompare ? 'compare' : 'buy'

      // 组装咨询数据
      const consultData = {
        type,
        images: imageDataList,
      }

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

      // 同时用 globalData 和 storage 传递数据，确保可靠
      getApp().globalData.consultData = consultData
      wx.setStorageSync('consultData', consultData)

      wx.navigateTo({
        url: `/pages/consult-analyzing/consult-analyzing?type=${type}`,
        fail: (err) => {
          console.error('[consult-publish] navigateTo 失败:', err)
          wx.showToast({ title: '页面跳转失败', icon: 'none' })
        }
      })
    } catch (err) {
      console.error('[consult-publish] 提交失败:', err)
      wx.showModal({
        title: '提交失败',
        content: err.message || '图片上传失败，请检查网络后重试',
        showCancel: false
      })
    } finally {
      this.setData({ submitting: false })
    }
  },

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
          reject(new Error(err.errMsg || '上传失败'))
        }
      })
    })
  }
})
