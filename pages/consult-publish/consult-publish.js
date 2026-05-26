// pages/consult-publish/consult-publish.js
const { request, API, uploadImage, ensureLogin } = require('../../utils/api')

Page({
  data: {
    // 图片
    images: [],
    maxImages: 4,
    minImages: 1,
    // ===== 单品标签 =====
    category: '',
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
    troubleOptions: ['不知道怎么搭', '怕显胖/显矮/显黑', '颜色不知道配什么', '不知道适不适合自己', '担心过时快', '不确定质感好不好', '没有困扰'],
    // ===== 对比标签 =====
    // 对比场景（单选，必填）
    compareScene: '',
    compareSceneIndex: -1,
    compareSceneOptions: ['日常通勤', '约会聚会', '休闲逛街', '运动户外', '正式场合', '聚会派对'],
    // 各款价格
    priceList: [],
    priceListIndexes: [],
    // 风格差异（多选 0-3）
    styleDiff: [],
    styleDiffOptions: ['简约vs华丽', '休闲vs正式', '甜美vs酷飒', '基础vs设计感', '低调vs吸睛', '经典vs流行', '日常vs派对'],
    // 纠结原因（单选）
    reason: '',
    reasonIndex: -1,
    reasonOptions: ['不知道哪个更适合我', '不确定哪个更百搭', '不知道哪个质感更好', '价格差异大不知怎么选', '都喜欢不知道选哪个', '不确定哪个颜色更衬我'],
    // 状态
    submitting: false,
    imageErrors: []
  },

  onLoad() {
    try { wx.setNavigationBarTitle({ title: '发布咨询' }) } catch (e) {}
  },

  onError(err) {
    console.error('[consult-publish] 页面错误:', err)
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
        sizeType: ['compressed'],
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

  // AI自动识别穿搭类别
  async autoDetectCategory(imagePath) {
    try { this.setData({ categoryDetected: false }) } catch (e) {}
    try {
      // 服务器不可达时直接跳过，不浪费时间尝试上传和API调用
      const { checkServerReachable } = require('../../utils/api')
      const reachable = await checkServerReachable()
      if (!reachable) {
        console.log('[consult-publish] 服务器不可达，跳过AI类别识别')
        return
      }

      // 先持久化临时文件，防止上传超时后微信回收临时路径
      let safePath = imagePath
      try {
        const fs = wx.getFileSystemManager()
        fs.accessSync(imagePath)
      } catch (e) {
        console.warn('[consult-publish] 原始临时路径不可访问，跳过AI类别识别')
        return
      }

      // 仅 OSS 直传：失败就跳过分类识别（不阻塞用户继续操作）
      let imageUrl
      try {
        imageUrl = await Promise.race([
          uploadImage(safePath),
          new Promise((_, reject) => setTimeout(() => reject(new Error('上传超时')), 15000))
        ])
      } catch (e) {
        console.warn('[consult-publish] OSS 上传失败，跳过AI类别识别:', e.message)
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
          this.setData({
            category: detected,
            categoryDetected: true
          })
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
  onCategoryInput(e) {
    this.setData({
      category: e.detail.value,
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

  // 将临时图片保存到持久化目录，确保跨页面/跨会话可用
  async saveImageToLocal(tempPath) {
    try {
      const fs = wx.getFileSystemManager()
      const ext = tempPath.match(/\.(jpg|jpeg|png|webp)$/i) ? tempPath.match(/\.(jpg|jpeg|png|webp)$/i)[0] : '.jpg'
      const fileName = `${Date.now()}_${Math.random().toString(36).substr(2, 8)}${ext}`
      const destPath = `${wx.env.USER_DATA_PATH}/${fileName}`
      fs.saveFileSync(tempPath, destPath)
      return destPath
    } catch (e) {
      console.warn('[consult-publish] 保存本地图片失败，使用临时路径:', e.message)
      return tempPath
    }
  },

  // ===== 提交 =====
  async onSubmit() {
    if (this.data.submitting) return

    // 登录拦截
    try {
      await ensureLogin()
    } catch (e) {
      wx.showToast({ title: '请先登录', icon: 'none' })
      return
    }

    // 校验图片
    if (this.data.images.length < 1) {
      wx.showToast({ title: '请上传至少1张图片', icon: 'none' })
      return
    }

    const isCompare = this.data.images.length > 1

    // 单品必填校验
    if (!isCompare) {
      if (!this.data.category) {
        wx.showToast({ title: '请选择穿搭类别', icon: 'none' }); return
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
      // 1. 将临时图片保存到持久化本地目录（确保图片始终可显示）
      const imageDataList = []
      for (const img of this.data.images) {
        const localPath = await this.saveImageToLocal(img.path)
        imageDataList.push({ localPath })
      }

      // 2. 上传到 OSS（必须成功，否则分析页临时图片会过期）
      const { checkServerReachable } = require('../../utils/api')
      const serverReachable = await checkServerReachable()
      if (!serverReachable) {
        wx.showToast({ title: '服务器连接失败，请检查网络', icon: 'none' })
        this.setData({ submitting: false })
        return
      }
      const uploadPromises = imageDataList.map(async (item, i) => {
        const uploadPath = item.localPath || this.data.images[i].path
        // 单图最多 2 次上传机会（避免冷启动单次失败）
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
