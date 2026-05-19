
// pages/report/report.js
const { request, API } = require('../../utils/api')
const { getScoreLevel } = require('../../utils/format')

Page({
  data: {
    report: null,
    scoreLevel: null,
    activeTab: 'bone',
    tabIndex: 0,
    posters: {},
    bone: {},
    skin: {},
    colorStyle: {},
    outfit: {}
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

    const modules = report.modules || {}
    const bone = modules.bone || this._extractBoneFromLegacy(report)
    const skin = modules.skin || this._extractSkinFromLegacy(report)
    const colorStyle = modules.colorStyle || this._extractColorFromLegacy(report)
    const outfit = modules.outfit || this._extractOutfitFromLegacy(report)

    this.setData({
      report,
      scoreLevel: getScoreLevel(report.basic?.overallScore || 0),
      bone, skin, colorStyle, outfit
    })

    if (report.photoUrl) {
      setTimeout(() => this.drawFaceAnnotation(report), 300)
    }
    setTimeout(() => this.drawRadarChart(bone), 400)
    setTimeout(() => this.drawColorTriangle(skin, colorStyle), 500)

    // 延迟生成Seedream杂志风海报（不阻塞页面渲染）
    setTimeout(() => this._loadPosters(report), 1000)
  },

  onTabTap(e) {
    const tab = e.currentTarget.dataset.tab
    const tabMap = { bone: 0, skin: 1, colorStyle: 2, outfit: 3 }
    this.setData({ activeTab: tab, tabIndex: tabMap[tab] })
  },

  onSwiperChange(e) {
    const index = e.detail.current
    const tabs = ['bone', 'skin', 'colorStyle', 'outfit']
    this.setData({ activeTab: tabs[index], tabIndex: index })
  },

  // ============ Canvas 1: 三庭五眼专业标注（2000+密集点云） ============
  drawFaceAnnotation(report) {
    wx.createSelectorQuery().select('#faceAnnotation')
      .fields({ node: true, size: true }).exec((res) => {
        if (!res?.[0]?.node) return
        const canvas = res[0].node
        const ctx = canvas.getContext('2d')
        const dpr = wx.getWindowInfo().pixelRatio
        const cw = res[0].width
        const ch = res[0].height || cw * 1.33

        canvas.width = cw * dpr
        canvas.height = ch * dpr
        ctx.scale(dpr, dpr)

        const img = canvas.createImage()
        img.src = report.photoUrl
        img.onload = () => this._renderAnnotation(ctx, img, report, cw, ch)
        img.onerror = () => this._renderAnnotationFallback(ctx, report, cw, ch)
      })
  },

  _renderAnnotation(ctx, img, report, cw, ch) {
    // 1. 图片适配计算
    const imgR = img.width / img.height
    const canR = cw / ch
    let dw, dh, dx, dy
    if (imgR > canR) {
      dh = ch; dw = dh * imgR; dx = (cw - dw) / 2; dy = 0
    } else {
      dw = cw; dh = dw / imgR; dx = 0; dy = (ch - dh) / 2
    }

    // 2. 深色背景
    ctx.fillStyle = '#0d0d1a'
    ctx.fillRect(0, 0, cw, ch)

    // 3. 底图（半透明 + 暗角）
    ctx.globalAlpha = 0.5
    ctx.drawImage(img, dx, dy, dw, dh)
    ctx.globalAlpha = 1.0

    // 暗角蒙版
    const vgn = ctx.createRadialGradient(cw / 2, ch / 2, Math.min(cw, ch) * 0.3, cw / 2, ch / 2, Math.max(cw, ch) * 0.7)
    vgn.addColorStop(0, 'rgba(13,13,26,0)')
    vgn.addColorStop(1, 'rgba(13,13,26,0.5)')
    ctx.fillStyle = vgn
    ctx.fillRect(0, 0, cw, ch)

    const lm = report.landmarks || {}
    const dp = report.detailPoints || null
    const dense = report.densifiedPoints || null
    const mesh = report.meshData || null
    const tx = (v) => dx + Number(v) * dw
    const ty = (v) => dy + Number(v) * dh

    // 4. 面网格绘制（三角面片 + 顶点点云，颜创2000+点效果）
    if (mesh && mesh.meshPoints && mesh.meshPoints.length > 100) {
      // 绘制三角面片边线
      ctx.strokeStyle = 'rgba(232, 168, 124, 0.08)'
      ctx.lineWidth = 0.3
      const triCount = Math.min(mesh.triangles?.length || 0, 3000)  // 限制绘制数量
      for (let i = 0; i < triCount; i++) {
        const tri = mesh.triangles[i]
        if (!tri || tri.length < 3) continue
        const p0 = mesh.meshPoints[tri[0]]
        const p1 = mesh.meshPoints[tri[1]]
        const p2 = mesh.meshPoints[tri[2]]
        if (!p0 || !p1 || !p2) continue
        ctx.beginPath()
        ctx.moveTo(tx(p0.x), ty(p0.y))
        ctx.lineTo(tx(p1.x), ty(p1.y))
        ctx.lineTo(tx(p2.x), ty(p2.y))
        ctx.closePath()
        ctx.stroke()
      }

      // 绘制顶点点云（密集采集点效果）
      const ptCount = mesh.meshPoints.length
      ctx.fillStyle = 'rgba(232, 168, 124, 0.15)'
      for (let i = 0; i < ptCount; i += 2) {  // 隔一个绘制，避免太密
        const pt = mesh.meshPoints[i]
        if (!pt) continue
        ctx.beginPath()
        ctx.arc(tx(pt.x), ty(pt.y), 0.6, 0, Math.PI * 2)
        ctx.fill()
      }
    }

    // 5. 面部轮廓（使用加密后的密集点绘制平滑曲线）
    const outlinePts = dense?.faceOutline?.dense || dp?.faceOutline
    if (outlinePts && outlinePts.length > 10) {
      const pts = outlinePts.map(p => ({ x: tx(p.x), y: ty(p.y) }))
      ctx.beginPath()
      ctx.moveTo(pts[0].x, pts[0].y)
      for (let i = 1; i < pts.length; i++) {
        ctx.lineTo(pts[i].x, pts[i].y)
      }
      ctx.closePath()

      // 轮廓发光
      ctx.strokeStyle = 'rgba(232, 168, 124, 0.3)'
      ctx.lineWidth = 4
      ctx.stroke()
      ctx.strokeStyle = 'rgba(232, 168, 124, 0.8)'
      ctx.lineWidth = 1.5
      ctx.stroke()

      // 半透明填充
      ctx.fillStyle = 'rgba(232, 168, 124, 0.03)'
      ctx.fill()
    }

    // 5b. 下颌线（iCREDIT API 提供）
    const jawLinePts = dense?.jawLine?.dense || dp?.jawLine
    if (jawLinePts && jawLinePts.length > 5) {
      const pts = jawLinePts.map(p => ({ x: tx(p.x), y: ty(p.y) }))
      ctx.beginPath()
      ctx.moveTo(pts[0].x, pts[0].y)
      for (let i = 1; i < pts.length; i++) {
        ctx.lineTo(pts[i].x, pts[i].y)
      }
      ctx.strokeStyle = 'rgba(232, 168, 124, 0.5)'
      ctx.lineWidth = 1.2
      ctx.stroke()
    }

    // 6. 五官轮廓（使用加密后的密集点，兼容旧数据）
    const drawPartDense = (denseData, sparseData, color, lineW) => {
      const points = denseData?.dense || sparseData
      if (!points || points.length < 3) return
      const pts = points.map(p => ({ x: tx(p.x), y: ty(p.y) }))
      ctx.beginPath()
      ctx.moveTo(pts[0].x, pts[0].y)
      for (let i = 1; i < pts.length; i++) {
        ctx.lineTo(pts[i].x, pts[i].y)
      }
      ctx.closePath()
      ctx.strokeStyle = color
      ctx.lineWidth = lineW || 1.2
      ctx.stroke()
    }

    if (dense || dp) {
      drawPartDense(dense?.leftEye, dp?.leftEye, 'rgba(100, 200, 255, 0.85)', 1.5)
      drawPartDense(dense?.rightEye, dp?.rightEye, 'rgba(100, 200, 255, 0.85)', 1.5)
      drawPartDense(dense?.leftBrow, dp?.leftBrow, 'rgba(200, 170, 130, 0.7)', 1.2)
      drawPartDense(dense?.rightBrow, dp?.rightBrow, 'rgba(200, 170, 130, 0.7)', 1.2)
      drawPartDense(dense?.nose, dp?.nose, 'rgba(150, 220, 150, 0.6)', 1.0)
      drawPartDense(dense?.mouth, dp?.mouth, 'rgba(255, 140, 140, 0.7)', 1.2)
    }

    // 7. 五官关键结构点标注（原始106点中的关键点，用醒目圆点标记）
    const drawKeyDot = (x, y, r, color) => {
      if (x == null || y == null) return
      ctx.beginPath()
      ctx.arc(tx(x), ty(y), r, 0, Math.PI * 2)
      ctx.fillStyle = color
      ctx.fill()
      // 发光
      ctx.beginPath()
      ctx.arc(tx(x), ty(y), r * 2.5, 0, Math.PI * 2)
      ctx.fillStyle = color.replace(/[\d.]+\)$/, '0.15)')
      ctx.fill()
    }

    // 瞳孔
    if (lm.leftPupil) drawKeyDot(lm.leftPupil.x, lm.leftPupil.y, 3, 'rgba(100, 200, 255, 0.9)')
    if (lm.rightPupil) drawKeyDot(lm.rightPupil.x, lm.rightPupil.y, 3, 'rgba(100, 200, 255, 0.9)')

    // 眼角
    if (lm.leftEyeInner) drawKeyDot(lm.leftEyeInner.x, lm.leftEyeInner.y, 2, 'rgba(100, 200, 255, 0.6)')
    if (lm.leftEyeOuter) drawKeyDot(lm.leftEyeOuter.x, lm.leftEyeOuter.y, 2, 'rgba(100, 200, 255, 0.6)')
    if (lm.rightEyeInner) drawKeyDot(lm.rightEyeInner.x, lm.rightEyeInner.y, 2, 'rgba(100, 200, 255, 0.6)')
    if (lm.rightEyeOuter) drawKeyDot(lm.rightEyeOuter.x, lm.rightEyeOuter.y, 2, 'rgba(100, 200, 255, 0.6)')

    // 鼻尖和鼻翼
    if (dp?.nose?.[5]) drawKeyDot(dp.nose[5].x, dp.nose[5].y, 2, 'rgba(150, 220, 150, 0.6)')
    if (dp?.nose?.[7]) drawKeyDot(dp.nose[7].x, dp.nose[7].y, 1.5, 'rgba(150, 220, 150, 0.5)')
    if (dp?.nose?.[8]) drawKeyDot(dp.nose[8].x, dp.nose[8].y, 1.5, 'rgba(150, 220, 150, 0.5)')

    // 嘴角
    if (dp?.mouth?.[0]) drawKeyDot(dp.mouth[0].x, dp.mouth[0].y, 2, 'rgba(255, 140, 140, 0.6)')
    if (dp?.mouth?.[6]) drawKeyDot(dp.mouth[6].x, dp.mouth[6].y, 2, 'rgba(255, 140, 140, 0.6)')

    // 8. 面部中轴线
    if (dp?.nose?.length > 5) {
      const noseTop = dp.nose[0]
      const noseTip = dp.nose[5] || dp.nose[dp.nose.length - 1]
      if (noseTop && noseTip) {
        ctx.beginPath()
        ctx.setLineDash([4, 6])
        ctx.strokeStyle = 'rgba(255,255,255,0.15)'
        ctx.lineWidth = 1
        ctx.moveTo(tx(noseTop.x), ty(noseTop.y) - dh * 0.15)
        ctx.lineTo(tx(noseTop.x), ty(noseTip.y) + dh * 0.1)
        ctx.stroke()
        ctx.setLineDash([])
      }
    }

    // 9. 三庭标注线 + 区域高亮
    const hairY = lm.hairline?.y != null ? ty(lm.hairline.y) : null
    const browYVal = lm.browY != null ? ty(lm.browY) : (lm.eyebrowLeft?.y != null ? ty(lm.eyebrowLeft.y) : null)
    const noseY = lm.noseBase?.y != null ? ty(lm.noseBase.y) : null
    const chinY = lm.chin?.y != null ? ty(lm.chin.y) : null

    if (hairY && browYVal && noseY && chinY) {
      // 三庭区域渐变着色
      const courtColors = [
        { top: hairY, bot: browYVal, c1: 'rgba(232,168,124,0.02)', c2: 'rgba(232,168,124,0.08)' },
        { top: browYVal, bot: noseY, c1: 'rgba(100,200,255,0.02)', c2: 'rgba(100,200,255,0.08)' },
        { top: noseY, bot: chinY, c1: 'rgba(200,170,100,0.02)', c2: 'rgba(200,170,100,0.08)' }
      ]
      courtColors.forEach(c => {
        const grd = ctx.createLinearGradient(0, c.top, 0, c.bot)
        grd.addColorStop(0, c.c1)
        grd.addColorStop(0.5, c.c2)
        grd.addColorStop(1, c.c1)
        ctx.fillStyle = grd
        ctx.fillRect(dx + 10, c.top, dw - 20, c.bot - c.top)
      })

      // 三庭水平线
      const lines = [
        { y: hairY, label: '发际线', dash: true, color: 'rgba(232,168,124,0.6)' },
        { y: browYVal, label: '眉骨', dash: false, color: 'rgba(232,168,124,0.85)' },
        { y: noseY, label: '鼻底', dash: false, color: 'rgba(232,168,124,0.85)' },
        { y: chinY, label: '下巴', dash: true, color: 'rgba(232,168,124,0.6)' }
      ]

      lines.forEach(l => {
        ctx.beginPath()
        ctx.setLineDash(l.dash ? [5, 4] : [])
        ctx.strokeStyle = l.color
        ctx.lineWidth = l.dash ? 1 : 1.5
        ctx.moveTo(dx + 8, l.y)
        ctx.lineTo(dx + dw - 8, l.y)
        ctx.stroke()
        ctx.setLineDash([])

        // 左侧标签（胶囊样式）
        ctx.font = '9px sans-serif'
        const tw = ctx.measureText(l.label).width
        const lbx = dx + 10
        const lby = l.y - 4

        ctx.fillStyle = 'rgba(13,13,26,0.7)'
        this._roundRect(ctx, lbx, lby - 11, tw + 10, 16, 4)
        ctx.fill()
        ctx.fillStyle = l.color
        ctx.fillText(l.label, lbx + 5, lby + 1)
      })

      // 右侧三庭比例标签
      const tc = report.threeCourtsMeasure
      if (tc) {
        const courtLabels = [
          { y: (hairY + browYVal) / 2, name: '上庭', ratio: tc.upper, color: '#e8a87c' },
          { y: (browYVal + noseY) / 2, name: '中庭', ratio: tc.middle, color: '#64c8ff' },
          { y: (noseY + chinY) / 2, name: '下庭', ratio: tc.lower, color: '#c8aa64' }
        ]
        courtLabels.forEach(c => {
          const pct = (c.ratio * 100).toFixed(0)
          const text = `${c.name} ${pct}%`

          ctx.font = 'bold 9px sans-serif'
          const tw2 = ctx.measureText(text).width
          const rbx = dx + dw - tw2 - 18

          ctx.fillStyle = 'rgba(13,13,26,0.7)'
          this._roundRect(ctx, rbx, c.y - 9, tw2 + 10, 18, 4)
          ctx.fill()
          ctx.fillStyle = c.color
          ctx.fillText(text, rbx + 5, c.y + 3)
        })

        // 底部总评
        ctx.font = 'bold 9px sans-serif'
        ctx.textAlign = 'center'
        ctx.fillStyle = 'rgba(232,168,124,0.9)'
        ctx.fillText(tc.balance, cw / 2, chinY + 16)
        ctx.textAlign = 'left'
      }
    }

    // 10. 五眼标注
    const ltX = lm.leftTemple?.x != null ? tx(lm.leftTemple.x) : null
    const loX = lm.leftEyeOuter?.x != null ? tx(lm.leftEyeOuter.x) : null
    const liX = lm.leftEyeInner?.x != null ? tx(lm.leftEyeInner.x) : null
    const riX = lm.rightEyeInner?.x != null ? tx(lm.rightEyeInner.x) : null
    const roX = lm.rightEyeOuter?.x != null ? tx(lm.rightEyeOuter.x) : null
    const rtX = lm.rightTemple?.x != null ? tx(lm.rightTemple.x) : null

    if (ltX && loX && liX && riX && roX && rtX && browYVal && noseY) {
      const midY = (browYVal + noseY) / 2
      const eyeXs = [ltX, loX, liX, riX, roX, rtX]
      const bandH = 24

      // 五眼区域渐变色带
      const eyeColors = [
        'rgba(100,200,255,0.12)',
        'rgba(100,200,255,0.06)',
        'rgba(100,200,255,0.12)',
        'rgba(100,200,255,0.06)',
        'rgba(100,200,255,0.12)'
      ]
      for (let i = 0; i < 5; i++) {
        const grd = ctx.createLinearGradient(eyeXs[i], 0, eyeXs[i + 1], 0)
        grd.addColorStop(0, eyeColors[i])
        grd.addColorStop(0.5, eyeColors[i].replace(/[\d.]+\)$/, m => (parseFloat(m) * 1.5).toFixed(2) + ')'))
        grd.addColorStop(1, eyeColors[i])
        ctx.fillStyle = grd
        ctx.fillRect(eyeXs[i], midY - bandH / 2, eyeXs[i + 1] - eyeXs[i], bandH)
      }

      // 分割线
      eyeXs.forEach((x, i) => {
        ctx.beginPath()
        ctx.setLineDash([2, 2])
        ctx.strokeStyle = i === 0 || i === 5 ? 'rgba(100,200,255,0.3)' : 'rgba(100,200,255,0.5)'
        ctx.lineWidth = 1
        ctx.moveTo(x, midY - bandH / 2 - 4)
        ctx.lineTo(x, midY + bandH / 2 + 4)
        ctx.stroke()
        ctx.setLineDash([])
      })

      // 五眼标签 + 百分比
      const fe = report.fiveEyesMeasure
      const eyeLabels = ['眼1', '左眼', '眼距', '右眼', '眼5']
      const eyeRatios = fe ? [fe.eye1, fe.leftEye, fe.interEye, fe.rightEye, fe.eye5] : []
      ctx.textAlign = 'center'
      for (let i = 0; i < 5; i++) {
        const cx = (eyeXs[i] + eyeXs[i + 1]) / 2
        const pct = eyeRatios[i] ? `${(eyeRatios[i] * 100).toFixed(0)}%` : ''
        ctx.font = '8px sans-serif'
        ctx.fillStyle = 'rgba(100,200,255,0.7)'
        ctx.fillText(eyeLabels[i], cx, midY - bandH / 2 - 6)
        if (pct) {
          ctx.font = 'bold 8px sans-serif'
          ctx.fillStyle = 'rgba(100,200,255,0.9)'
          ctx.fillText(pct, cx, midY + bandH / 2 + 12)
        }
      }

      if (fe) {
        ctx.font = 'bold 8px sans-serif'
        ctx.fillStyle = 'rgba(100,200,255,0.8)'
        ctx.fillText(fe.balance, cw / 2, midY + bandH / 2 + 26)
      }
      ctx.textAlign = 'left'
    }

    // 11. 顶部标题栏
    ctx.fillStyle = 'rgba(13,13,26,0.75)'
    this._roundRect(ctx, cw / 2 - 72, 6, 144, 22, 6)
    ctx.fill()
    ctx.strokeStyle = 'rgba(232,168,124,0.3)'
    ctx.lineWidth = 0.5
    this._roundRect(ctx, cw / 2 - 72, 6, 144, 22, 6)
    ctx.stroke()
    ctx.font = 'bold 10px sans-serif'
    ctx.fillStyle = '#e8a87c'
    ctx.textAlign = 'center'
    ctx.fillText('三庭五眼 · AI 精准标注', cw / 2, 21)
    ctx.textAlign = 'left'

    // 12. 底部数据来源标注（显示密集点数量）
    const totalPts = (mesh?.meshPoints?.length || 0) + (dense ? Object.values(dense).reduce((s, d) => s + (d.dense?.length || 0), 0) : 0)
    ctx.font = '7px sans-serif'
    ctx.fillStyle = 'rgba(255,255,255,0.3)'
    ctx.textAlign = 'center'
    if (totalPts > 500) {
      ctx.fillText(`基于${totalPts}个面部采集点 · Catmull-Rom样条加密`, cw / 2, ch - 6)
    } else {
      ctx.fillText('基于iCREDIT面部属性分析 · 三庭五眼精准测量', cw / 2, ch - 6)
    }
    ctx.textAlign = 'left'
  },

  _renderAnnotationFallback(ctx, report, cw, ch) {
    ctx.fillStyle = '#0d0d1a'
    ctx.fillRect(0, 0, cw, ch)
    ctx.font = 'bold 14px sans-serif'
    ctx.fillStyle = 'rgba(232,168,124,0.6)'
    ctx.textAlign = 'center'
    ctx.fillText('面部标注图', cw / 2, ch / 2)
    ctx.textAlign = 'left'
  },

  // ============ Canvas 2: 面部特征雷达图 ============
  drawRadarChart(bone) {
    const features = bone.faceFeatures || []
    if (features.length < 3) return

    wx.createSelectorQuery().select('#radarChart')
      .fields({ node: true, size: true }).exec((res) => {
        if (!res?.[0]?.node) return
        const canvas = res[0].node
        const ctx = canvas.getContext('2d')
        const dpr = wx.getWindowInfo().pixelRatio
        const cw = res[0].width
        const ch = res[0].height || cw

        canvas.width = cw * dpr
        canvas.height = ch * dpr
        ctx.scale(dpr, dpr)

        const cx = cw / 2
        const cy = ch / 2
        const maxR = Math.min(cw, ch) / 2 - 28
        const sides = features.length

        for (let layer = 1; layer <= 3; layer++) {
          const r = maxR * (layer / 3)
          ctx.beginPath()
          for (let i = 0; i < sides; i++) {
            const angle = (Math.PI * 2 / sides) * i - Math.PI / 2
            const x = cx + r * Math.cos(angle)
            const y = cy + r * Math.sin(angle)
            i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
          }
          ctx.closePath()
          ctx.strokeStyle = `rgba(232,168,124,${0.08 + layer * 0.04})`
          ctx.lineWidth = 0.5
          ctx.stroke()
        }

        for (let i = 0; i < sides; i++) {
          const angle = (Math.PI * 2 / sides) * i - Math.PI / 2
          ctx.beginPath()
          ctx.moveTo(cx, cy)
          ctx.lineTo(cx + maxR * Math.cos(angle), cy + maxR * Math.sin(angle))
          ctx.strokeStyle = 'rgba(232,168,124,0.1)'
          ctx.lineWidth = 0.5
          ctx.stroke()
        }

        ctx.beginPath()
        features.forEach((f, i) => {
          const score = Math.min(f.score || 5, 10)
          const r = maxR * (score / 10)
          const angle = (Math.PI * 2 / sides) * i - Math.PI / 2
          const x = cx + r * Math.cos(angle)
          const y = cy + r * Math.sin(angle)
          i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
        })
        ctx.closePath()

        const grd = ctx.createRadialGradient(cx, cy, 0, cx, cy, maxR)
        grd.addColorStop(0, 'rgba(232,168,124,0.15)')
        grd.addColorStop(1, 'rgba(232,168,124,0.05)')
        ctx.fillStyle = grd
        ctx.fill()
        ctx.strokeStyle = 'rgba(232,168,124,0.7)'
        ctx.lineWidth = 1.5
        ctx.stroke()

        features.forEach((f, i) => {
          const score = Math.min(f.score || 5, 10)
          const r = maxR * (score / 10)
          const angle = (Math.PI * 2 / sides) * i - Math.PI / 2
          const x = cx + r * Math.cos(angle)
          const y = cy + r * Math.sin(angle)

          ctx.beginPath()
          ctx.arc(x, y, 3, 0, Math.PI * 2)
          ctx.fillStyle = '#e8a87c'
          ctx.fill()

          const labelR = maxR + 18
          const lx = cx + labelR * Math.cos(angle)
          const ly = cy + labelR * Math.sin(angle)
          ctx.font = '9px sans-serif'
          ctx.textAlign = 'center'
          ctx.fillStyle = '#666'
          ctx.fillText(f.name, lx, ly + 3)
          ctx.font = 'bold 9px sans-serif'
          ctx.fillStyle = '#e8a87c'
          ctx.fillText(f.score, lx, ly + 14)
        })
        ctx.textAlign = 'left'
      })
  },

  // ============ Canvas 3: 色彩三维诊断 ============
  drawColorTriangle(skin, colorStyle) {
    if (!skin.brightness && !skin.purity) return

    wx.createSelectorQuery().select('#colorTriangle')
      .fields({ node: true, size: true }).exec((res) => {
        if (!res?.[0]?.node) return
        const canvas = res[0].node
        const ctx = canvas.getContext('2d')
        const dpr = wx.getWindowInfo().pixelRatio
        const cw = res[0].width
        const ch = res[0].height || cw * 0.8

        canvas.width = cw * dpr
        canvas.height = ch * dpr
        ctx.scale(dpr, dpr)

        const cx = cw / 2
        const cy = ch / 2 + 10
        const R = Math.min(cw, ch) / 2 - 24

        const points = [
          { x: cx, y: cy - R, label: '明度', sub: '高↕低', value: skin.brightness || 5, max: 10 },
          { x: cx - R * Math.cos(Math.PI / 6), y: cy + R * Math.sin(Math.PI / 6), label: '纯度', sub: '高↕低', value: skin.purity || 5, max: 10 },
          { x: cx + R * Math.cos(Math.PI / 6), y: cy + R * Math.sin(Math.PI / 6), label: '量感', sub: '大↕小', value: this._parseMass(colorStyle), max: 10 }
        ]

        ctx.beginPath()
        ctx.moveTo(points[0].x, points[0].y)
        ctx.lineTo(points[1].x, points[1].y)
        ctx.lineTo(points[2].x, points[2].y)
        ctx.closePath()
        ctx.fillStyle = 'rgba(232,168,124,0.03)'
        ctx.fill()
        ctx.strokeStyle = 'rgba(232,168,124,0.2)'
        ctx.lineWidth = 1
        ctx.stroke()

        for (let layer = 1; layer <= 3; layer++) {
          const t = layer / 4
          ctx.beginPath()
          const ip = points.map(p => ({
            x: cx + (p.x - cx) * t,
            y: cy + (p.y - cy) * t
          }))
          ctx.moveTo(ip[0].x, ip[0].y)
          ctx.lineTo(ip[1].x, ip[1].y)
          ctx.lineTo(ip[2].x, ip[2].y)
          ctx.closePath()
          ctx.strokeStyle = `rgba(232,168,124,${0.05 + layer * 0.03})`
          ctx.lineWidth = 0.5
          ctx.stroke()
        }

        const values = points.map(p => p.value / p.max)
        const total = values.reduce((a, b) => a + b, 0) || 1
        const ux = (points[0].x * values[0] + points[1].x * values[1] + points[2].x * values[2]) / total
        const uy = (points[0].y * values[0] + points[1].y * values[1] + points[2].y * values[2]) / total

        const dataPoints = points.map((p, i) => {
          const v = values[i]
          return {
            x: cx + (p.x - cx) * v,
            y: cy + (p.y - cy) * v
          }
        })
        ctx.beginPath()
        ctx.moveTo(dataPoints[0].x, dataPoints[0].y)
        ctx.lineTo(dataPoints[1].x, dataPoints[1].y)
        ctx.lineTo(dataPoints[2].x, dataPoints[2].y)
        ctx.closePath()
        const grd = ctx.createRadialGradient(ux, uy, 0, ux, uy, R * 0.5)
        grd.addColorStop(0, 'rgba(232,168,124,0.2)')
        grd.addColorStop(1, 'rgba(232,168,124,0.05)')
        ctx.fillStyle = grd
        ctx.fill()
        ctx.strokeStyle = 'rgba(232,168,124,0.6)'
        ctx.lineWidth = 1.5
        ctx.stroke()

        dataPoints.forEach((dp, i) => {
          ctx.beginPath()
          ctx.arc(dp.x, dp.y, 4, 0, Math.PI * 2)
          ctx.fillStyle = '#e8a87c'
          ctx.fill()
          ctx.beginPath()
          ctx.arc(dp.x, dp.y, 2, 0, Math.PI * 2)
          ctx.fillStyle = '#fff'
          ctx.fill()
        })

        ctx.beginPath()
        ctx.arc(ux, uy, 6, 0, Math.PI * 2)
        ctx.fillStyle = 'rgba(232,168,124,0.3)'
        ctx.fill()
        ctx.beginPath()
        ctx.arc(ux, uy, 3, 0, Math.PI * 2)
        ctx.fillStyle = '#e8a87c'
        ctx.fill()

        points.forEach((p, i) => {
          const labelR = R + 18
          const lx = cx + (p.x - cx) / R * labelR
          const ly = cy + (p.y - cy) / R * labelR

          ctx.textAlign = 'center'
          ctx.font = 'bold 10px sans-serif'
          ctx.fillStyle = '#1a1a2e'
          ctx.fillText(p.label, lx, ly - 2)
          ctx.font = '8px sans-serif'
          ctx.fillStyle = '#e8a87c'
          ctx.fillText(`${p.value}/${p.max}`, lx, ly + 10)
        })
        ctx.textAlign = 'left'
      })
  },

  _parseMass(colorStyle) {
    if (colorStyle.mass) return Math.min(10, Math.max(1, Number(colorStyle.mass)))
    const mass = colorStyle.styleFeatures?.mass || ''
    if (mass.includes('大')) return 8
    if (mass.includes('小')) return 3
    return 5
  },

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

  _loadPosters(report) {
    // 为每个模块生成Seedream杂志风海报
    const modules = ['bone', 'skin', 'colorStyle', 'outfit']
    modules.forEach(mod => {
      request(API.generatePoster, {
        method: 'POST',
        data: { module: mod, reportData: report },
        timeout: 60000
      }).then(res => {
        if (res.code === 0 && res.data) {
          const imageUrl = res.data.imageUrl
          if (imageUrl) {
            const posters = this.data.posters
            posters[mod] = imageUrl
            this.setData({ posters })
          }
        }
      }).catch(err => {
        console.warn(`[report] 海报生成失败(${mod}):`, err.message || err)
      })
    })
  },

  _extractBoneFromLegacy(report) {
    if (!report.faceShape) return {}
    return {
      title: '骨相分析',
      faceType: report.faceShape.type,
      faceScore: report.faceShape.score,
      boneType: report.faceShape.boneType || '待分析',
      boneDesc: report.faceShape.boneDesc || '',
      threeCourts: report.faceShape.threeCourts || {},
      fiveEyes: report.faceShape.fiveEyes || {},
      faceFeatures: report.faceShape.faceFeatures || [],
      suitableHaircuts: report.faceShape.suitableHaircuts || [],
      avoidHaircuts: report.faceShape.avoidHaircuts || [],
      suitableCollars: report.faceShape.suitableCollars || [],
      keyInsight: report.faceShape.keyInsight || ''
    }
  },

  _extractSkinFromLegacy(report) {
    if (!report.skinColor) return {}
    const sc = report.skinColor
    return {
      title: '皮肤状态', skinType: sc.type, brightness: sc.brightness, purity: sc.purity,
      overallDesc: sc.seasonDetail || '', problems: sc.problems || [], season: sc.season,
      seasonDetail: sc.seasonDetail || '', goodColors: sc.goodColors || [], badColors: sc.badColors || [],
      goodHairColors: sc.goodHairColors || [], badHairColors: sc.badHairColors || [],
      skincareAdvice: sc.skincareAdvice || [], keyInsight: sc.keyInsight || ''
    }
  },

  _extractColorFromLegacy(report) {
    if (!report.style) return {}
    const st = report.style
    return {
      title: '色彩风格', mainStyle: st.mainStyle, mainScore: st.mainScore,
      styleDesc: st.styleDesc || '', subStyles: st.subStyles || [],
      styleFeatures: st.features || {}, colorPalette: st.colorPalette || {},
      clothingAdvice: st.clothingAdvice || {}, sceneAdvice: st.sceneAdvice || [],
      outfitItems: (report.outfitItems || {}).recommended || [],
      avoidItems: (report.outfitItems || {}).avoidItems || [], keyInsight: st.keyInsight || ''
    }
  },

  _extractOutfitFromLegacy(report) {
    return {
      title: '穿搭风格',
      hairRecommend: report.hairRecommend || { top3: [], alternatives: [], hairColors: [], avoidHair: [] },
      makeup: report.makeup || { style: '待分析', foundation: {}, eyeBrow: {}, lipRecommend: {}, avoidMakeup: [] },
      bodyShape: report.bodyShape || { shoulderType: '待分析', bodyRatio: '待分析', suitableTop: [], suitableBottom: [], avoidStyles: [], tips: [] },
      summary: report.summary || { coreConclusion: '', priorityAdvice: '', dailyTips: [] },
      keyInsight: (report.summary || {}).coreConclusion || ''
    }
  },

  onShareAppMessage() {
    const report = this.data.report
    return {
      title: `我的AI形象评分 ${report?.basic?.overallScore || ''}分 — 搭搭`,
      path: '/pages/index/index'
    }
  },

  // 预览可视化图片
  onPreviewImage(e) {
    const url = e.currentTarget.dataset.url
    if (!url) return
    wx.previewImage({
      current: url,
      urls: [url]
    })
  },

  // 打开PDF报告
  onOpenReport(e) {
    const url = e.currentTarget.dataset.url
    if (!url) return
    wx.showModal({
      title: '查看完整报告',
      content: '即将打开可视化PDF诊断报告',
      confirmText: '打开',
      success: (res) => {
        if (res.confirm) {
          wx.openDocument({
            filePath: url,
            fail: () => {
              // 如果不是本地文件，用 webview 打开
              wx.navigateTo({
                url: `/pages/webview/webview?url=${encodeURIComponent(url)}`,
                fail: () => {
                  wx.setClipboardData({
                    data: url,
                    success: () => wx.showToast({ title: '链接已复制', icon: 'success' })
                  })
                }
              })
            }
          })
        }
      }
    })
  },

  onReDiagnose() {
    wx.redirectTo({ url: '/pages/diagnose/diagnose' })
  }
})
