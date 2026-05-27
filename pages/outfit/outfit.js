// pages/outfit/outfit.js
const app = getApp()
const taskState = require('../../utils/task-state')
const { mixinTaskBars } = require('../../utils/task-bars')

Page({
  data: {
    hasReport: false,
    latestReport: null,
    styleTagsExpanded: false,
    recentConsults: [],
    showHistory: false,
    diagnoseTask: null,
    consultTask: null
  },

  onLoad() {
    this.checkReport()
    this.loadHistory()
  },

  onShow() {
    this.checkReport()
    this.loadHistory()
    if (!this._taskBarsMixed) { mixinTaskBars(this, { onDone: (type) => { if (type === 'consult') this.loadHistory() } }); this._taskBarsMixed = true }
    this.startTaskBars()
  },

  onHide() {
    this.stopTaskBars()
  },

  onUnload() {
    this.stopTaskBars()
  },

  onTapConsultTask() {
    // 兼容旧调用入口；统一委托
    this.onTapTaskBar({ currentTarget: { dataset: { type: 'consult' } } })
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
      title: '测完才知道：我适合的根本不是网红风',
      path: '/pages/outfit/outfit',
      imageUrl: '/images/yanzhi2.jpg'
    }
  }
})
