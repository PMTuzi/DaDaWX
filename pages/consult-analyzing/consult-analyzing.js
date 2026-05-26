// pages/consult-analyzing/consult-analyzing.js
const { request, API, checkServerReachable, pollConsultTask } = require('../../utils/api')
const taskState = require('../../utils/task-state')

// 用闭包变量代替实例属性，避免微信小程序 Page 构造器限制
// 实例级状态


Page({
  data: {
    type: 'keep',
    progress: 0,
    currentStep: 0,
    steps: [],
    previewImage: '',
    previewImages: [],
    previewIndex: 0,
    animating: true,
    errorMsg: ''
  },

  onLoad(options) {
    this._alive = true
    this._timers = []
    const type = options.type || 'keep'
    const steps = this.getSteps(type)
    // 收集所有图片用于扫描动画展示（多图轮播）
    let previewImages = []
    try {
      const consultData = getApp().globalData.consultData || wx.getStorageSync('consultData')
      const imgs = consultData && consultData.images
      if (imgs && imgs.length) {
        previewImages = imgs.map(i => i.localPath || i.imageUrl || '').filter(Boolean)
      }
    } catch (e) {}
    const previewImage = previewImages[0] || ''
    this.setData({ type, steps, previewImage, previewImages, previewIndex: 0 })

    // 多图（2-4 张）每 1.6s 轮换一次
    if (previewImages.length >= 2) {
      this._previewTimer = setInterval(() => {
        if (!this._alive) return
        const list = this.data.previewImages || []
        if (!list.length) return
        const next = (this.data.previewIndex + 1) % list.length
        this.safeSetData({ previewIndex: next, previewImage: list[next] })
      }, 3000)
      this._timers.push(this._previewTimer)
    }
    this.startAnalysis().catch(err => {
      console.error('[consult-analyzing] 未捕获异常:', err)
      taskState.set('consult', { status: 'error', errorMsg: err && err.message ? err.message : '分析过程异常' })
      if (this._alive) {
        this.onError(err && err.message ? err.message : '分析过程异常')
      }
    })
  },

  onUnload() {
    this._alive = false
    this._stopCreep()
    this._timers.forEach(t => clearInterval(t))
    this._timers = []
  },

  onError(err) {
    console.error('[consult-analyzing] 页面错误:', err)
  },

  // 安全的 setData
  safeSetData(data) {
    if (this._alive) {
      try { this.setData(data) } catch (e) {}
    }
    if (data && typeof data.progress === 'number') {
      taskState.set('consult', { status: 'running', progress: data.progress, label: 'AI 穿搭决策中' })
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
      { label: '识别单品特征', icon: 'search' },
      { label: '匹配度分析', icon: 'scissors' },
      { label: '风格适配分析', icon: 'palette' },
      { label: '品质价值评估', icon: 'gem' },
      { label: '生成决策结论', icon: 'clipboard' }
    ]
  },

  // 启动持续缓慢递增的进度（API等待期间不会卡住）
  _startCreep(maxProgress, interval) {
    this._stopCreep()
    this._creepTimer = setInterval(() => {
      if (!this._alive || this.data.progress >= maxProgress) return
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

      // 视觉分析：必须使用真实API
      let visionResult
      const serverReachable = await checkServerReachable()
      if (!serverReachable) {
        throw new Error('服务器不可达，请检查网络后重试')
      }
      try {
        visionResult = await this.callVisionAnalysis(consultData)
        console.log('[consult-analyzing] 视觉分析API成功')
      } catch (err) {
        console.error('[consult-analyzing] 视觉分析API失败:', err.message)
        throw new Error('视觉分析失败：' + (err.message || '请重试'))
      }
      await this.simulateStep(1, 40)
      await this.simulateStep(2, 55)
      await this.simulateStep(3, 70)
      await this.simulateStep(4, 82)

      // 决策分析：必须使用真实API
      let result
      try {
        if (isCompare) {
          result = await this.callCompareAnalysis(visionResult, consultData)
        } else {
          result = await this.callSingleAnalysis(visionResult, consultData)
        }
        console.log('[consult-analyzing] 决策分析API成功')
      } catch (err) {
        console.error('[consult-analyzing] 决策分析API失败:', err.message)
        throw new Error('决策分析失败：' + (err.message || '请重试'))
      }

      // API都返回后停止缓慢递增
      this._stopCreep()

      await this.simulateStep(5, 100)

      const record = this.saveResult(result, consultData)

      // 通知全局：决策完成，可在穿搭决策 Tab 查看
      taskState.set('consult', {
        status: 'done',
        progress: 100,
        label: '穿搭决策完成',
        resultUrl: `/pages/consult-result/consult-result?id=${record.id}`,
        resultId: record.id
      })

      // 即使页面已卸载，也通知用户结果已保存
      if (!this._alive) {
        wx.showToast({ title: '决策完成，请在穿搭页查看', icon: 'none', duration: 3000 })
        return
      }

      setTimeout(() => {
        if (!this._alive) return
        try {
          taskState.clear('consult')
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
      this._stopCreep()
      console.error('[consult-analyzing] 分析失败:', err)
      taskState.set('consult', { status: 'error', errorMsg: err.message || '分析失败，请重试' })
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



  async callVisionAnalysis(consultData) {
    const isCompare = consultData.type === 'compare'
    // 构建图片数据：只用 imageUrl（OSS 永久URL）；本地 tempPath 易过期，不再走 base64 回退
    const imagesForApi = []
    for (const img of consultData.images) {
      if (img.imageUrl) {
        imagesForApi.push({ imageUrl: img.imageUrl })
      } else {
        console.warn('[consult-analyzing] 图片缺少 imageUrl，跳过:', img)
      }
    }
    if (imagesForApi.length === 0) {
      throw new Error('没有可用的图片数据，请返回重新上传')
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
    // 记录 sessionId，后续 single/compare 用 sessionId 替代 features 体积，避开 callContainer 1MB 限制
    this._visionSessionId = result.data.visionSessionId
    return result.data.features
  },

  async callSingleAnalysis(visionFeatures, consultData) {
    // 异步任务：先 POST 拿 taskId，再轮询任务状态（避开 callContainer 60s 网关超时）
    const submit = await request(API.generateSingleConsult, {
      method: 'POST',
      data: {
        visionSessionId: this._visionSessionId,
        category: consultData.category,
        priceRange: consultData.priceRange,
        bodyFeatures: consultData.bodyFeatures,
        wearScenes: consultData.wearScenes,
        trouble: consultData.trouble,
        consultScene: consultData.type,
        reportSummary: consultData.reportSummary || null
      },
      timeout: 15000
    })
    if (!submit || submit.code !== 0 || !submit.data || !submit.data.taskId) {
      throw new Error((submit && submit.message) || '提交单品任务失败')
    }
    return await pollConsultTask(submit.data.taskId)
  },

  async callCompareAnalysis(visionFeatures, consultData) {
    const category = (Array.isArray(visionFeatures) && visionFeatures[0] && visionFeatures[0].category) || ''
    const submit = await request(API.generateCompareConsult, {
      method: 'POST',
      data: {
        visionSessionId: this._visionSessionId,
        compareScene: consultData.compareScene,
        priceList: consultData.priceList,
        styleDiff: consultData.styleDiff,
        reason: consultData.reason,
        category: category,
        reportSummary: consultData.reportSummary || null
      },
      timeout: 15000
    })
    if (!submit || submit.code !== 0 || !submit.data || !submit.data.taskId) {
      throw new Error((submit && submit.message) || '提交多选一任务失败')
    }
    return await pollConsultTask(submit.data.taskId)
  },

  simulateStep(stepIndex, targetProgress) {
    return new Promise((resolve) => {
      if (!this._alive) { resolve(); return }
      this.safeSetData({ currentStep: stepIndex })
      const startProgress = this.data.progress
      const diff = targetProgress - startProgress
      const steps = 20
      const increment = diff / steps
      let count = 0

      const timer = setInterval(() => {
        if (!this._alive) {
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
      this._timers.push(timer)
    })
  },

  saveResult(result, consultData) {
    try {
      const id = 'C' + Date.now() + '_' + Math.random().toString(36).substr(2, 6)
      const now = new Date()
      const createTime = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`

      const record = {
        id,
        type: consultData.type,
        createTime,
        category: consultData.category || (result.scores && result.scores[0] && result.scores[0].category) || '',
        ...result,
        images: consultData.images || []
      }

      console.log('[consult-analyzing] 保存记录, images数量:', (record.images || []).length)

      if (result.scores) {
        // 工具：把任意数值 clamp 到 [0,10]，并保留 1 位小数
        const clamp10 = (v) => {
          const n = Number(v)
          if (!isFinite(n)) return 0
          if (n < 0) return 0
          if (n > 10) return 10
          return Math.round(n * 10) / 10
        }
        // 是否维度字段（排除元信息字段）
        const META_KEYS = new Set(['index', 'label', 'totalScore', 'category'])
        const isDimKey = (k) => !META_KEYS.has(k)

        if (consultData.type === 'compare') {
          // 1) 先 clamp 每个款式各维度分；2) 用维度均值重算 totalScore；3) clamp totalScore
          if (Array.isArray(result.scores)) {
            result.scores.forEach(s => {
              const dimKeys = Object.keys(s).filter(isDimKey).filter(k => typeof s[k] === 'number')
              dimKeys.forEach(k => { s[k] = clamp10(s[k]) })
              if (dimKeys.length > 0) {
                const avg = dimKeys.reduce((a, k) => a + s[k], 0) / dimKeys.length
                s.totalScore = clamp10(avg)
              } else {
                s.totalScore = clamp10(s.totalScore)
              }
            })
          }
          // 同步 rankings 的 totalScore：优先用 scores 里算好的同 index 值
          if (Array.isArray(result.rankings)) {
            result.rankings.forEach(r => {
              const matched = Array.isArray(result.scores) && result.scores.find(s => s.index === r.index)
              r.totalScore = matched && typeof matched.totalScore === 'number'
                ? matched.totalScore
                : clamp10(r.totalScore)
            })
            // 重新排序，确保 rankings[0] 是最高分
            result.rankings.sort((a, b) => (b.totalScore || 0) - (a.totalScore || 0))
          }
          const topRank = result.rankings && result.rankings[0]
          record.totalScore = topRank ? topRank.totalScore : '--'
          record.finalChoiceLabel = result.finalChoice ? result.finalChoice.label : ''
          record.verdict = record.finalChoiceLabel + ' 最佳'
          if (topRank && topRank.label) {
            const styleIdx = ['款式A', '款式B', '款式C', '款式D'].indexOf(topRank.label)
            record.recommendedIndex = styleIdx >= 0 ? styleIdx : 0
          }
        } else {
          // 单图模式：clamp 各维度分，再按实际维度均值算 totalScore
          const s = result.scores
          const dimKeys = Object.keys(s).filter(isDimKey).filter(k => typeof s[k] === 'number')
          dimKeys.forEach(k => { s[k] = clamp10(s[k]) })
          if (dimKeys.length > 0) {
            const avg = dimKeys.reduce((a, k) => a + s[k], 0) / dimKeys.length
            record.totalScore = clamp10(avg)
          } else {
            record.totalScore = '--'
          }
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
    if (!this._alive) return
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
