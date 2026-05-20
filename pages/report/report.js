// pages/report/report.js
// 新架构：数据驱动报告，前端渲染雷达图/色块/比例条

const { request, API } = require('../../utils/api')

Page({
  data: {
    report: null,
    activeTab: 'dna',
    tabKeys: ['dna', 'style', 'hairmakeup', 'optimize'],
    tabLabels: { dna: '面部&骨相', style: '皮肤&风格', hairmakeup: '发型&妆容', optimize: '颜值&蜕变' },
    shared: false,
    // Canvas 雷达图
    radarCanvasId: ''
  },

  onLoad(options) {
    const id = options.id
    const reports = wx.getStorageSync('reports') || []
    const report = reports.find(r => r.id === id)

    if (!report) {
      wx.showToast({ title: '报告不存在', icon: 'none' })
      setTimeout(() => wx.navigateBack(), 1500)
      return
    }

    this.setData({ report })

    // 延迟绘制雷达图（等 DOM 渲染完成）
    setTimeout(() => this.drawRadarChart(), 300)
  },

  onTabTap(e) {
    const tab = e.currentTarget.dataset.tab
    this.setData({ activeTab: tab })
    // 切换Tab后重绘雷达图
    setTimeout(() => this.drawRadarChart(), 100)
  },

  // 头像加载失败时清除photoUrl，显示占位符
  onAvatarError() {
    const report = this.data.report
    if (report) {
      report.photoUrl = ''
      this.setData({ report })
    }
  },

  // ==================== Canvas 雷达图绘制 ====================
  drawRadarChart() {
    const tab = this.data.activeTab
    const report = this.data.report
    if (!report?.modules) return

    const canvasId = `radar-${tab}`
    const query = wx.createSelectorQuery()
    query.select(`#${canvasId}`).fields({ node: true, size: true }).exec((res) => {
      if (!res[0]) return
      const canvas = res[0].node
      const ctx = canvas.getContext('2d')
      const dpr = wx.getWindowInfo().pixelRatio
      const width = res[0].width
      const height = res[0].height
      canvas.width = width * dpr
      canvas.height = height * dpr
      ctx.scale(dpr, dpr)

      switch (tab) {
        case 'dna':
          this.drawDNARadar(ctx, width, height, report.modules.dna)
          break
        case 'style':
          this.drawStyleRadar(ctx, width, height, report.modules.style)
          break
        case 'hairmakeup':
          this.drawHairMakeupRadar(ctx, width, height, report.modules.hairmakeup)
          break
        case 'optimize':
          this.drawOptimizeRadar(ctx, width, height, report.modules.optimize)
          break
      }
    })
  },

  // 骨相雷达图
  drawDNARadar(ctx, w, h, data) {
    if (!data?.faceFeatures) return
    const features = data.faceFeatures.slice(0, 5)
    const labels = features.map(f => f.name)
    const scores = features.map(f => f.score || 5)
    this._drawRadar(ctx, w, h, labels, scores, '#C8A97E', '骨相评分')
  },

  // 风格雷达图
  drawStyleRadar(ctx, w, h, data) {
    if (!data) return
    const labels = ['明度', '纯度', '量感', '冷暖', '饱和度']
    const warmCool = data.skinType === '暖皮' ? 8 : data.skinType === '冷皮' ? 3 : 5
    const scores = [data.brightness || 5, data.purity || 5, data.mass || 5, warmCool, 6]
    this._drawRadar(ctx, w, h, labels, scores, '#E8A0BF', '风格属性')
  },

  // 发型雷达图
  drawHairMakeupRadar(ctx, w, h, data) {
    if (!data?.hairRecommend?.top3) return
    const top3 = data.hairRecommend.top3
    const labels = ['修饰脸型', '显高显瘦', '打理难度', '时尚度', '气质匹配']
    const scores = top3.length > 0
      ? [top3[0].score || 7, 6, 5, 7, top3[0].score || 7]
      : [5, 5, 5, 5, 5]
    this._drawRadar(ctx, w, h, labels, scores, '#D4A574', '发型适配')
  },

  // 蜕变雷达图
  drawOptimizeRadar(ctx, w, h, data) {
    if (!data?.optimizablePoints) return
    const labels = ['五官协调', '皮肤状态', '发型适配', '妆容加分', '整体气质']
    const scores = [7, 6, 5, 6, 6]
    this._drawRadar(ctx, w, h, labels, scores, '#8FBC8F', '蜕变潜力')
  },

  // 通用雷达图绘制
  _drawRadar(ctx, w, h, labels, scores, color, title) {
    const cx = w / 2
    const cy = h / 2
    const maxR = Math.min(w, h) / 2 - 30
    const n = labels.length
    const angleStep = (Math.PI * 2) / n
    const startAngle = -Math.PI / 2

    ctx.clearRect(0, 0, w, h)

    // 绘制5层网格
    for (let level = 1; level <= 5; level++) {
      const r = (maxR * level) / 5
      ctx.beginPath()
      for (let i = 0; i <= n; i++) {
        const angle = startAngle + i * angleStep
        const x = cx + r * Math.cos(angle)
        const y = cy + r * Math.sin(angle)
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
      }
      ctx.closePath()
      ctx.strokeStyle = '#E8E8E8'
      ctx.lineWidth = 0.5
      ctx.stroke()
    }

    // 绘制轴线
    for (let i = 0; i < n; i++) {
      const angle = startAngle + i * angleStep
      ctx.beginPath()
      ctx.moveTo(cx, cy)
      ctx.lineTo(cx + maxR * Math.cos(angle), cy + maxR * Math.sin(angle))
      ctx.strokeStyle = '#D0D0D0'
      ctx.lineWidth = 0.5
      ctx.stroke()
    }

    // 绘制数据区域
    ctx.beginPath()
    for (let i = 0; i <= n; i++) {
      const idx = i % n
      const angle = startAngle + idx * angleStep
      const r = (maxR * scores[idx]) / 10
      const x = cx + r * Math.cos(angle)
      const y = cy + r * Math.sin(angle)
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
    }
    ctx.closePath()

    // 填充
    const hex = color.replace('#', '')
    const r = parseInt(hex.substring(0, 2), 16)
    const g = parseInt(hex.substring(2, 4), 16)
    const b = parseInt(hex.substring(4, 6), 16)
    ctx.fillStyle = `rgba(${r}, ${g}, ${b}, 0.15)`
    ctx.fill()
    ctx.strokeStyle = color
    ctx.lineWidth = 2
    ctx.stroke()

    // 绘制数据点
    for (let i = 0; i < n; i++) {
      const angle = startAngle + i * angleStep
      const rad = (maxR * scores[i]) / 10
      const x = cx + rad * Math.cos(angle)
      const y = cy + rad * Math.sin(angle)
      ctx.beginPath()
      ctx.arc(x, y, 3, 0, Math.PI * 2)
      ctx.fillStyle = color
      ctx.fill()
    }

    // 绘制标签
    ctx.font = '10px sans-serif'
    ctx.fillStyle = '#666'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    for (let i = 0; i < n; i++) {
      const angle = startAngle + i * angleStep
      const labelR = maxR + 18
      const x = cx + labelR * Math.cos(angle)
      const y = cy + labelR * Math.sin(angle)
      ctx.fillText(labels[i], x, y)
    }

    // 中央标题
    ctx.font = 'bold 12px sans-serif'
    ctx.fillStyle = color
    ctx.textAlign = 'center'
    ctx.fillText(title, cx, cy)
  },

  // ==================== 图片预览 ====================
  onImagePreview(e) {
    const url = e.currentTarget.dataset.url
    if (!url) return
    wx.previewImage({ current: url, urls: [url] })
  },

  // ==================== 底部操作 ====================
  async onSaveAllImages() {
    if (!this.data.shared) {
      wx.showToast({ title: '请先分享解锁', icon: 'none' })
      return
    }
    wx.showToast({ title: '长按报告图片即可保存', icon: 'none' })
  },

  onReDiagnose() {
    if (!this.data.shared) {
      wx.showToast({ title: '请先分享解锁', icon: 'none' })
      return
    }
    wx.navigateTo({ url: '/pages/diagnose/diagnose' })
  },

  onShareAppMessage() {
    if (!this.data.shared) this.setData({ shared: true })
    const report = this.data.report
    const score = report?.basic?.overallScore || ''
    return {
      title: score ? `我的形象风格AI评分：${score}分，快来测测你的风格！` : 'AI形象风格诊断，快来测测你的风格！',
      path: '/pages/index/index',
      imageUrl: '/images/finalbanner2.jpg'
    }
  }
})
