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

    this.setData({ report, scoreRotation: Math.round((report.basic.overallScore / 10) * 360) })
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
    try {
      const auth = await wx.getSetting()
      if (!auth.authSetting['scope.writePhotosAlbum']) {
        await wx.authorize({ scope: 'scope.writePhotosAlbum' })
      }
      wx.showLoading({ title: '生成图片中...' })
      const tempPath = await this.drawReportCard()
      await wx.saveImageToPhotosAlbum({ filePath: tempPath })
      wx.hideLoading()
      wx.showToast({ title: '已保存到相册', icon: 'success' })
    } catch (err) {
      wx.hideLoading()
      if (err.errMsg?.includes('auth deny') || err.errMsg?.includes('authorize no response')) {
        wx.showModal({
          title: '需要相册权限',
          content: '请在设置中开启相册权限后重试',
          success(res) { if (res.confirm) wx.openSetting() }
        })
      } else {
        console.error('[report] 保存失败:', err)
        wx.showToast({ title: '保存失败，请重试', icon: 'none' })
      }
    }
  },

  onReDiagnose() {
    if (!this.data.shared) {
      wx.showToast({ title: '请先分享解锁', icon: 'none' })
      return
    }
    wx.navigateTo({ url: '/pages/diagnose/diagnose' })
  },

  // ==================== 绘制报告卡片 ====================
  _roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath()
    ctx.moveTo(x + r, y)
    ctx.lineTo(x + w - r, y)
    ctx.arcTo(x + w, y, x + w, y + r, r)
    ctx.lineTo(x + w, y + h - r)
    ctx.arcTo(x + w, y + h, x + w - r, y + h, r)
    ctx.lineTo(x + r, y + h)
    ctx.arcTo(x, y + h, x, y + h - r, r)
    ctx.lineTo(x, y + r)
    ctx.arcTo(x, y, x + r, y, r)
    ctx.closePath()
  },

  _truncateText(ctx, text, maxW) {
    if (!text) return ''
    if (ctx.measureText(text).width <= maxW) return text
    while (text.length > 0 && ctx.measureText(text + '…').width > maxW) {
      text = text.slice(0, -1)
    }
    return text + '…'
  },

  _wrapText(ctx, text, maxW, maxLines) {
    if (!text) return []
    const lines = []
    let line = ''
    for (let i = 0; i < text.length; i++) {
      const test = line + text[i]
      if (ctx.measureText(test).width > maxW && line) {
        lines.push(line)
        line = text[i]
      } else {
        line = test
      }
    }
    if (line) lines.push(line)
    if (maxLines && lines.length > maxLines) {
      lines.length = maxLines
      lines[maxLines - 1] = lines[maxLines - 1].replace(/.$/, '…')
    }
    return lines
  },

  _loadImage(canvas, src) {
    return new Promise((resolve) => {
      const img = canvas.createImage()
      img.onload = () => resolve(img)
      img.onerror = () => resolve(null)
      img.src = src
    })
  },

  drawReportCard() {
    return new Promise((resolve, reject) => {
      const query = wx.createSelectorQuery()
      query.select('#report-card-canvas').fields({ node: true, size: true }).exec(async (res) => {
        if (!res[0]) { reject(new Error('Canvas not found')); return }

        const canvas = res[0].node
        const ctx = canvas.getContext('2d')
        const dpr = wx.getWindowInfo().pixelRatio
        const w = res[0].width
        const h = res[0].height
        canvas.width = w * dpr
        canvas.height = h * dpr
        ctx.scale(dpr, dpr)

        const report = this.data.report
        const p = 20
        const cw = w - p * 2

        // === 背景 ===
        ctx.fillStyle = '#FAFAF5'
        this._roundRect(ctx, 0, 0, w, h, 16)
        ctx.fill()

        // === 顶部金色渐变 ===
        const headerH = 90
        const grad = ctx.createLinearGradient(0, 0, w, headerH)
        grad.addColorStop(0, '#C8A97E')
        grad.addColorStop(1, '#E8D5B7')
        ctx.fillStyle = grad
        ctx.fillRect(0, 0, w, headerH)

        ctx.fillStyle = '#fff'
        ctx.font = 'bold 18px sans-serif'
        ctx.textAlign = 'center'
        ctx.fillText('✦ 形象风格诊断报告', w / 2, 36)

        ctx.font = '11px sans-serif'
        ctx.fillStyle = 'rgba(255,255,255,0.8)'
        const now = new Date()
        const dateStr = `${now.getFullYear()}.${String(now.getMonth() + 1).padStart(2, '0')}.${String(now.getDate()).padStart(2, '0')}`
        ctx.fillText(dateStr, w / 2, 56)

        // === 评分区 ===
        let y = headerH + 16

        // 头像
        const avatarR = 24
        const avatarCX = p + avatarR
        const avatarCY = y + avatarR + 2

        ctx.save()
        ctx.beginPath()
        ctx.arc(avatarCX, avatarCY, avatarR, 0, Math.PI * 2)
        ctx.fillStyle = '#E8D5B7'
        ctx.fill()
        ctx.strokeStyle = '#fff'
        ctx.lineWidth = 2
        ctx.stroke()
        ctx.restore()

        if (report.photoUrl) {
          const avatarImg = await this._loadImage(canvas, report.photoUrl)
          if (avatarImg) {
            ctx.save()
            ctx.beginPath()
            ctx.arc(avatarCX, avatarCY, avatarR, 0, Math.PI * 2)
            ctx.clip()
            ctx.drawImage(avatarImg, avatarCX - avatarR, avatarCY - avatarR, avatarR * 2, avatarR * 2)
            ctx.restore()
          } else {
            ctx.fillStyle = '#fff'
            ctx.font = 'bold 13px sans-serif'
            ctx.textAlign = 'center'
            ctx.fillText('Me', avatarCX, avatarCY + 5)
          }
        } else {
          ctx.fillStyle = '#fff'
          ctx.font = 'bold 13px sans-serif'
          ctx.textAlign = 'center'
          ctx.fillText('Me', avatarCX, avatarCY + 5)
        }

        // 分数
        const scoreX = p + avatarR * 2 + 14
        ctx.textAlign = 'left'
        ctx.fillStyle = '#333'
        ctx.font = 'bold 30px sans-serif'
        ctx.fillText(String(report.basic.overallScore), scoreX, avatarCY + 4)

        const scoreW = ctx.measureText(String(report.basic.overallScore)).width
        ctx.font = '12px sans-serif'
        ctx.fillStyle = '#999'
        ctx.fillText('分', scoreX + scoreW + 3, avatarCY + 4)

        // 标签
        if (report.basic.tags?.length) {
          let tagX = scoreX
          const tagY = avatarCY + 14
          ctx.font = '10px sans-serif'
          report.basic.tags.slice(0, 3).forEach(tag => {
            const tw = ctx.measureText(tag).width + 12
            ctx.fillStyle = '#F5F0EB'
            this._roundRect(ctx, tagX, tagY, tw, 17, 8)
            ctx.fill()
            ctx.fillStyle = '#8B7355'
            ctx.fillText(tag, tagX + 6, tagY + 12)
            tagX += tw + 6
          })
        }

        // === 模块卡片 ===
        y = avatarCY + avatarR + 18

        const sections = [
          {
            title: '🧬 面部&骨相', color: '#C8A97E',
            show: !!report.modules.dna,
            lines: () => {
              const d = report.modules.dna
              const l = [`${d.faceType || ''} · ${d.boneType || ''}`]
              if (d.keyInsight) l.push('✦ ' + d.keyInsight)
              return l
            }
          },
          {
            title: '🎨 皮肤&风格', color: '#E8A0BF',
            show: !!report.modules.style,
            lines: () => {
              const d = report.modules.style
              const l = [`${d.skinType || ''} · ${d.season || ''} · ${d.mainStyle || ''}`]
              if (d.keyInsight) l.push('✦ ' + d.keyInsight)
              return l
            }
          },
          {
            title: '✂️ 发型&妆容', color: '#D4A574',
            show: !!report.modules.hairmakeup,
            lines: () => {
              const d = report.modules.hairmakeup
              const top = d.hairRecommend?.top3?.[0]
              const l = [top ? `推荐：${top.name} ${top.score}/10` : '']
              if (d.keyInsight) l.push('✦ ' + d.keyInsight)
              return l.filter(Boolean)
            }
          },
          {
            title: '🌟 颜值&蜕变', color: '#8FBC8F',
            show: !!report.modules.optimize,
            lines: () => {
              const d = report.modules.optimize
              const l = []
              if (d.coreConclusion) l.push(d.coreConclusion)
              if (d.keyInsight) l.push('✦ ' + d.keyInsight)
              return l
            }
          }
        ]

        sections.forEach(sec => {
          if (!sec.show) return
          const lines = sec.lines()
          if (!lines.length) return

          // 计算卡片高度
          const textLines = []
          lines.forEach(line => {
            ctx.font = '10px sans-serif'
            textLines.push(...this._wrapText(ctx, line, cw - 24, 2))
          })
          const cardH = 14 + 16 + textLines.length * 15 + 10

          // 卡片背景
          ctx.fillStyle = '#fff'
          this._roundRect(ctx, p, y, cw, cardH, 10)
          ctx.fill()

          // 左侧色条
          ctx.fillStyle = sec.color
          this._roundRect(ctx, p, y, 4, cardH, 2)
          ctx.fill()

          // 标题
          ctx.font = 'bold 11px sans-serif'
          ctx.fillStyle = '#333'
          ctx.textAlign = 'left'
          ctx.fillText(sec.title, p + 12, y + 16)

          // 内容
          ctx.font = '10px sans-serif'
          let lineY = y + 30
          textLines.forEach(line => {
            ctx.fillStyle = line.startsWith('✦') ? '#999' : '#555'
            ctx.fillText(line, p + 12, lineY)
            lineY += 15
          })

          y += cardH + 8
        })

        // === 核心结论（如有额外空间）===
        const conclusion = report.modules.optimize?.coreConclusion
        if (conclusion && y < h - 80) {
          ctx.font = '10px sans-serif'
          const conLines = this._wrapText(ctx, conclusion, cw - 24, 3)
          const conH = 12 + conLines.length * 14 + 10

          ctx.fillStyle = '#F5F0EB'
          this._roundRect(ctx, p, y, cw, conH, 10)
          ctx.fill()

          ctx.font = '10px sans-serif'
          ctx.fillStyle = '#8B7355'
          conLines.forEach((line, i) => {
            ctx.fillText(line, p + 12, y + 16 + i * 14)
          })
          y += conH + 8
        }

        // === 底部水印 ===
        const footerH = 48
        const footerY = h - footerH - 8
        ctx.fillStyle = '#F0EBE5'
        this._roundRect(ctx, p, footerY, cw, footerH, 10)
        ctx.fill()

        ctx.font = 'bold 14px sans-serif'
        ctx.fillStyle = '#8B7355'
        ctx.textAlign = 'center'
        ctx.fillText('美哒 Meeta', w / 2, footerY + 22)

        ctx.font = '10px sans-serif'
        ctx.fillStyle = '#B8A88A'
        
        ctx.fillText('AI 形象风格诊断', w / 2, footerY + 38)

        // === 导出 ===
        setTimeout(() => {
          wx.canvasToTempFilePath({
            canvas,
            success: (r) => resolve(r.tempFilePath),
            fail: reject
          })
        }, 300)
      })
    })
  },

  onShareAppMessage() {
    if (!this.data.shared) this.setData({ shared: true })
    const report = this.data.report
    const score = report?.basic?.overallScore || ''
    return {
      title: score ? `我的形象风格AI评分：${score}分，快来测测你的风格！` : 'AI形象风格诊断，快来测测你的风格！',
      path: '/pages/index/index',
      imageUrl: '/images/打分分享banner.jpg'
    }
  }
})
