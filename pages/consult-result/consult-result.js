// pages/consult-result/consult-result.js
Page({
  data: {
    record: null,
    isCompare: false,
    // 雷达图数据（Canvas绘制）
    radarData: {
      dimensions: [],
      values: []
    },
    // 对比表格
    compareHeaders: [],
    compareRows: []
  },

  onLoad(options) {
    const id = options.id
    if (!id) {
      wx.showToast({ title: '参数错误', icon: 'none' })
      return
    }
    this.loadRecord(id)
  },

  loadRecord(id) {
    const records = wx.getStorageSync('consultRecords') || []
    const record = records.find(r => r.id === id)
    if (!record) {
      wx.showToast({ title: '未找到记录', icon: 'none' })
      return
    }

    const isCompare = record.type === 'compare'
    this.setData({ record, isCompare })

    if (isCompare) {
      this.initCompareData(record)
    } else {
      this.initSingleData(record)
    }
  },

  initSingleData(record) {
    if (!record.scores) return
    const s = record.scores
    const dimensions = ['版型适合度', '颜色匹配度', '质感做工', '性价比']
    const values = [s.fitScore, s.colorScore, s.qualityScore, s.valueScore]
    this.setData({
      radarData: { dimensions, values }
    })
    // 延迟绘制雷达图
    setTimeout(() => this.drawRadar(), 300)
  },

  initCompareData(record) {
    if (!record.scores || !Array.isArray(record.scores)) return
    const labels = ['显瘦修饰', '日常百搭', '场合适配', '质感高级', '性价比', '耐看实用']
    const scoreKeys = ['slimScore', 'versatileScore', 'occasionScore', 'qualityScore', 'valueScore', 'durableScore']

    // 雷达图用排名第一的数据
    const topIdx = record.rankings && record.rankings[0] ? record.rankings[0].index : 0
    const topScore = record.scores.find(s => s.index === topIdx) || record.scores[0]
    const values = scoreKeys.map(k => topScore[k] || 0)

    this.setData({
      radarData: { dimensions: labels, values }
    })

    // 对比表格数据
    const compareHeaders = ['维度', ...record.scores.map(s => s.label)]
    const compareRows = labels.map((label, i) => {
      const row = { dimension: label, values: record.scores.map(s => s[scoreKeys[i]] || 0) }
      return row
    })
    this.setData({ compareHeaders, compareRows })

    setTimeout(() => this.drawRadar(), 300)
  },

  drawRadar() {
    const { dimensions, values } = this.data.radarData
    if (!dimensions.length) return

    const query = wx.createSelectorQuery()
    query.select('#radarCanvas').fields({ node: true, size: true }).exec((res) => {
      if (!res[0]) return
      const canvas = res[0].node
      const ctx = canvas.getContext('2d')
      const dpr = wx.getWindowInfo().pixelRatio
      const width = res[0].width
      const height = res[0].height
      canvas.width = width * dpr
      canvas.height = height * dpr
      ctx.scale(dpr, dpr)

      const centerX = width / 2
      const centerY = height / 2
      const maxRadius = Math.min(width, height) / 2 - 40
      const n = dimensions.length
      const angleStep = (2 * Math.PI) / n

      // 绘制网格
      ctx.strokeStyle = 'rgba(232, 168, 124, 0.15)'
      ctx.lineWidth = 1
      for (let level = 1; level <= 5; level++) {
        const r = (maxRadius / 5) * level
        ctx.beginPath()
        for (let i = 0; i <= n; i++) {
          const angle = -Math.PI / 2 + angleStep * i
          const x = centerX + r * Math.cos(angle)
          const y = centerY + r * Math.sin(angle)
          if (i === 0) ctx.moveTo(x, y)
          else ctx.lineTo(x, y)
        }
        ctx.closePath()
        ctx.stroke()
      }

      // 绘制轴线
      ctx.strokeStyle = 'rgba(232, 168, 124, 0.2)'
      for (let i = 0; i < n; i++) {
        const angle = -Math.PI / 2 + angleStep * i
        ctx.beginPath()
        ctx.moveTo(centerX, centerY)
        ctx.lineTo(centerX + maxRadius * Math.cos(angle), centerY + maxRadius * Math.sin(angle))
        ctx.stroke()
      }

      // 绘制数据区域
      ctx.fillStyle = 'rgba(232, 168, 124, 0.2)'
      ctx.strokeStyle = '#e8a87c'
      ctx.lineWidth = 2
      ctx.beginPath()
      for (let i = 0; i <= n; i++) {
        const idx = i % n
        const angle = -Math.PI / 2 + angleStep * idx
        const r = (values[idx] / 10) * maxRadius
        const x = centerX + r * Math.cos(angle)
        const y = centerY + r * Math.sin(angle)
        if (i === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      }
      ctx.closePath()
      ctx.fill()
      ctx.stroke()

      // 绘制数据点
      ctx.fillStyle = '#e8a87c'
      for (let i = 0; i < n; i++) {
        const angle = -Math.PI / 2 + angleStep * i
        const r = (values[i] / 10) * maxRadius
        const x = centerX + r * Math.cos(angle)
        const y = centerY + r * Math.sin(angle)
        ctx.beginPath()
        ctx.arc(x, y, 4, 0, 2 * Math.PI)
        ctx.fill()
      }

      // 绘制标签
      ctx.fillStyle = '#666'
      ctx.font = '11px sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      for (let i = 0; i < n; i++) {
        const angle = -Math.PI / 2 + angleStep * i
        const labelR = maxRadius + 24
        const x = centerX + labelR * Math.cos(angle)
        const y = centerY + labelR * Math.sin(angle)
        ctx.fillText(dimensions[i], x, y)
      }
    })
  },

  onConsultAgain() {
    wx.navigateBack()
  },

  onBackHome() {
    wx.switchTab({ url: '/pages/outfit/outfit' })
  },

  onShareAppMessage() {
    const record = this.data.record
    return {
      title: record ? `${record.verdict} - 搭搭AI穿搭决策` : '搭搭AI穿搭决策',
      path: '/pages/outfit/outfit'
    }
  }
})
