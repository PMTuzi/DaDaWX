// pages/outfit/outfit.js
const app = getApp()
const taskState = require('../../utils/task-state')

Page({
  data: {
    hasReport: false,
    latestReport: null,
    styleTagsExpanded: false,
    recentConsults: [],
    showHistory: false,
    consultTask: null
  },

  onLoad() {
    this.checkReport()
    this.loadHistory()
  },

  onShow() {
    this.checkReport()
    this.loadHistory()
    this.startTaskPolling()
  },

  onHide() {
    this.stopTaskPolling()
  },

  onUnload() {
    this.stopTaskPolling()
  },

  startTaskPolling() {
    this.stopTaskPolling()
    const tick = () => {
      const t = taskState.get('consult')
      this.setData({ consultTask: t })
      if (t && t.status === 'done' && !this._doneClearTimer) {
        this.loadHistory()
        this._doneClearTimer = setTimeout(() => {
          taskState.clear('consult')
          this.setData({ consultTask: null })
          this._doneClearTimer = null
        }, 30000)
      }
    }
    tick()
    this._taskTimer = setInterval(tick, 600)
  },

  stopTaskPolling() {
    if (this._taskTimer) { clearInterval(this._taskTimer); this._taskTimer = null }
    if (this._doneClearTimer) { clearTimeout(this._doneClearTimer); this._doneClearTimer = null }
  },

  onTapConsultTask() {
    const t = taskState.get('consult')
    if (!t) return
    if (t.status === 'done' && t.resultUrl) {
      taskState.clear('consult')
      this.setData({ consultTask: null })
      wx.navigateTo({ url: t.resultUrl })
    } else if (t.status === 'error') {
      wx.showModal({ title: '决策失败', content: t.errorMsg || '请重新尝试', confirmText: '关闭', showCancel: false })
      taskState.clear('consult')
      this.setData({ consultTask: null })
    } else if (t.status === 'running') {
      wx.navigateTo({ url: '/pages/consult-analyzing/consult-analyzing?view=1' })
    }
  },

  checkReport() {
    const reports = wx.getStorageSync('reports') || []
    const latest = reports[0] || null
    this.setData({
      hasReport: reports.length > 0,
      latestReport: latest
    })
  },

  // 展开/收起风格标签详情
  onToggleStyleTags() {
    this.setData({ styleTagsExpanded: !this.data.styleTagsExpanded })
  },

  // 查看完整报告
  onViewFullReport() {
    const r = this.data.latestReport
    if (!r || !r.id) return
    wx.navigateTo({ url: `/pages/report/report?id=${r.id}` })
  },

  loadHistory() {
    const consults = wx.getStorageSync('consultRecords') || []
    this.setData({
      recentConsults: consults.slice(0, 5),
      showHistory: consults.length > 0
    })
  },

  onThumbError(e) {
    const idx = e.currentTarget.dataset.index
    const key = `recentConsults[${idx}].images`
    this.setData({ [key]: [] })
  },

  // 开始穿搭决策 - 统一入口
  onStartConsult() {
    wx.navigateTo({
      url: '/pages/consult-publish/consult-publish'
    })
  },

  onViewResult(e) {
    const id = e.currentTarget.dataset.id
    wx.navigateTo({
      url: `/pages/consult-result/consult-result?id=${id}`
    })
  },

  onGoDiagnose() {
    wx.navigateTo({ url: '/pages/diagnose/diagnose' })
  },

  onShareAppMessage() {
    return {
      title: 'AI穿搭决策 - 帮你不踩雷',
      path: '/pages/outfit/outfit',
      imageUrl: '/images/finalbanner2.jpg'
    }
  }
})
