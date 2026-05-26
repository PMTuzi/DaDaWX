// pages/analyzing/analyzing.js
// 异步任务模式：提交分析 → 轮询结果，避免 callContainer 超时
const { request, API, runDiagnosis } = require('../../utils/api')
const taskState = require('../../utils/task-state')

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
    photoType: 'face',
    analyzing: true,
    errorMsg: ''
  },

  onLoad(options) {
    this._alive = true
    this._timers = []

    // 「查看进度」模式：从全局任务状态读取进度，不再触发新任务
    if (options && (options.view === '1' || options.view === 1)) {
      this._viewOnly = true
      const t = taskState.get('diagnose') || {}
      this.setData({
        analyzing: true,
        imageUrl: t.imageUrl || '',
        localPhoto: t.localPhoto || '',
        photoType: t.photoType || 'face'
      })
      this._startViewPolling()
      return
    }

    try {
      const imageUrl = decodeURIComponent(options.imageUrl || '')
      let userTags = []
      if (options.tags) {
        try { userTags = JSON.parse(decodeURIComponent(options.tags)) } catch (e) {}
      }
      this.setData({
        imageUrl,
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

    // 把预览图写入 taskState，view 模式下可以恢复
    try {
      taskState.set('diagnose', {
        status: 'running',
        progress: 0,
        label: 'AI 形象诊断中',
        imageUrl: this.data.imageUrl,
        localPhoto: this.data.localPhoto,
        photoType: this.data.photoType
      })
    } catch (e) {}

    this.startAnalysis().catch(err => {
      console.error('[analyzing] startAnalysis未捕获异常:', err)
      taskState.set('diagnose', { status: 'error', errorMsg: err && err.message ? err.message : '诊断异常' })
      if (this._alive) this.onError(err && err.message ? err.message : '诊断异常')
    })
  },

  _startViewPolling() {
    const sync = () => {
      if (!this._alive) return
      const t = taskState.get('diagnose')
      if (!t) {
        // 任务已被消费/清空：返回首页
        wx.switchTab({ url: '/pages/index/index' })
        return
      }
      const progress = typeof t.progress === 'number' ? t.progress : 0
      this.setData({ progress })
      // 推断当前步骤（与 startAnalysis 中的进度阈值保持一致）
      const steps = this.data.steps.map((s, i) => {
        let status = 'pending'
        if (progress >= 100) status = 'done'
        else if (progress >= 90 && i <= 4) status = i === 4 ? 'active' : 'done'
        else if (progress >= 80 && i <= 3) status = i === 3 ? 'active' : 'done'
        else if (progress >= 40 && i <= 2) status = i === 2 ? 'active' : 'done'
        else if (progress >= 20 && i <= 1) status = i === 1 ? 'active' : 'done'
        else if (progress >= 10 && i <= 0) status = i === 0 ? 'done' : 'pending'
        return Object.assign({}, s, { status })
      })
      this.setData({ steps })

      if (t.status === 'done' && t.resultUrl) {
        taskState.clear('diagnose')
        wx.redirectTo({
          url: t.resultUrl,
          fail: () => { wx.switchTab({ url: '/pages/index/index' }) }
        })
        return
      }
      if (t.status === 'error') {
        this.onError(t.errorMsg || '诊断失败')
        taskState.clear('diagnose')
        return
      }
    }
    sync()
    this._viewTimer = setInterval(sync, 800)
    this._timers.push(this._viewTimer)
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
    // 同步进度到全局任务状态（即使页面已卸载也继续更新）
    if (data && typeof data.progress === 'number') {
      taskState.set('diagnose', { status: 'running', progress: data.progress, label: 'AI 形象诊断中' })
    }
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
      // 步骤1: 图片上传完成
      await this.simulateStep(0, 10)
      this.setStepStatus(0, 'done')

      // 步骤2: 开始分析
      this.setStepStatus(1, 'active')
      await this.simulateStep(1, 20)

      // 启动缓慢递增
      this._startCreep(85, 2500)

      // 异步任务模式：提交 → 轮询
      const result = await runDiagnosis(
        this.data.imageUrl,
        this.data.photoType,
        this.data.gender,
        {
          age: this.data.age ? parseInt(this.data.age) : undefined,
          height: this.data.height ? parseFloat(this.data.height) : undefined,
          weight: this.data.weight ? parseFloat(this.data.weight) : undefined,
          photoUrl: this.data.imageUrl,
          onProgress: (progress, step) => {
            // 根据服务端进度更新UI
            if (progress >= 40) {
              this.safeSetData({ currentStep: 2 })
              this.setStepStatus(1, 'done')
              this.setStepStatus(2, 'active')
            }
            if (progress >= 80) {
              this.safeSetData({ currentStep: 3 })
              this.setStepStatus(2, 'done')
              this.setStepStatus(3, 'active')
            }
          }
        }
      )

      this._stopCreep()

      if (result.code !== 0) {
        throw new Error(result.message || '分析失败')
      }

      const data = result.data

      // 快速走完剩余步骤
      this.setStepStatus(1, 'done')
      this.setStepStatus(2, 'done')
      this.setStepStatus(3, 'done')
      await this.simulateStep(4, 90)
      this.setStepStatus(4, 'done')
      await this.simulateStep(5, 100)
      this.setStepStatus(5, 'done')

      // 保存报告到本地
      const report = {
        id: 'R' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
        createTime: this.formatNow(),
        photoType: this.data.photoType,
        photoUrl: this.data.localPhoto || this.data.imageUrl,
        photoUrlRemote: this.data.imageUrl, // 服务器URL作为本地图失效时的兜底
        basic: data.basic,
        modules: data.modules,
        images: data.images || {},
        imageComplete: false
      }

      this.saveReport(report)

      // 通知全局：诊断完成，可在首页查看
      taskState.set('diagnose', {
        status: 'done',
        progress: 100,
        label: '形象诊断完成',
        resultUrl: `/pages/report/report?id=${report.id}`,
        resultId: report.id
      })

      if (!this._alive) {
        wx.showToast({ title: '诊断完成，请在首页查看', icon: 'none', duration: 3000 })
        return
      }

      setTimeout(() => {
        if (!this._alive) return
        try {
          // 用户仍在 loading 页：直接跳到报告，并清空全局状态（已在当前页消化）
          taskState.clear('diagnose')
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
      taskState.set('diagnose', { status: 'error', errorMsg: err.message || '诊断失败，请重试' })
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
