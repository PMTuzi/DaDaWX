// pages/diagnose/diagnose.js
const { request, API, uploadImage, ensureLogin, runDiagnosis, saveLocalPhoto } = require('../../utils/api')
const taskState = require('../../utils/task-state')

Page({
  data: {
    photoType: 'face', // face | fullbody
    photoUrl: '',
    isUploading: false,
    guideVisible: true,
    // 内联扫描状态
    analyzing: false,
    progress: 0,
    scanLabel: '准备扫描',
    scanSteps: [
      { threshold: 10, label: '图片上传完成' },
      { threshold: 20, label: '深度面部骨相分析' },
      { threshold: 40, label: '色彩形象风格分析' },
      { threshold: 60, label: '穿搭妆容风格分析' },
      { threshold: 80, label: '体态气质风格分析' },
      { threshold: 95, label: '深度总结生成中' }
    ],
    currentFactIndex: 0,
    funFacts: [
      { icon: '◎', title: '已锁定 136 个面部关键点', sub: '骨相 · 三庭五眼 · 黄金比例同步分析中' },
      { icon: '✦', title: '正在比对 2,000+ 穿搭风格库', sub: '基于全球时装周与高定档案训练' },
      { icon: '◐', title: '12 项气质维度建模中', sub: '冷暖 · 软硬 · 量感 · 动静 多轴度量' },
      { icon: '✧', title: '色彩四季理论智能推算', sub: '为你定位最适合的专属色板' },
      { icon: '◈', title: '即将生成专属升级路径', sub: '发型 / 妆容 / 穿搭 三位一体建议' }
    ]
  },

  onLoad(options) {
    if (options.type) {
      this.setData({ photoType: options.type })
    }
    this._alive = true
    this._timers = []

    // 「查看进度」模式：从全局任务状态恢复扫描态
    if (options && (options.view === '1' || options.view === 1)) {
      const t = taskState.get('diagnose') || {}
      if (!t || !t.status) {
        // 没有任务，回到普通态
        return
      }
      if (t.status === 'done' && t.resultUrl) {
        taskState.clear('diagnose')
        wx.redirectTo({
          url: t.resultUrl,
          fail: () => { wx.switchTab({ url: '/pages/index/index' }) }
        })
        return
      }
      if (t.status === 'error') {
        taskState.clear('diagnose')
        wx.showModal({
          title: '诊断失败',
          content: t.errorMsg || '请重新尝试',
          showCancel: false,
          success: () => { wx.switchTab({ url: '/pages/index/index' }) }
        })
        return
      }
      this._viewOnly = true
      this.setData({
        photoUrl: t.localPhoto || t.imageUrl || '',
        photoType: t.photoType || 'face',
        guideVisible: false,
        analyzing: true,
        progress: typeof t.progress === 'number' ? t.progress : 0,
        scanLabel: t.label || '形象诊断中'
      })
      this._updateScanLabel(this.data.progress)
      this._startFactRotation()
      this._startViewPolling()
    }
  },

  onUnload() {
    this._alive = false
    this._stopCreep()
    this._stopFactRotation()
    if (this._timers) this._timers.forEach(t => clearInterval(t))
    this._timers = []
  },

  onError(err) {
    console.error('[diagnose] 页面错误:', err)
  },

  // 切换照片类型
  onSwitchType(e) {
    this.setData({ photoType: e.currentTarget.dataset.type })
  },

  // 选择照片（拍照或相册）
  onBack() {
    const pages = getCurrentPages()
    if (pages.length > 1) {
      wx.navigateBack({ delta: 1 })
    } else {
      wx.switchTab({ url: '/pages/index/index' })
    }
  },

  onChoosePhoto() {
    if (this.data.analyzing) return
    try {
      wx.chooseMedia({
        count: 1,
        mediaType: ['image'],
        sourceType: ['album', 'camera'],
        camera: 'front',
        success: (res) => {
          try {
            this.setData({ photoUrl: res.tempFiles[0].tempFilePath, guideVisible: false })
          } catch (e) {
            console.error('[diagnose] 选择照片回调出错:', e)
          }
        },
        fail: (err) => {
          if (err.errMsg && err.errMsg.indexOf('cancel') > -1) return
          console.warn('[diagnose] chooseMedia 失败:', err.errMsg)
        }
      })
    } catch (e) {
      wx.chooseImage({
        count: 1,
        sizeType: ['compressed'],
        sourceType: ['album', 'camera'],
        success: (res) => {
          try {
            this.setData({ photoUrl: res.tempFilePaths[0], guideVisible: false })
          } catch (e2) {}
        },
        fail: () => {}
      })
    }
  },

  // 重新选择
  onRechoose() {
    if (this.data.analyzing) return
    this.setData({ photoUrl: '', guideVisible: true })
  },

  safeSetData(data) {
    if (this._alive) { try { this.setData(data) } catch (e) {} }
    if (data && typeof data.progress === 'number') {
      taskState.set('diagnose', { status: 'running', progress: data.progress, label: data.scanLabel || '形象诊断中' })
    }
  },

  _updateScanLabel(progress) {
    const steps = this.data.scanSteps
    let label = steps[0].label
    for (let i = 0; i < steps.length; i++) {
      if (progress >= steps[i].threshold) label = steps[i].label
    }
    if (this.data.scanLabel !== label) {
      this.safeSetData({ scanLabel: label })
    }
  },

  _animateProgress(target, duration) {
    return new Promise(resolve => {
      if (!this._alive) { resolve(); return }
      const start = this.data.progress
      const diff = target - start
      if (diff <= 0) { resolve(); return }
      const steps = Math.max(10, Math.round(duration / 60))
      let count = 0
      const timer = setInterval(() => {
        if (!this._alive) { clearInterval(timer); resolve(); return }
        count++
        const p = Math.min(start + Math.round(diff * count / steps), target)
        this.safeSetData({ progress: p })
        this._updateScanLabel(p)
        if (count >= steps) { clearInterval(timer); resolve() }
      }, 60)
      this._timers.push(timer)
    })
  },

  _startCreep(maxProgress, interval) {
    this._stopCreep()
    this._creepTimer = setInterval(() => {
      if (!this._alive) return
      if (this.data.progress >= maxProgress) return
      const p = this.data.progress + 1
      this.safeSetData({ progress: p })
      this._updateScanLabel(p)
    }, interval)
  },

  _stopCreep() {
    if (this._creepTimer) {
      clearInterval(this._creepTimer)
      this._creepTimer = null
    }
  },

  _startFactRotation() {
    this._stopFactRotation()
    this._factTimer = setInterval(() => {
      if (!this._alive) return
      const len = (this.data.funFacts || []).length
      if (!len) return
      const next = (this.data.currentFactIndex + 1) % len
      this.safeSetData({ currentFactIndex: next })
    }, 2400)
    this._timers.push(this._factTimer)
  },

  _stopFactRotation() {
    if (this._factTimer) {
      clearInterval(this._factTimer)
      this._factTimer = null
    }
  },

  // 查看模式：轮询全局任务状态
  _startViewPolling() {
    const sync = () => {
      if (!this._alive) return
      const t = taskState.get('diagnose')
      if (!t) {
        wx.switchTab({ url: '/pages/index/index' })
        return
      }
      const progress = typeof t.progress === 'number' ? t.progress : 0
      if (progress > this.data.progress) {
        this.setData({ progress })
        this._updateScanLabel(progress)
      }
      if (t.status === 'done' && t.resultUrl) {
        taskState.clear('diagnose')
        wx.redirectTo({
          url: t.resultUrl,
          fail: () => { wx.switchTab({ url: '/pages/index/index' }) }
        })
        return
      }
      if (t.status === 'error') {
        taskState.clear('diagnose')
        this.setData({ analyzing: false, progress: 0 })
        wx.showModal({
          title: '诊断失败',
          content: t.errorMsg || '请重新尝试',
          showCancel: false,
          success: () => { wx.switchTab({ url: '/pages/index/index' }) }
        })
        return
      }
    }
    sync()
    this._viewTimer = setInterval(sync, 800)
    this._timers.push(this._viewTimer)
  },

  formatNow() {
    const d = new Date()
    const pad = n => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
  },

  saveReport(report) {
    try {
      const reports = wx.getStorageSync('reports') || []
      reports.unshift(report)
      if (reports.length > 20) reports.length = 20
      wx.setStorageSync('reports', reports)
    } catch (e) {
      console.error('[diagnose] 保存报告失败:', e)
    }
  },

  // 开始分析
  async onStartAnalysis() {
    if (this.data.analyzing) return
    if (!this.data.photoUrl) {
      wx.showToast({ title: '请先上传照片', icon: 'none' })
      return
    }

    try {
      await ensureLogin()
    } catch (e) {
      wx.showToast({ title: '请先登录', icon: 'none' })
      return
    }

    this.setData({ isUploading: true, analyzing: true, progress: 0, scanLabel: '图片上传中', currentFactIndex: 0 })
    this._startFactRotation()

    let imageUrl = ''
    let savedPhoto = ''
    try {
      savedPhoto = await saveLocalPhoto(this.data.photoUrl)
      const sourcePath = savedPhoto || this.data.photoUrl

      let lastErr
      for (let i = 0; i < 2; i++) {
        try {
          imageUrl = await uploadImage(sourcePath)
          if (imageUrl && /^https?:\/\//.test(imageUrl)) break
        } catch (err) {
          lastErr = err
          console.warn(`[diagnose] OSS 上传失败 (第${i + 1}次):`, err && err.message)
        }
      }
      if (!imageUrl || !/^https?:\/\//.test(imageUrl)) {
        throw new Error((lastErr && lastErr.message) || '图片上传失败，请检查网络')
      }
    } catch (err) {
      console.error('[diagnose] 图片上传失败:', err)
      this.setData({ isUploading: false, analyzing: false, progress: 0 })
      wx.showModal({
        title: '上传失败',
        content: '图片上传失败，请检查网络连接后重试',
        showCancel: false
      })
      return
    }

    this.setData({ isUploading: false })

    try {
      taskState.set('diagnose', {
        status: 'running',
        progress: 0,
        label: '形象诊断中',
        imageUrl,
        localPhoto: savedPhoto || this.data.photoUrl,
        photoType: this.data.photoType
      })
    } catch (e) {}

    // 内联扫描动画 + 真实诊断
    try {
      await this._animateProgress(10, 600)
      await this._animateProgress(20, 600)
      this._startCreep(85, 2500)

      const result = await runDiagnosis(
        imageUrl,
        this.data.photoType,
        'auto',
        {
          photoUrl: imageUrl,
          onProgress: (progress) => {
            if (typeof progress === 'number' && progress > this.data.progress && progress < 95) {
              this.safeSetData({ progress })
              this._updateScanLabel(progress)
            }
          }
        }
      )

      this._stopCreep()

      if (!result || result.code !== 0) {
        throw new Error((result && result.message) || '分析失败')
      }

      const data = result.data
      await this._animateProgress(95, 400)
      await this._animateProgress(100, 300)
      this.safeSetData({ scanLabel: '诊断完成' })

      const report = {
        id: 'R' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
        createTime: this.formatNow(),
        photoType: this.data.photoType,
        photoUrl: savedPhoto || this.data.photoUrl,
        photoUrlRemote: imageUrl,
        basic: data.basic,
        modules: data.modules,
        images: data.images || {},
        imageComplete: false
      }
      this.saveReport(report)

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
          console.error('[diagnose] 页面跳转失败:', e)
        }
      }, 400)
    } catch (err) {
      console.error('[diagnose] 诊断失败:', err)
      this._stopCreep()
      taskState.set('diagnose', { status: 'error', errorMsg: (err && err.message) || '诊断失败' })
      this.setData({ analyzing: false, progress: 0 })
      wx.showModal({
        title: '诊断失败',
        content: (err && err.message) || '分析过程出现异常，请重新尝试',
        showCancel: false
      })
    }
  }
})
