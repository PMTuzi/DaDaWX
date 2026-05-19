// pages/consult-analyzing/consult-analyzing.js
const { request, API, imageToBase64 } = require('../../utils/api')

// 用闭包变量代替实例属性，避免微信小程序 Page 构造器限制
let _alive = true
let _timers = []

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
    _alive = true
    _timers = []
    const type = options.type || 'keep'
    const steps = this.getSteps(type)
    this.setData({ type, steps })
    this.startAnalysis().catch(err => {
      console.error('[consult-analyzing] 未捕获异常:', err)
      if (_alive) {
        this.onError(err && err.message ? err.message : '分析过程异常')
      }
    })
  },

  onUnload() {
    _alive = false
    this._stopCreep()
    _timers.forEach(t => clearInterval(t))
    _timers = []
  },

  onError(err) {
    console.error('[consult-analyzing] 页面错误:', err)
  },

  // 安全的 setData
  safeSetData(data) {
    if (_alive) {
      try { this.setData(data) } catch (e) {}
    }
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

  // 启动持续缓慢递增的进度（API等待期间不会卡住）
  _startCreep(maxProgress, interval) {
    this._stopCreep()
    this._creepTimer = setInterval(() => {
      if (!_alive || this.data.progress >= maxProgress) return
      this.safeSetData({ progress: this.data.progress + 1 })
    }, interval)
  },

  _stopCreep() {
    if (this._creepTimer) {
      clearInterval(this._creepTimer)
      this._creepTimer = null
    }
  },

  async startAnalysis() {
    const globalDataConsult = getApp().globalData.consultData
    const storageConsult = wx.getStorageSync('consultData')
    const consultData = globalDataConsult || storageConsult
    if (!consultData || !consultData.images || consultData.images.length === 0) {
      this.onError('未找到咨询数据，请重新提交')
      return
    }

    // 读取形象诊断报告摘要，用于量身定制分析
    consultData.reportSummary = this.getReportSummary()

    const isCompare = this.data.type === 'compare'

    try {
      await this.simulateStep(0, 15)

      // 启动缓慢递增：API等待期间进度从15缓慢爬到80
      this._startCreep(80, 2000)

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

      // API都返回后停止缓慢递增
      this._stopCreep()

      await this.simulateStep(5, 100)

      const record = this.saveResult(result, consultData)

      // 即使页面已卸载，也通知用户结果已保存
      if (!_alive) {
        wx.showToast({ title: '决策完成，请在穿搭页查看', icon: 'none', duration: 3000 })
        return
      }

      setTimeout(() => {
        if (!_alive) return
        try {
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
        } catch (e) {
          console.error('[consult-analyzing] 页面跳转失败:', e)
        }
      }, 500)

    } catch (err) {
      console.error('[consult-analyzing] 分析失败:', err)
      this.onError(err.message || '分析失败，请重试')
    }
  },

  // 从本地存储读取形象诊断报告摘要
  getReportSummary() {
    try {
      const reports = wx.getStorageSync('reports') || []
      if (reports.length === 0) return null
      const r = reports[0]
      const m = r.modules || {}
      return {
        overallScore: r.basic?.overallScore,
        tags: r.basic?.tags || [],
        // 面部&骨相
        faceType: m.dna?.faceType,
        boneType: m.dna?.boneType,
        lineStyle: m.dna?.lineStyle,
        dnaInsight: m.dna?.keyInsight,
        // 皮肤&风格
        season: m.style?.season,
        skinType: m.style?.skinType,
        mainStyle: m.style?.mainStyle,
        styleFeatures: m.style?.styleFeatures,
        clothingAdvice: m.style?.clothingAdvice,
        goodColors: (m.style?.goodColors || []).map(c => c.name),
        badColors: (m.style?.badColors || []).map(c => c.name),
        styleInsight: m.style?.keyInsight,
        // 发型&妆容
        hairmakeupInsight: m.hairmakeup?.keyInsight,
        // 颜值&蜕变
        coreConclusion: m.optimize?.coreConclusion,
        optimizeInsight: m.optimize?.keyInsight
      }
    } catch (e) {
      console.warn('[consult-analyzing] 读取报告摘要失败:', e.message)
      return null
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
    // 构建图片数据：优先用 imageUrl，没有则将 localPath 转 base64
    const imagesForApi = []
    for (const img of consultData.images) {
      if (img.imageUrl) {
        imagesForApi.push({ imageUrl: img.imageUrl })
      } else if (img.localPath) {
        try {
          const base64 = await imageToBase64(img.localPath)
          imagesForApi.push({ imageBase64: base64 })
        } catch (e) {
          console.warn('[consult-analyzing] 本地图片转base64失败:', e.message)
        }
      }
    }
    if (imagesForApi.length === 0) {
      throw new Error('没有可用的图片数据')
    }

    const result = await request(API.analyzeClothingVision, {
      method: 'POST',
      data: {
        images: imagesForApi,
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
        consultScene: consultData.type,
        reportSummary: consultData.reportSummary || null
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
        reason: consultData.reason,
        reportSummary: consultData.reportSummary || null
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
      if (!_alive) { resolve(); return }
      this.safeSetData({ currentStep: stepIndex })
      const startProgress = this.data.progress
      const diff = targetProgress - startProgress
      const steps = 20
      const increment = diff / steps
      let count = 0

      const timer = setInterval(() => {
        if (!_alive) {
          clearInterval(timer)
          resolve()
          return
        }
        count++
        const newProgress = Math.round(startProgress + increment * count)
        this.safeSetData({ progress: Math.min(newProgress, targetProgress) })
        if (count >= steps) {
          clearInterval(timer)
          resolve()
        }
      }, 80)
      _timers.push(timer)
    })
  },

  saveResult(result, consultData) {
    try {
      const id = 'C' + Date.now()
      const now = new Date()
      const createTime = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`

      const record = {
        id,
        type: consultData.type,
        createTime,
        category: consultData.category || '',
        ...result,
        images: consultData.images || []
      }

      console.log('[consult-analyzing] 保存记录, images数量:', (record.images || []).length)

      if (result.scores) {
        if (consultData.type === 'compare') {
          // 对比模式：totalScore可能是6维总和(0-60)或平均分(0-10)，归一化到0-10
          if (result.rankings && result.rankings.length > 0) {
            result.rankings.forEach(r => {
              if (r.totalScore > 10) {
                // 6维总和，取平均
                r.totalScore = Math.round(r.totalScore / 6 * 10) / 10
              }
            })
          }
          if (result.scores && Array.isArray(result.scores)) {
            result.scores.forEach(s => {
              if (s.totalScore > 10) {
                s.totalScore = Math.round(s.totalScore / 6 * 10) / 10
              }
            })
          }
          const topRank = result.rankings && result.rankings[0]
          record.totalScore = topRank ? Math.min(topRank.totalScore, 10) : '--'
          record.finalChoiceLabel = result.finalChoice ? result.finalChoice.label : ''
          record.verdict = record.finalChoiceLabel + ' 最佳'
        } else {
          const s = result.scores
          record.totalScore = Math.min(Math.round((s.fitScore + s.colorScore + s.qualityScore + s.valueScore) / 4 * 10) / 10, 10)
          record.verdict = result.verdict
        }
      }

      const records = wx.getStorageSync('consultRecords') || []
      records.unshift(record)
      if (records.length > 20) records.length = 20
      wx.setStorageSync('consultRecords', records)

      try { wx.removeStorageSync('consultData') } catch (e) {}
      try { getApp().globalData.consultData = null } catch (e) {}

      return record
    } catch (err) {
      console.error('[consult-analyzing] 保存结果失败:', err)
      return { id: 'C' + Date.now(), type: consultData.type, ...result, images: consultData.images || [] }
    }
  },

  onError(msg) {
    if (!_alive) return
    this.safeSetData({ animating: false, errorMsg: msg })
    wx.showModal({
      title: '分析失败',
      content: msg || '未知错误',
      confirmText: '重新提交',
      cancelText: '返回',
      success: (res) => {
        if (res.confirm) {
          wx.navigateBack({ fail: () => wx.switchTab({ url: '/pages/index/index' }) })
        } else {
          wx.switchTab({ url: '/pages/index/index' })
        }
      },
      fail: () => {
        wx.switchTab({ url: '/pages/index/index' })
      }
    })
  }
})
