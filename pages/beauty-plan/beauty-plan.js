// pages/beauty-plan/beauty-plan.js
const { request, API, ensureLogin, checkServerReachable } = require('../../utils/api')

Page({
  data: {
    loading: false,
    loadingText: '',
    noReport: false,
    plan: null,
    progress: {},   // { '1-0': true, '1-2': true, ... }
    totalDone: 0,
    totalCount: 0,
    todayDone: 0,
    todayTotal: 0,
    progressPct: 0,
    streakDays: 0,
    todayDayNum: 1,      // 1-28
    currentDayIdx: 0,    // swiper 当前索引（0-based）
    errorMsg: ''
  },

  onLoad() {
    this.loadPlan()
  },

  // ========== 任务分类图（按 cat 字段映射本地图片） ==========
  _catImg(cat) {
    const c = String(cat || '')
    if (/发型|头发/.test(c)) return '/images/refs/plan_hair.jpg'
    if (/妆|化妆/.test(c)) return '/images/refs/plan_makeup.jpg'
    if (/护肤|保养|护理|皮肤/.test(c)) return '/images/refs/plan_skincare.jpg'
    if (/运动|体态|塑形|拉伸|按摩/.test(c)) return '/images/refs/plan_sport.jpg'
    if (/气质/.test(c)) return '/images/refs/plan_makeup.jpg'
    if (/习惯|饮食|睡眠/.test(c)) return '/images/refs/plan_skincare.jpg'
    return '/images/refs/plan_skincare.jpg'
  },

  onShow() {
    // 每次进入刷新今日完成度
    if (this.data.plan) this.computeProgress()
  },

  // ========== 加载计划 ==========
  async loadPlan() {
    const reports = wx.getStorageSync('reports') || []
    if (!reports.length) {
      this.setData({ noReport: true, loading: false })
      return
    }
    const report = reports[0]
    const reportId = report.id || report._id || 'latest'

    // 优先读缓存
    const cacheKey = `beautyPlan_${reportId}`
    let plan = wx.getStorageSync(cacheKey)
    if (plan && plan.days && plan.days.length === 28) {
      this.setData({ plan, noReport: false })
      this.loadProgress(reportId)
      this.computeProgress()
      return
    }

    // 调用大模型生成
    await this._generatePlan(report, reportId, cacheKey)
  },

  async _generatePlan(report, reportId, cacheKey) {
    this.setData({ loading: true, errorMsg: '' })
    try {
      await ensureLogin()
      const reachable = await checkServerReachable()
      if (!reachable) throw new Error('服务器连接失败')

      // 提炼报告关键信息
      const summary = this._buildReportSummary(report)

      this.setData({ loadingText: '正在为你定制蜕变计划...' })
      const res = await request('/api/ai/generate-beauty-plan', {
        method: 'POST',
        data: { reportId, summary },
        timeout: 120000
      })

      if (!res || res.code !== 0 || !res.data || !Array.isArray(res.data.days)) {
        throw new Error((res && res.message) || '生成失败')
      }

      const days = res.data.days
      const focuses = Array.isArray(res.data.focuses) ? res.data.focuses.slice(0, 3) : []
      // 保险：补齐到 28 天
      while (days.length < 28) {
        days.push({ day: days.length + 1, theme: '坚持', tasks: this._fallbackTasks() })
      }
      const plan = {
        startDate: this._today(),
        reportId,
        focuses,
        days: days.slice(0, 28).map((d, i) => ({
          day: i + 1,
          theme: d.theme || '',
          tasks: (d.tasks || []).slice(0, 3).map(t => ({
            title: t.title || '',
            desc: t.desc || '',
            cat: t.cat || '',
            duration: t.duration || ''
          }))
        }))
      }
      wx.setStorageSync(cacheKey, plan)
      this.setData({ plan, loading: false })
      this.loadProgress(reportId)
      this.computeProgress()
    } catch (err) {
      console.error('[beauty-plan] 生成失败', err)
      // 兜底：使用本地预设方案，保证体验
      const summary = this._buildReportSummary(report)
      const plan = this._buildFallbackPlan(reportId, summary)
      wx.setStorageSync(cacheKey, plan)
      this.setData({
        plan,
        loading: false,
        errorMsg: ''
      })
      this.loadProgress(reportId)
      this.computeProgress()
    }
  },

  _buildReportSummary(r) {
    return {
      faceShape: r.faceShape && r.faceShape.type,
      skinSeason: r.skinColor && r.skinColor.season,
      skinType: r.skinColor && r.skinColor.type,
      mainStyle: r.style && r.style.mainStyle,
      shoulderType: r.bodyShape && r.bodyShape.shoulderType,
      bodyRatio: r.bodyShape && r.bodyShape.bodyRatio,
      weaknesses: r.basic && r.basic.weaknesses,
      gender: r.gender || ''
    }
  },

  _today() {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  },

  // ========== 进度持久化 ==========
  loadProgress(reportId) {
    const key = `beautyPlanProgress_${reportId}`
    const progress = wx.getStorageSync(key) || {}
    this.setData({ progress })
  },

  saveProgress(reportId) {
    const key = `beautyPlanProgress_${reportId}`
    wx.setStorageSync(key, this.data.progress)
  },

  // ========== 计算进度并打标 isToday/locked/allDone/done ==========
  computeProgress() {
    const plan = this.data.plan
    if (!plan) return
    const start = plan.startDate || this._today()
    const startMs = this._parseDate(start)
    const todayMs = this._parseDate(this._today())
    const dayOffset = Math.floor((todayMs - startMs) / 86400000) // 0-based
    const todayDayNum = Math.max(1, Math.min(28, dayOffset + 1))

    const progress = this.data.progress || {}
    let doneTaskCount = 0
    const totalTaskCount = plan.days.reduce((acc, d) => acc + (d.tasks ? d.tasks.length : 0), 0)
    let todayDone = 0
    let todayTotal = 0
    let streakDays = 0

    const days = plan.days.map(d => {
      const tasks = (d.tasks || []).map((t, idx) => {
        const done = !!progress[`${d.day}-${idx}`]
        if (done) doneTaskCount += 1
        return { ...t, done, img: this._catImg(t.cat) }
      })
      const allDone = tasks.length > 0 && tasks.every(t => t.done)
      const isToday = d.day === todayDayNum
      const isPast = d.day < todayDayNum
      const isFuture = d.day > todayDayNum
      // 仅今天可勾选；过去/未来都锁定（不可补打卡）
      const locked = !isToday
      if (isToday) {
        todayTotal = tasks.length
        todayDone = tasks.filter(t => t.done).length
      }
      return { ...d, tasks, allDone, isToday, isPast, isFuture, locked }
    })

    // 以"天"为单位的进度
    const totalCount = days.length  // 28
    const totalDone = days.filter(d => d.allDone).length

    // 连续坚持天数：从 Day1 起，每日 allDone 累加，遇到中断停止
    for (let i = 0; i < days.length; i++) {
      if (days[i].day > todayDayNum) break
      if (days[i].allDone) streakDays += 1
      else if (days[i].day < todayDayNum) {
        // 过去未完成的日子：中断 streak
        streakDays = 0
      }
    }

    this.setData({
      'plan.days': days,
      totalDone,
      totalCount,
      todayDone,
      todayTotal,
      progressPct: totalCount ? Math.round((totalDone / totalCount) * 100) : 0,
      streakDays,
      todayDayNum
    })

    // 默认定位到今天（仅首次或当前索引超出时）
    if (this.data.currentDayIdx == null ||
        this.data.currentDayIdx < 0 ||
        this.data.currentDayIdx >= days.length ||
        this._initialJumpDone !== true) {
      this.setData({ currentDayIdx: Math.max(0, todayDayNum - 1) })
      this._initialJumpDone = true
    }
  },

  _parseDate(s) {
    const [y, m, d] = s.split('-').map(Number)
    return new Date(y, m - 1, d).getTime()
  },

  // ========== 勾选任务 ==========
  onDaySwiperChange(e) {
    this.setData({ currentDayIdx: e.detail.current })
  },

  onPrevDay() {
    if (this.data.currentDayIdx <= 0) return
    this.setData({ currentDayIdx: this.data.currentDayIdx - 1 })
  },

  onNextDay() {
    if (!this.data.plan) return
    const max = this.data.plan.days.length - 1
    if (this.data.currentDayIdx >= max) return
    this.setData({ currentDayIdx: this.data.currentDayIdx + 1 })
  },

  onJumpToday() {
    this.setData({ currentDayIdx: Math.max(0, this.data.todayDayNum - 1) })
  },

  onToggleTask(e) {
    const { day, idx } = e.currentTarget.dataset
    const dayNum = Number(day)
    const taskIdx = Number(idx)
    const plan = this.data.plan
    const dayObj = plan.days.find(d => d.day === dayNum)
    if (!dayObj) return
    if (dayObj.locked) {
      wx.showToast({
        title: dayObj.isFuture ? '该天还未解锁哦' : '已过期，不能补打卡',
        icon: 'none'
      })
      return
    }
    const key = `${dayNum}-${taskIdx}`
    const progress = { ...this.data.progress }
    progress[key] = !progress[key]
    this.setData({ progress })
    this.saveProgress(plan.reportId)
    this.computeProgress()

    if (progress[key]) {
      wx.vibrateShort && wx.vibrateShort({ type: 'light' })
    }
  },

  // ========== 重新生成 ==========
  onRegenerate() {
    wx.showModal({
      title: '重新生成计划',
      content: '将清空当前进度并基于最新报告重新生成，确定吗？',
      success: async (res) => {
        if (!res.confirm) return
        const reports = wx.getStorageSync('reports') || []
        if (!reports.length) return
        const report = reports[0]
        const reportId = report.id || report._id || 'latest'
        const cacheKey = `beautyPlan_${reportId}`
        wx.removeStorageSync(cacheKey)
        wx.removeStorageSync(`beautyPlanProgress_${reportId}`)
        this.setData({ progress: {}, plan: null })
        await this._generatePlan(report, reportId, cacheKey)
      }
    })
  },

  // ========== 跳转 ==========
  goDiagnose() {
    wx.switchTab({
      url: '/pages/index/index',
      fail() {
        wx.navigateTo({ url: '/pages/diagnose/diagnose' })
      }
    })
  },

  // ========== 兜底方案（无网络/AI失败时） ==========
  _fallbackTasks() {
    return [
      { title: '开合跳 30 个', desc: '激活全身循环，提升气色', cat: '运动', duration: '3 分钟' },
      { title: '头部按摩 20 下', desc: '太阳穴、风池穴打圈按摩', cat: '保养', duration: '2 分钟' },
      { title: '8 杯水打卡', desc: '记录今天的饮水量', cat: '习惯', duration: '全天' }
    ]
  },

  _buildFallbackPlan(reportId, summary) {
    const themes = ['启动', '坚持', '进阶', '冲刺']
    const focuses = this._buildFallbackFocuses(summary)
    const pool = [
      [
        { title: '开合跳 30 个', desc: '激活循环，提升气色', cat: '运动', duration: '3 分钟' },
        { title: '头部按摩 20 下', desc: '太阳穴+风池穴打圈', cat: '保养', duration: '2 分钟' },
        { title: '喝水 8 杯打卡', desc: '改善皮肤含水量', cat: '习惯', duration: '全天' }
      ],
      [
        { title: '仰卧起坐 20 个', desc: '收紧腹部线条', cat: '运动', duration: '3 分钟' },
        { title: '面部刮痧 5 分钟', desc: '从中线向外提拉', cat: '保养', duration: '5 分钟' },
        { title: '23:30 前入睡', desc: '皮肤修复黄金期', cat: '习惯', duration: '当晚' }
      ],
      [
        { title: '深蹲 20 个', desc: '改善下肢线条', cat: '运动', duration: '4 分钟' },
        { title: '颈部拉伸 5 分钟', desc: '缓解低头线，改善气质', cat: '体态', duration: '5 分钟' },
        { title: '防晒补涂 1 次', desc: '抗光老化第一步', cat: '保养', duration: '1 分钟' }
      ],
      [
        { title: '靠墙站 10 分钟', desc: '矫正体态', cat: '体态', duration: '10 分钟' },
        { title: '面部表情管理练习', desc: '镜前微笑 20 次', cat: '气质', duration: '3 分钟' },
        { title: '清淡饮食一餐', desc: '少油少糖少盐', cat: '习惯', duration: '一餐' }
      ]
    ]
    const days = []
    for (let i = 1; i <= 28; i++) {
      const themeIdx = Math.floor((i - 1) / 7)
      const taskGroup = pool[(i - 1) % pool.length]
      days.push({
        day: i,
        theme: themes[themeIdx] + '周',
        tasks: taskGroup.map(t => ({ ...t }))
      })
    }
    return { startDate: this._today(), reportId, focuses, days }
  },

  _buildFallbackFocuses(s) {
    s = s || {}
    const arr = []
    if (s.faceShape) arr.push(`精致${s.faceShape}线条`)
    else arr.push('精致面部线条')
    if (s.skinSeason) arr.push(`提亮${s.skinSeason}调气色`)
    else arr.push('提亮整体气色')
    if (s.shoulderType || s.bodyRatio) arr.push('改善体态比例')
    else arr.push('改善体态比例')
    return arr.slice(0, 3)
  }
})
