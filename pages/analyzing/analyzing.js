// pages/analyzing/analyzing.js
const { request, API } = require('../../utils/api')
const { validateReport, safeMergeReport } = require('../../utils/report-schema')

Page({
  data: {
    progress: 0,
    currentStep: 0,
    steps: [
      { label: '图片上传', icon: '📤', status: 'pending' },
      { label: '视觉特征提取', icon: '👁️', status: 'pending' },
      { label: '脸型分析', icon: '🔍', status: 'pending' },
      { label: '肤色检测', icon: '🎨', status: 'pending' },
      { label: '风格匹配', icon: '✨', status: 'pending' },
      { label: '报告生成', icon: '📋', status: 'pending' }
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
    const imageUrl = decodeURIComponent(options.imageUrl || '')
    const ossUrl = decodeURIComponent(options.ossUrl || '')
    // 从 storage 读取 base64（由 diagnose 页面存入）
    let imageBase64 = ''
    if (options.hasBase64 === '1') {
      imageBase64 = wx.getStorageSync('tempImageBase64') || ''
      wx.removeStorageSync('tempImageBase64')
    }
    this.setData({
      imageUrl,
      ossUrl,
      imageBase64,
      photoType: options.photoType || 'face',
      userTags: options.tags ? JSON.parse(decodeURIComponent(options.tags)) : []
    })
    this.startAnalysis().catch(err => {
      console.error('[analyzing] startAnalysis未捕获异常:', err)
      this.setData({ analyzing: false, errorMsg: err.message || '诊断异常' })
    })
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
      // 优先使用 base64（本地开发时通义千问无法访问 localhost URL）
      if (this.data.imageBase64) {
        visionData.imageBase64 = this.data.imageBase64
      } else {
        visionData.imageUrl = this.data.imageUrl || this.data.ossUrl
      }
      console.log('[analyzing] 开始视觉分析, base64长度:', visionData.imageBase64 ? visionData.imageBase64.length : 0)
      const visionResult = await request(API.analyzeVision, {
        method: 'POST',
        data: visionData,
        timeout: 120000
      })

      console.log('[analyzing] 视觉分析结果:', JSON.stringify(visionResult).substring(0, 200))
      if (visionResult.code !== 0) {
        throw new Error(visionResult.message || '视觉分析失败')
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

      await this.simulateStep(5, 100)

      if (reportResult.code !== 0) {
        throw new Error(reportResult.message || '报告生成失败')
      }

      // 校验报告格式，异常则使用兜底数据
      let report = reportResult.data
      if (!validateReport(report)) {
        // 重试1次
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
          // 仍异常，使用兜底结果
          report = safeMergeReport(report)
        }
      }

      // 补充元信息
      report.id = 'R' + Date.now()
      report.createTime = this.formatNow()
      report.photoType = this.data.photoType

      // 保存到本地
      this.saveReport(report)

      this.setStepStatus(5, 'done')

      // 跳转报告页
      setTimeout(() => {
        wx.redirectTo({ url: `/pages/report/report?id=${report.id}` })
      }, 500)

    } catch (err) {
      console.error('诊断失败', err)
      this.setData({ analyzing: false, errorMsg: err.message || '诊断失败，请重试' })

      wx.showModal({
        title: '诊断失败',
        content: err.message || 'AI 分析过程出现异常，请重新尝试',
        confirmText: '重新诊断',
        cancelText: '返回首页',
        success: (res) => {
          if (res.confirm) {
            wx.navigateBack()
          } else {
            wx.switchTab({ url: '/pages/index/index' })
          }
        }
      })
    }
  },

  simulateStep(stepIndex, targetProgress) {
    return new Promise(resolve => {
      const current = this.data.progress
      const diff = targetProgress - current
      const steps = 20
      const increment = diff / steps
      let count = 0

      const timer = setInterval(() => {
        count++
        const newProgress = Math.min(current + increment * count, targetProgress)
        this.setData({ progress: Math.round(newProgress) })

        if (count >= steps) {
          clearInterval(timer)
          resolve()
        }
      }, 80)
    })
  },

  setStepStatus(index, status) {
    const steps = this.data.steps
    steps[index].status = status
    this.setData({ currentStep: index, steps })
  },

  saveReport(report) {
    const reports = wx.getStorageSync('reports') || []
    reports.unshift(report)
    wx.setStorageSync('reports', reports)
    // 最多保存20份
    if (reports.length > 20) {
      wx.setStorageSync('reports', reports.slice(0, 20))
    }
  },

  formatNow() {
    const d = new Date()
    const pad = n => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
  }
})
