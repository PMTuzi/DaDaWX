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
      wx.showToast({ title: '未找到记录，即将返回', icon: 'none', duration: 2000 })
      setTimeout(() => wx.switchTab({ url: '/pages/index/index' }), 2000)
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
    const s = record.scores || {}
    const dimensions = ['版型适合度', '颜色匹配度', '质感做工', '性价比']
    const values = [
      s.fitScore || 0,
      s.colorScore || 0,
      s.qualityScore || 0,
      s.valueScore || 0
    ]
    // 如果所有值都是0则不绘制
    if (values.every(v => v === 0)) return
    this.setData({
      radarData: { dimensions, values }
    })
    // 等待 Canvas 渲染后绘制
    setTimeout(() => this.drawRadar(), 500)
  },

  initCompareData(record) {
    const scores = record.scores || []
    if (!Array.isArray(scores) || scores.length === 0) return
    const labels = ['显瘦修饰', '日常百搭', '场合适配', '质感高级', '性价比', '耐看实用']
    const scoreKeys = ['slimScore', 'versatileScore', 'occasionScore', 'qualityScore', 'valueScore', 'durableScore']

    // 雷达图用排名第一的数据
    const rankings = record.rankings || []
    const topIdx = rankings[0] ? rankings[0].index : 0
    const topScore = scores.find(s => s.index === topIdx) || scores[0]
    const values = scoreKeys.map(k => topScore[k] || 0)

    this.setData({
      radarData: { dimensions: labels, values }
    })

    // 对比表格数据
    const compareHeaders = ['维度', ...scores.map(s => s.label || ('款式' + (s.index + 1)))]
    const compareRows = labels.map((label, i) => {
      const row = { dimension: label, values: scores.map(s => s[scoreKeys[i]] || 0) }
      return row
    })
    this.setData({ compareHeaders, compareRows })

    setTimeout(() => this.drawRadar(), 500)
  },

  drawRadar(retryCount) {
    const { dimensions, values } = this.data.radarData
    if (!dimensions.length) return

    const retry = typeof retryCount === 'number' ? retryCount : 0
    const that = this

    wx.createSelectorQuery().in(this)
      .select('#radarCanvas').fields({ node: true, size: true }).exec((res) => {
        if (!res || !res[0] || !res[0].node) {
          // Canvas 节点未就绪，自动重试
          if (retry < 5) {
            setTimeout(() => that.drawRadar(retry + 1), 300)
          }
          return
        }
        const canvas = res[0].node
        const ctx = canvas.getContext('2d')
        const dpr = wx.getWindowInfo().pixelRatio
        const width = res[0].width
        const height = res[0].height
        canvas.width = width * dpr
        canvas.height = height * dpr
        ctx.scale(dpr, dpr)
        ctx.clearRect(0, 0, width, height)

        const centerX = width / 2
        const centerY = height / 2
        const maxRadius = Math.min(width, height) / 2 - 40
        const n = dimensions.length
        const angleStep = (2 * Math.PI) / n

        // 绘制网格
        ctx.strokeStyle = 'rgba(200, 169, 126, 0.15)'
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
        ctx.strokeStyle = 'rgba(200, 169, 126, 0.25)'
        for (let i = 0; i < n; i++) {
          const angle = -Math.PI / 2 + angleStep * i
          ctx.beginPath()
          ctx.moveTo(centerX, centerY)
          ctx.lineTo(centerX + maxRadius * Math.cos(angle), centerY + maxRadius * Math.sin(angle))
          ctx.stroke()
        }

        // 绘制数据区域（渐变填充）
        const gradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, maxRadius)
        gradient.addColorStop(0, 'rgba(200, 169, 126, 0.35)')
        gradient.addColorStop(1, 'rgba(200, 169, 126, 0.08)')
        ctx.fillStyle = gradient
        ctx.strokeStyle = '#C8A97E'
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
        ctx.fillStyle = '#C8A97E'
        for (let i = 0; i < n; i++) {
          const angle = -Math.PI / 2 + angleStep * i
          const r = (values[i] / 10) * maxRadius
          const x = centerX + r * Math.cos(angle)
          const y = centerY + r * Math.sin(angle)
          ctx.beginPath()
          ctx.arc(x, y, 4, 0, 2 * Math.PI)
          ctx.fill()
        }

        // 绘制标签+分值
        ctx.fillStyle = '#666'
        ctx.font = '11px sans-serif'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        for (let i = 0; i < n; i++) {
          const angle = -Math.PI / 2 + angleStep * i
          const labelR = maxRadius + 24
          const x = centerX + labelR * Math.cos(angle)
          const y = centerY + labelR * Math.sin(angle)
          ctx.fillText(dimensions[i], x, y - 7)
          ctx.fillStyle = '#C8A97E'
          ctx.font = 'bold 10px sans-serif'
          ctx.fillText(values[i] + '', x, y + 7)
          ctx.fillStyle = '#666'
          ctx.font = '11px sans-serif'
        }
      })
  },

  onPreviewImage(e) {
    const url = e.currentTarget.dataset.url
    const images = this.data.record.images || []
    const urls = images.map(img => img.localPath || img.imageUrl).filter(u => u)
    if (urls.length === 0) return
    wx.previewImage({
      current: url,
      urls
    })
  },

  onImageError(e) {
    const idx = e.currentTarget.dataset.index || 0
    console.warn('[consult-result] 图片加载失败, index:', idx)
  },

  onConsultAgain() {
    wx.navigateTo({ url: '/pages/consult-publish/consult-publish' })
  },

  onBackHome() {
    wx.switchTab({ url: '/pages/index/index' })
  },

  onShareAppMessage() {
    const record = this.data.record
    const score = record?.totalScore || ''
    return {
      title: score ? `穿搭评分 ${score}分 - AI帮你不踩雷` : 'AI穿搭决策 - 帮你不踩雷',
      path: '/pages/outfit/outfit',
      imageUrl: '/images/finalbanner2.jpg'
    }
  }
})
