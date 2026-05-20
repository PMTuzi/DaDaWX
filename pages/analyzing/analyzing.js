// pages/analyzing/analyzing.js
// 新架构：VL分析即时返回，跳转报告页后异步生图
const { request, API } = require('../../utils/api')

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
    this._alive = true
    this._timers = []
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
        weight: options.weight || '',
        localPhoto: decodeURIComponent(options.localPhoto || '')
      })
    } catch (e) {
      console.error('[analyzing] onLoad 参数解析失败:', e)
    }

    this.startAnalysis().catch(err => {
      console.error('[analyzing] startAnalysis未捕获异常:', err)
      if (this._alive) this.onError(err && err.message ? err.message : '诊断异常')
    })
  },

  onUnload() {
    this._alive = false
    this._stopCreep()
    this._timers.forEach(t => clearInterval(t))
    this._timers = []
  },

  onError(err) {
    console.error('[analyzing] 页面错误:', err)
  },

  safeSetData(data) {
    if (this._alive) { try { this.setData(data) } catch (e) {} }
  },

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
    try {
      // 步骤1: 图片上传
      await this.simulateStep(0, 10)
      this.setStepStatus(0, 'done')

      // 步骤2: AI深度面部分析（VL Part1 + Part2，不再等待Seedream）
      this.setStepStatus(1, 'active')
      await this.simulateStep(1, 20)

      // 启动缓慢递增：API等待期间进度从20缓慢爬到80
      this._startCreep(80, 2500)

      // 调用 full-analysis API（仅VL分析，即时返回）
      const result = await request(API.fullAnalysis, {
        method: 'POST',
        data: {
          imageUrl: this.data.imageUrl,
          imageBase64: this.data.imageBase64 || '',
          photoType: this.data.photoType,
          photoUrl: this.data.imageUrl,
          gender: this.data.gender,
          age: this.data.age ? parseInt(this.data.age) : undefined,
          height: this.data.height ? parseFloat(this.data.height) : undefined,
          weight: this.data.weight ? parseFloat(this.data.weight) : undefined
        },
        timeout: 300000  // VL分析含Part1+Part2+重试，最长约5分钟
      })

      this._stopCreep()

      if (result.code !== 0) {
        throw new Error(result.message || '分析失败')
      }

      const data = result.data
      this.setStepStatus(1, 'done')

      // 快速走完剩余步骤（不再等待图片生成）
      await this.simulateStep(2, 50)
      this.setStepStatus(2, 'done')

      await this.simulateStep(3, 65)
      this.setStepStatus(3, 'done')

      await this.simulateStep(4, 80)
      this.setStepStatus(4, 'done')

      await this.simulateStep(5, 100)
      this.setStepStatus(5, 'done')

      // 保存报告到本地
      const report = {
        id: 'R' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
        createTime: this.formatNow(),
        photoType: this.data.photoType,
        photoUrl: this.data.localPhoto || this.data.imageUrl,
        basic: data.basic,
        modules: data.modules,
        images: data.images || {},
        imageComplete: false
      }

      this.saveReport(report)

      // 即使页面已卸载，也通知用户结果已保存
      if (!this._alive) {
        wx.showToast({ title: '诊断完成，请在首页查看', icon: 'none', duration: 3000 })
        return
      }

      // 跳转报告页
      setTimeout(() => {
        if (!this._alive) return
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
      if (!this._alive) { resolve(); return }
      const current = this.data.progress
      const diff = targetProgress - current
      const steps = 20
      const increment = diff / steps
      let count = 0
      const timer = setInterval(() => {
        if (!this._alive) { clearInterval(timer); resolve(); return }
        count++
        this.safeSetData({ progress: Math.round(Math.min(current + increment * count, targetProgress)) })
        if (count >= steps) { clearInterval(timer); resolve() }
      }, 60)
      this._timers.push(timer)
    })
  },

  setStepStatus(index, status) {
    if (!this._alive) return
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
    if (!this._alive) return
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
