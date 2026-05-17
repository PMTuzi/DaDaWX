// pages/consult-analyzing/consult-analyzing.js
const { request, API } = require('../../utils/api')

Page({
  data: {
    type: 'keep',
    progress: 0,
    currentStep: 0,
    steps: [],
    animating: true,
    errorMsg: ''
  },

  onLoad(options) {
    const type = options.type || 'keep'
    const steps = this.getSteps(type)
    this.setData({ type, steps })
    this.startAnalysis()
  },

  getSteps(type) {
    if (type === 'compare') {
      return [
        { label: '图片就绪', icon: '📸' },
        { label: '识别各款特征', icon: '🔍' },
        { label: '显瘦效果分析', icon: '✂️' },
        { label: '百搭程度对比', icon: '🎯' },
        { label: '质感评估对比', icon: '💎' },
        { label: '综合排名生成', icon: '🏆' }
      ]
    }
    return [
      { label: '图片就绪', icon: '📸' },
      { label: '识别衣物特征', icon: '🔍' },
      { label: '版型适合度分析', icon: '✂️' },
      { label: '颜色匹配度分析', icon: '🎨' },
      { label: '质感做工评估', icon: '💎' },
      { label: '生成决策结论', icon: '📋' }
    ]
  },

  async startAnalysis() {
    const consultData = getApp().globalData.consultData || wx.getStorageSync('consultData')
    if (!consultData || !consultData.images || consultData.images.length === 0) {
      this.onError('未找到咨询数据，请重新提交')
      return
    }

    try {
      await this.simulateStep(0, 15)

      const isCompare = this.data.type === 'compare'
      const visionResult = await this.callVisionAnalysis(consultData)
      await this.simulateStep(1, 40)

      await this.simulateStep(2, 55)
      await this.simulateStep(3, 70)
      await this.simulateStep(4, 82)

      let result
      if (isCompare) {
        result = await this.callCompareAnalysis(visionResult, consultData)
      } else {
        result = await this.callSingleAnalysis(visionResult, consultData)
      }
      await this.simulateStep(5, 100)

      const record = this.saveResult(result, consultData)

      setTimeout(() => {
        wx.redirectTo({
          url: `/pages/consult-result/consult-result?id=${record.id}`
        })
      }, 500)

    } catch (err) {
      console.error('[穿搭分析] 失败:', err)
      this.onError(err.message || '分析失败，请重试')
    }
  },

  async callVisionAnalysis(consultData) {
    const isCompare = consultData.type === 'compare'
    const result = await request(API.analyzeClothingVision, {
      method: 'POST',
      data: {
        images: consultData.images,
        consultType: isCompare ? 'compare' : 'single'
      },
      timeout: 120000
    })
    if (result.code !== 0) {
      throw new Error(result.message || '视觉分析失败')
    }
    return result.data.features
  },

  async callSingleAnalysis(visionFeatures, consultData) {
    const result = await request(API.generateSingleConsult, {
      method: 'POST',
      data: {
        visualFeatures: visionFeatures,
        category: consultData.category,
        priceRange: consultData.priceRange,
        bodyFeatures: consultData.bodyFeatures,
        wearScenes: consultData.wearScenes,
        trouble: consultData.trouble,
        consultScene: consultData.type
      },
      timeout: 120000
    })
    if (result.code !== 0) {
      throw new Error(result.message || '单品决策失败')
    }
    return result.data
  },

  async callCompareAnalysis(visionFeatures, consultData) {
    const result = await request(API.generateCompareConsult, {
      method: 'POST',
      data: {
        visualFeatures: visionFeatures,
        compareScene: consultData.compareScene,
        priceList: consultData.priceList,
        styleDiff: consultData.styleDiff,
        reason: consultData.reason
      },
      timeout: 120000
    })
    if (result.code !== 0) {
      throw new Error(result.message || '多选一决策失败')
    }
    return result.data
  },

  simulateStep(stepIndex, targetProgress) {
    return new Promise((resolve) => {
      this.setData({ currentStep: stepIndex })
      const startProgress = this.data.progress
      const diff = targetProgress - startProgress
      const steps = 20
      const increment = diff / steps
      let count = 0

      const timer = setInterval(() => {
        count++
        const newProgress = Math.round(startProgress + increment * count)
        this.setData({ progress: Math.min(newProgress, targetProgress) })
        if (count >= steps) {
          clearInterval(timer)
          resolve()
        }
      }, 80)
    })
  },

  saveResult(result, consultData) {
    const id = 'C' + Date.now()
    const now = new Date()
    const createTime = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`

    const record = {
      id,
      type: consultData.type,
      createTime,
      category: consultData.category || '',
      ...result
    }

    if (result.scores) {
      if (consultData.type === 'compare') {
        const topRank = result.rankings && result.rankings[0]
        record.totalScore = topRank ? topRank.totalScore : '--'
        record.finalChoiceLabel = result.finalChoice ? result.finalChoice.label : ''
        record.verdict = record.finalChoiceLabel + ' 最佳'
      } else {
        const s = result.scores
        record.totalScore = Math.round((s.fitScore + s.colorScore + s.qualityScore + s.valueScore) / 4 * 10) / 10
        record.verdict = result.verdict
      }
    }

    const records = wx.getStorageSync('consultRecords') || []
    records.unshift(record)
    if (records.length > 20) records.length = 20
    wx.setStorageSync('consultRecords', records)

    wx.removeStorageSync('consultData')
    getApp().globalData.consultData = null

    return record
  },

  onError(msg) {
    this.setData({ animating: false, errorMsg: msg })
    wx.showModal({
      title: '分析失败',
      content: msg,
      confirmText: '重新提交',
      cancelText: '返回',
      success: (res) => {
        if (res.confirm) {
          wx.navigateBack()
        } else {
          wx.switchTab({ url: '/pages/outfit/outfit' })
        }
      }
    })
  }
})
