// pages/analyzing/analyzing.js
// 新架构：等待全部图片生成完成才跳转
const { request, API } = require('../../utils/api')

let _alive = true
let _timers = []

Page({
  data: {
    progress: 0,
    currentStep: 0,
    steps: [
      { label: '图片上传', icon: 'upload', status: 'pending' },
      { label: '深度面部骨相分析', icon: 'eye', status: 'pending' },
      { label: '色彩形象风格分析', icon: 'search', status: 'pending' },
      { label: '穿搭妆容风格分析', icon: 'palette', status: 'pending' },
      { label: '体态气质风格分析', icon: 'sparkle', status: 'pending' },
      { label: '深度总结', icon: 'heart', status: 'pending' }
    ],
    imageUrl: '',
    imageBase64: '',
    photoType: 'face',
    analyzing: true,
    errorMsg: ''
  },

  onLoad(options) {
    _alive = true
    _timers = []
    try {
      const imageUrl = decodeURIComponent(options.imageUrl || '')
      let imageBase64 = ''
      if (options.hasBase64 === '1') {
        imageBase64 = getApp().globalData.tempImageBase64 || ''
        getApp().globalData.tempImageBase64 = ''
      }
      let userTags = []
      if (options.tags) {
        try { userTags = JSON.parse(decodeURIComponent(options.tags)) } catch (e) {}
      }
      this.setData({
        imageUrl,
        imageBase64,
        photoType: options.photoType || 'face',
        gender: options.gender || 'female',
        age: options.age || '',
        height: options.height || '',
        weight: options.weight || ''
      })
    } catch (e) {
      console.error('[analyzing] onLoad 参数解析失败:', e)
    }

    this.startAnalysis().catch(err => {
      console.error('[analyzing] startAnalysis未捕获异常:', err)
      if (_alive) this.onError(err && err.message ? err.message : '诊断异常')
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

  safeSetData(data) {
    if (_alive) { try { this.setData(data) } catch (e) {} }
  },

  async startAnalysis() {
    try {
      // 步骤1: 图片上传
      await this.simulateStep(0, 10)
      this.setStepStatus(0, 'done')

      // 步骤2: AI深度面部分析（VL Part1 + Part2）
      this.setStepStatus(1, 'active')
      await this.simulateStep(1, 20)

      // 步骤3-6: 调用 full-analysis API（包含VL分析+4次Seedream图片生成）
      // 这一步会耗时较长（可能2-3分钟），等待全部图片生成完成
      const result = await request(API.fullAnalysis, {
        method: 'POST',
        data: {
          imageUrl: this.data.imageUrl,
          imageBase64: this.data.imageBase64 || '',
          photoType: this.data.photoType,
          gender: this.data.gender,
          age: this.data.age ? parseInt(this.data.age) : undefined,
          height: this.data.height ? parseFloat(this.data.height) : undefined,
          weight: this.data.weight ? parseFloat(this.data.weight) : undefined
        },
        timeout: 300000  // 5分钟超时
      })

      if (result.code !== 0) {
        throw new Error(result.message || '分析失败')
      }

      // 检查图片是否全部生成
      if (!result.data.imageComplete) {
        console.warn('[analyzing] 部分图片生成失败，但允许查看')
      }

      const data = result.data
      await this.simulateStep(1, 40)
      this.setStepStatus(1, 'done')

      // 逐步标记图片生成步骤完成
      await this.simulateStep(2, 55)
      this.setStepStatus(2, 'done')

      await this.simulateStep(3, 70)
      this.setStepStatus(3, 'done')

      await this.simulateStep(4, 85)
      this.setStepStatus(4, 'done')

      await this.simulateStep(5, 100)
      this.setStepStatus(5, 'done')

      // 保存报告到本地
      const report = {
        id: 'R' + Date.now(),
        createTime: this.formatNow(),
        photoType: this.data.photoType,
        photoUrl: this.data.imageUrl,
        basic: data.basic,
        modules: data.modules,
        images: data.images,
        imageComplete: data.imageComplete,
        faceData: data.faceData,
        visualImages: data.visualImages
      }

      this.saveReport(report)

      // 跳转报告页
      setTimeout(() => {
        if (!_alive) return
        try {
          wx.redirectTo({
            url: `/pages/report/report?id=${report.id}`,
            fail: () => {
              wx.navigateTo({
                url: `/pages/report/report?id=${report.id}`,
                fail: () => { wx.switchTab({ url: '/pages/index/index' }) }
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

  simulateStep(stepIndex, targetProgress) {
    return new Promise(resolve => {
      if (!_alive) { resolve(); return }
      const current = this.data.progress
      const diff = targetProgress - current
      const steps = 20
      const increment = diff / steps
      let count = 0
      const timer = setInterval(() => {
        if (!_alive) { clearInterval(timer); resolve(); return }
        count++
        this.safeSetData({ progress: Math.round(Math.min(current + increment * count, targetProgress)) })
        if (count >= steps) { clearInterval(timer); resolve() }
      }, 60)
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
        if (res.confirm) { wx.navigateBack({ fail: () => wx.switchTab({ url: '/pages/index/index' }) }) }
        else { wx.switchTab({ url: '/pages/index/index' }) }
      },
      fail: () => { wx.switchTab({ url: '/pages/index/index' }) }
    })
  }
})
