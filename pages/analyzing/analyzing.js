// pages/analyzing/analyzing.js
const { request, API } = require('../../utils/api')
const { validateReport, safeMergeReport, FALLBACK_REPORT } = require('../../utils/report-schema')

// 用闭包变量代替实例属性
let _alive = true
let _timers = []

Page({
  data: {
    progress: 0,
    currentStep: 0,
    steps: [
      { label: '图片上传', icon: 'upload', status: 'pending' },
      { label: '视觉特征提取', icon: 'eye', status: 'pending' },
      { label: '脸型分析', icon: 'search', status: 'pending' },
      { label: '肤色检测', icon: 'palette', status: 'pending' },
      { label: '风格匹配', icon: 'sparkle', status: 'pending' },
      { label: '报告生成', icon: 'clipboard', status: 'pending' }
    ],
    ossUrl: '',
    imageUrl: '',
    imageBase64: '',
    photoType: 'face',
    userTags: [],
    analyzing: true,
    errorMsg: ''
  },

  onLoad(options) {
    _alive = true
    _timers = []
    try {
      const imageUrl = decodeURIComponent(options.imageUrl || '')
      const ossUrl = decodeURIComponent(options.ossUrl || '')
      // 从 globalData 读取 base64
      let imageBase64 = ''
      if (options.hasBase64 === '1') {
        imageBase64 = getApp().globalData.tempImageBase64 || ''
        getApp().globalData.tempImageBase64 = ''
      }
      let userTags = []
      if (options.tags) {
        try {
          userTags = JSON.parse(decodeURIComponent(options.tags))
        } catch (e) {
          console.warn('[analyzing] tags 解析失败')
        }
      }
      this.setData({
        imageUrl,
        ossUrl,
        imageBase64,
        photoType: options.photoType || 'face',
        userTags
      })
    } catch (e) {
      console.error('[analyzing] onLoad 参数解析失败:', e)
    }

    this.startAnalysis().catch(err => {
      console.error('[analyzing] startAnalysis未捕获异常:', err)
      if (_alive) {
        this.onError(err && err.message ? err.message : '诊断异常')
      }
    })
  },

  onUnload() {
    _alive = false
    _timers.forEach(t => clearInterval(t))
    _timers = []
  },

  onError(err) {
    console.error('[analyzing] 页面错误:', err)
  },

  // 安全的 setData
  safeSetData(data) {
    if (_alive) {
      try { this.setData(data) } catch (e) {}
    }
  },

  async startAnalysis() {
    try {
      // 步骤1: 图片就绪
      await this.simulateStep(0, 15)
      this.setStepStatus(0, 'done')

      // 步骤2: 调用通义千问-VL 提取视觉特征
      this.setStepStatus(1, 'active')
      const visionData = {
        photoType: this.data.photoType
      }
      if (this.data.imageBase64) {
        visionData.imageBase64 = this.data.imageBase64
      } else {
        visionData.imageUrl = this.data.imageUrl || this.data.ossUrl
      }

      // 视觉分析：优先真实API，失败兜底模拟数据
      let visionResult
      try {
        visionResult = await request(API.analyzeVision, {
          method: 'POST',
          data: visionData,
          timeout: 120000
        })
        if (visionResult.code !== 0) {
          throw new Error(visionResult.message || '视觉分析失败')
        }
        console.log('[analyzing] 视觉分析API成功')
      } catch (err) {
        console.warn('[analyzing] 视觉分析API失败，使用模拟数据:', err.message)
        visionResult = { code: 0, data: this.getMockVisionData() }
      }

      await this.simulateStep(1, 40)
      this.setStepStatus(1, 'done')

      // 步骤3-5: 依次展示分析维度动画
      this.setStepStatus(2, 'active')
      await this.simulateStep(2, 55)
      this.setStepStatus(2, 'done')

      this.setStepStatus(3, 'active')
      await this.simulateStep(3, 70)
      this.setStepStatus(3, 'done')

      this.setStepStatus(4, 'active')
      await this.simulateStep(4, 82)
      this.setStepStatus(4, 'done')

      // 步骤6: 调用通义千问4.0 生成结构化报告
      this.setStepStatus(5, 'active')

      let report
      try {
        const reportResult = await request(API.generateReport, {
          method: 'POST',
          data: {
            imageUrl: this.data.imageUrl || this.data.ossUrl,
            visualFeatures: visionResult.data.features,
            userTags: this.data.userTags,
            quantMetrics: visionResult.data.metrics
          },
          timeout: 120000
        })

        if (reportResult.code !== 0) {
          throw new Error(reportResult.message || '报告生成失败')
        }

        // 校验报告格式
        if (validateReport(reportResult.data)) {
          report = reportResult.data
        } else {
          // 重试1次
          try {
            const retryResult = await request(API.generateReport, {
              method: 'POST',
              data: {
                imageUrl: this.data.imageUrl || this.data.ossUrl,
                visualFeatures: visionResult.data.features,
                userTags: this.data.userTags,
                quantMetrics: visionResult.data.metrics,
                isRetry: true
              }
            })
            if (retryResult.code === 0 && validateReport(retryResult.data)) {
              report = retryResult.data
            } else {
              report = safeMergeReport(reportResult.data)
            }
          } catch (retryErr) {
            report = safeMergeReport(reportResult.data)
          }
        }
        console.log('[analyzing] 报告生成API成功')
      } catch (err) {
        console.warn('[analyzing] 报告生成API失败，使用兜底报告:', err.message)
        report = safeMergeReport(null)
      }

      await this.simulateStep(5, 100)

      // 补充元信息
      report.id = 'R' + Date.now()
      report.createTime = this.formatNow()
      report.photoType = this.data.photoType

      // 保存到本地
      this.saveReport(report)

      this.setStepStatus(5, 'done')

      // 跳转报告页
      setTimeout(() => {
        if (!_alive) return
        try {
          wx.redirectTo({
            url: `/pages/report/report?id=${report.id}`,
            fail: () => {
              wx.navigateTo({
                url: `/pages/report/report?id=${report.id}`,
                fail: () => {
                  wx.switchTab({ url: '/pages/index/index' })
                }
              })
            }
          })
        } catch (e) {
          console.error('[analyzing] 页面跳转失败:', e)
        }
      }, 500)

    } catch (err) {
      console.error('[analyzing] 诊断失败:', err)
      this.onError(err.message || '诊断失败，请重试')
    }
  },

  // 模拟视觉特征数据（API失败时兜底）
  getMockVisionData() {
    return {
      features: {
        faceShape: { type: 'oval', smoothness: 7, boneStructure: 6, proportion: 8 },
        skinTone: { undertone: 'warm', brightness: 6, purity: 7 },
        features: { eyeShape: '杏眼', noseShape: '挺直', lipShape: '饱满' },
        styleIndicators: { mass: '中', curve: '偏曲', movement: '偏静' },
        bodyIndicators: { shoulderType: '标准', bodyRatio: '均衡' }
      },
      metrics: {
        faceWidthToHeight: 0.75,
        jawToForehead: 0.85,
        eyeSpacing: 0.45,
        noseWidth: 0.35,
        lipToNoseRatio: 0.6
      }
    }
  },

  simulateStep(stepIndex, targetProgress) {
    return new Promise(resolve => {
      if (!_alive) { resolve(); return }
      const current = this.data.progress
      const diff = targetProgress - current
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
        const newProgress = Math.min(current + increment * count, targetProgress)
        this.safeSetData({ progress: Math.round(newProgress) })

        if (count >= steps) {
          clearInterval(timer)
          resolve()
        }
      }, 80)
      _timers.push(timer)
    })
  },

  setStepStatus(index, status) {
    if (!_alive) return
    try {
      const steps = this.data.steps
      steps[index].status = status
      this.safeSetData({ currentStep: index, steps })
    } catch (e) {}
  },

  saveReport(report) {
    try {
      const reports = wx.getStorageSync('reports') || []
      reports.unshift(report)
      if (reports.length > 20) reports.length = 20
      wx.setStorageSync('reports', reports)
    } catch (e) {
      console.error('[analyzing] 保存报告失败:', e)
    }
  },

  formatNow() {
    const d = new Date()
    const pad = n => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
  },

  onError(msg) {
    if (!_alive) return
    this.safeSetData({ analyzing: false, errorMsg: msg })
    wx.showModal({
      title: '诊断失败',
      content: msg || 'AI 分析过程出现异常，请重新尝试',
      confirmText: '重新诊断',
      cancelText: '返回首页',
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
