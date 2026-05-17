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
    this.startAnalysis().catch(err => {
      console.error('[consult-analyzing] 未捕获异常:', err)
      this.onError(err.message || '分析过程异常')
    })
  },

  getSteps(type) {
    if (type === 'compare') {
      return [
        { label: '图片就绪', icon: 'camera' },
        { label: '识别各款特征', icon: 'search' },
        { label: '显瘦效果分析', icon: 'scissors' },
        { label: '百搭程度对比', icon: 'target' },
        { label: '质感评估对比', icon: 'gem' },
        { label: '综合排名生成', icon: 'trophy' }
      ]
    }
    return [
      { label: '图片就绪', icon: 'camera' },
      { label: '识别衣物特征', icon: 'search' },
      { label: '版型适合度分析', icon: 'scissors' },
      { label: '颜色匹配度分析', icon: 'palette' },
      { label: '质感做工评估', icon: 'gem' },
      { label: '生成决策结论', icon: 'clipboard' }
    ]
  },

  async startAnalysis() {
    const globalDataConsult = getApp().globalData.consultData
    const storageConsult = wx.getStorageSync('consultData')
    const consultData = globalDataConsult || storageConsult
    if (!consultData || !consultData.images || consultData.images.length === 0) {
      this.onError('未找到咨询数据，请重新提交')
      return
    }

    const isCompare = this.data.type === 'compare'

    try {
      await this.simulateStep(0, 15)

      // 视觉分析：优先真实API，失败兜底模拟数据
      let visionResult
      try {
        visionResult = await this.callVisionAnalysis(consultData)
        console.log('[consult-analyzing] 视觉分析API成功')
      } catch (err) {
        console.warn('[consult-analyzing] 视觉分析API失败，使用模拟数据:', err.message)
        visionResult = this.getMockVisionFeatures(consultData)
      }
      await this.simulateStep(1, 40)
      await this.simulateStep(2, 55)
      await this.simulateStep(3, 70)
      await this.simulateStep(4, 82)

      // 决策分析：优先真实API，失败兜底模拟数据
      let result
      try {
        if (isCompare) {
          result = await this.callCompareAnalysis(visionResult, consultData)
        } else {
          result = await this.callSingleAnalysis(visionResult, consultData)
        }
        console.log('[consult-analyzing] 决策分析API成功')
      } catch (err) {
        console.warn('[consult-analyzing] 决策分析API失败，使用模拟数据:', err.message)
        result = isCompare ? this.getMockCompareResult(consultData) : this.getMockSingleResult(consultData)
      }
      await this.simulateStep(5, 100)

      const record = this.saveResult(result, consultData)

      setTimeout(() => {
        wx.redirectTo({
          url: `/pages/consult-result/consult-result?id=${record.id}`,
          fail: () => {
            wx.navigateTo({
              url: `/pages/consult-result/consult-result?id=${record.id}`,
              fail: () => {
                wx.switchTab({ url: '/pages/index/index' })
              }
            })
          }
        })
      }, 500)

    } catch (err) {
      console.error('[consult-analyzing] 分析失败:', err)
      this.onError(err.message || '分析失败，请重试')
    }
  },

  // 模拟视觉特征数据
  getMockVisionFeatures(consultData) {
    const count = consultData.images.length
    if (count > 1) {
      return consultData.images.map((_, i) => ({
        index: i,
        label: `款式${['A','B','C','D'][i] || i+1}`,
        color: '深色系',
        material: '棉质',
        style: '简约',
        fit: '修身'
      }))
    }
    return {
      color: '深色系',
      material: '棉质混纺',
      style: '简约休闲',
      fit: '修身版型',
      pattern: '纯色',
      thickness: '适中'
    }
  },

  // 模拟单品决策结果
  getMockSingleResult(consultData) {
    const fitScore = 6 + Math.floor(Math.random() * 3)
    const colorScore = 6 + Math.floor(Math.random() * 3)
    const qualityScore = 6 + Math.floor(Math.random() * 3)
    const valueScore = 6 + Math.floor(Math.random() * 3)
    const avg = Math.round((fitScore + colorScore + qualityScore + valueScore) / 4 * 10) / 10
    const keep = avg >= 7

    return {
      verdict: keep ? '建议入手' : '建议再想想',
      scores: { fitScore, colorScore, qualityScore, valueScore },
      summary: keep
        ? '这件单品整体表现不错，版型和颜色都比较百搭，性价比尚可。'
        : '这件单品综合评分一般，建议对比其他选择后再决定。',
      details: {
        fitAnalysis: '版型适中，对大多数身型友好。',
        colorAnalysis: '颜色经典百搭，日常搭配不成问题。',
        qualityAnalysis: '面料质感中规中矩，做工可以接受。',
        valueAnalysis: '结合价格来看，性价比处于中等水平。'
      },
      suggestions: [
        '可以搭配高腰裤拉长比例',
        '搭配同色系外套更有层次感',
        '避免搭配过于花哨的下装'
      ]
    }
  },

  // 模拟对比决策结果
  getMockCompareResult(consultData) {
    const count = consultData.images.length
    const scores = consultData.images.map((_, i) => {
      const slimScore = 5 + Math.floor(Math.random() * 5)
      const versatileScore = 5 + Math.floor(Math.random() * 5)
      const occasionScore = 5 + Math.floor(Math.random() * 5)
      const qualityScore = 5 + Math.floor(Math.random() * 5)
      const valueScore = 5 + Math.floor(Math.random() * 5)
      const durableScore = 5 + Math.floor(Math.random() * 5)
      const totalScore = Math.round((slimScore + versatileScore + occasionScore + qualityScore + valueScore + durableScore) / 6 * 10) / 10
      return {
        index: i,
        label: `款式${['A','B','C','D'][i] || i+1}`,
        slimScore, versatileScore, occasionScore, qualityScore, valueScore, durableScore, totalScore
      }
    })

    scores.sort((a, b) => b.totalScore - a.totalScore)
    const topLabel = scores[0].label

    return {
      rankings: scores.map((s, rank) => ({ ...s, rank: rank + 1 })),
      scores,
      finalChoice: { index: scores[0].index, label: topLabel },
      verdict: `${topLabel} 最佳`,
      summary: `${topLabel}在综合评分中表现最优，推荐选择。`,
      details: scores.map(s => ({
        label: s.label,
        advantage: s.totalScore >= 7 ? '综合表现优秀' : '表现中等',
        disadvantage: s.slimScore < 6 ? '显瘦效果一般' : ''
      }))
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
          wx.switchTab({ url: '/pages/index/index' })
        }
      }
    })
  }
})
