// pages/report/report.js
// 新架构：数据驱动报告，前端渲染雷达图/色块/比例条

const { request, API } = require('../../utils/api')
const { calcPercentile } = require('../../utils/format')

// ============ 关键词 → CDN 配图 映射表 ============
// 思路：根据报告里的实际描述文案选图，让图与文字相关。
// 工具函数：在 text 中按顺序找第一个命中的关键词
function pickByKeyword(text, mapping, fallback) {
  if (!text) return fallback || ''
  const t = String(text)
  for (const kw of Object.keys(mapping)) {
    if (t.indexOf(kw) !== -1) return mapping[kw]
  }
  return fallback || ''
}

// 发型 imageKey → 本地图片（AI 直接返回 key，最准确）
const HAIR_KEY_IMG = {
  long_straight: '/images/refs/hair_long_straight.jpg',
  long_curly: '/images/refs/hair_long_curly.jpg',
  wave: '/images/refs/hair_wave.jpg',
  wool_curl: '/images/refs/hair_wool_curl.jpg',
  collarbone: '/images/refs/hair_collarbone.jpg',
  short_curly: '/images/refs/hair_short_curly.jpg',
  bob: '/images/refs/hair_bob.jpg',
  ponytail: '/images/refs/hair_ponytail.jpg',
  bun: '/images/refs/hair_bun.jpg'
}

// 发型：本地图片资源（按 length + name 关键词匹配）
// 注意：Object.keys 遵循插入顺序，把更具体的关键词放前面（如「羊毛卷」在「卷」之前）
const HAIR_STYLE_IMG = {
  // 具体造型词（最优先匹配）
  '羊毛卷': '/images/refs/hair_wool_curl.jpg',
  '泡面卷': '/images/refs/hair_wool_curl.jpg',
  '法式慵懒卷': '/images/refs/hair_long_curly.jpg',
  '法式': '/images/refs/hair_long_curly.jpg',
  '梨花': '/images/refs/hair_long_curly.jpg',
  '锁骨': '/images/refs/hair_collarbone.jpg',
  '齐肩': '/images/refs/hair_collarbone.jpg',
  '中长': '/images/refs/hair_collarbone.jpg',
  '波波': '/images/refs/hair_bob.jpg',
  'BOB': '/images/refs/hair_bob.jpg',
  'bob': '/images/refs/hair_bob.jpg',
  '蛋卷': '/images/refs/hair_short_curly.jpg',
  '内扣': '/images/refs/hair_bob.jpg',
  '丸子': '/images/refs/hair_bun.jpg',
  '盘发': '/images/refs/hair_bun.jpg',
  '低盘': '/images/refs/hair_bun.jpg',
  '马尾': '/images/refs/hair_ponytail.jpg',
  '低马尾': '/images/refs/hair_ponytail.jpg',
  '高马尾': '/images/refs/hair_ponytail.jpg',
  '大波浪': '/images/refs/hair_wave.jpg',
  '波浪': '/images/refs/hair_wave.jpg',
  // 长度+造型组合
  '长卷': '/images/refs/hair_long_curly.jpg',
  '短卷': '/images/refs/hair_short_curly.jpg',
  '长直': '/images/refs/hair_long_straight.jpg',
  '直发': '/images/refs/hair_long_straight.jpg',
  '中分': '/images/refs/hair_long_straight.jpg',
  '齐耳': '/images/refs/hair_bob.jpg',
  '齐刘海': '/images/refs/hair_bob.jpg',
  // 通用
  '慵懒卷': '/images/refs/hair_long_curly.jpg',
  '卷发': '/images/refs/hair_long_curly.jpg',
  '烫发': '/images/refs/hair_long_curly.jpg',
  '卷': '/images/refs/hair_long_curly.jpg',
  '直': '/images/refs/hair_long_straight.jpg'
}
const HAIR_IMG = {
  '长': '/images/refs/hair_long_straight.jpg',
  '中': '/images/refs/hair_collarbone.jpg',
  '短': '/images/refs/hair_bob.jpg'
}
const HAIR_FALLBACK = '/images/refs/hair_collarbone.jpg'

// 粉底/底妆：按妆容浓度（淡妆 / 浓重）
// AI 返回的 makeup.style 一般是"清透氧气妆/淡颜系/裸妆/水光妆"或"高级感哑光妆/欧美浓妆/烟熏妆"
const FOUNDATION_IMG = {
  // 浓妆关键词（优先匹配）
  '哑光': '/images/refs/makeup_heavy.jpg',
  '浓': '/images/refs/makeup_heavy.jpg',
  '欧美': '/images/refs/makeup_heavy.jpg',
  '烟熏': '/images/refs/makeup_heavy.jpg',
  '复古': '/images/refs/makeup_heavy.jpg',
  '高级感': '/images/refs/makeup_heavy.jpg',
  '雾面': '/images/refs/makeup_heavy.jpg',
  // 淡妆关键词
  '清透': '/images/refs/makeup_light.jpg',
  '氧气': '/images/refs/makeup_light.jpg',
  '裸妆': '/images/refs/makeup_light.jpg',
  '淡颜': '/images/refs/makeup_light.jpg',
  '水光': '/images/refs/makeup_light.jpg',
  '日系': '/images/refs/makeup_light.jpg',
  '韩系': '/images/refs/makeup_light.jpg',
  '韩式': '/images/refs/makeup_light.jpg',
  '通勤': '/images/refs/makeup_light.jpg',
  '元气': '/images/refs/makeup_light.jpg',
  // 默认
  '淡': '/images/refs/makeup_light.jpg'
}

// 眉眼：眉笔（眉形描述） vs 眼影（眼妆描述），有眼影描述就用眼影，否则用眉笔
const EYE_IMG = {
  '烟熏': '/images/refs/makeup_eyeshadow.jpg',
  '眼影': '/images/refs/makeup_eyeshadow.jpg',
  '大地色': '/images/refs/makeup_eyeshadow.jpg',
  '珠光': '/images/refs/makeup_eyeshadow.jpg',
  '哑光': '/images/refs/makeup_eyeshadow.jpg',
  '咖啡': '/images/refs/makeup_eyeshadow.jpg',
  '棕': '/images/refs/makeup_eyeshadow.jpg'
}
const EYE_FALLBACK = '/images/refs/makeup_eyebrow.jpg'

// 唇妆：固定用口红图（色号文字已在卡片描述里写了，图片是产品本身即可）
const LIP_FALLBACK = '/images/refs/makeup_lipstick.jpg'

// 腮红
const BLUSH_FALLBACK = '/images/refs/makeup_blush.jpg'

// 版型 silhouette
const SILHOUETTE_IMG = {
  'X': 'https://images.unsplash.com/photo-1490481651871-ab68de25d43d?w=200&h=200&fit=crop&q=70',
  'A字': 'https://images.unsplash.com/photo-1496747611176-843222e1e57c?w=200&h=200&fit=crop&q=70',
  'A型': 'https://images.unsplash.com/photo-1496747611176-843222e1e57c?w=200&h=200&fit=crop&q=70',
  'H': 'https://images.unsplash.com/photo-1483985988355-763728e1935b?w=200&h=200&fit=crop&q=70',
  '直筒': 'https://images.unsplash.com/photo-1483985988355-763728e1935b?w=200&h=200&fit=crop&q=70',
  '收腰': 'https://images.unsplash.com/photo-1490481651871-ab68de25d43d?w=200&h=200&fit=crop&q=70',
  '修身': 'https://images.unsplash.com/photo-1490481651871-ab68de25d43d?w=200&h=200&fit=crop&q=70',
  '宽松': 'https://images.unsplash.com/photo-1490578474895-699cd4e2cf59?w=200&h=200&fit=crop&q=70',
  'oversize': 'https://images.unsplash.com/photo-1490578474895-699cd4e2cf59?w=200&h=200&fit=crop&q=70'
}
const SILHOUETTE_FALLBACK = 'https://images.unsplash.com/photo-1483985988355-763728e1935b?w=200&h=200&fit=crop&q=70'

// 材质 material
const MATERIAL_IMG = {
  '丝': 'https://images.unsplash.com/photo-1551803091-e20673f15770?w=200&h=200&fit=crop&q=70',
  '雪纺': 'https://images.unsplash.com/photo-1551803091-e20673f15770?w=200&h=200&fit=crop&q=70',
  '羊毛': 'https://images.unsplash.com/photo-1576566588028-4147f3842f27?w=200&h=200&fit=crop&q=70',
  '羊绒': 'https://images.unsplash.com/photo-1576566588028-4147f3842f27?w=200&h=200&fit=crop&q=70',
  '针织': 'https://images.unsplash.com/photo-1576566588028-4147f3842f27?w=200&h=200&fit=crop&q=70',
  '棉': 'https://images.unsplash.com/photo-1558769132-cb1aea458c5e?w=200&h=200&fit=crop&q=70',
  '亚麻': 'https://images.unsplash.com/photo-1558769132-cb1aea458c5e?w=200&h=200&fit=crop&q=70',
  '皮': 'https://images.unsplash.com/photo-1591047139829-d91aecb6caea?w=200&h=200&fit=crop&q=70',
  '蕾丝': 'https://images.unsplash.com/photo-1551803091-e20673f15770?w=200&h=200&fit=crop&q=70',
  '牛仔': 'https://images.unsplash.com/photo-1542272604-787c3835535d?w=200&h=200&fit=crop&q=70'
}
const MATERIAL_FALLBACK = 'https://images.unsplash.com/photo-1558769132-cb1aea458c5e?w=200&h=200&fit=crop&q=70'

// 图案 pattern
const PATTERN_IMG = {
  '碎花': 'https://images.unsplash.com/photo-1496747611176-843222e1e57c?w=200&h=200&fit=crop&q=70',
  '花': 'https://images.unsplash.com/photo-1496747611176-843222e1e57c?w=200&h=200&fit=crop&q=70',
  '条纹': 'https://images.unsplash.com/photo-1490481651871-ab68de25d43d?w=200&h=200&fit=crop&q=70',
  '波点': 'https://images.unsplash.com/photo-1490481651871-ab68de25d43d?w=200&h=200&fit=crop&q=70',
  '格': 'https://images.unsplash.com/photo-1542272604-787c3835535d?w=200&h=200&fit=crop&q=70',
  '纯色': 'https://images.unsplash.com/photo-1483985988355-763728e1935b?w=200&h=200&fit=crop&q=70',
  '几何': 'https://images.unsplash.com/photo-1490481651871-ab68de25d43d?w=200&h=200&fit=crop&q=70'
}
const PATTERN_FALLBACK = 'https://images.unsplash.com/photo-1490481651871-ab68de25d43d?w=200&h=200&fit=crop&q=70'

// 蜕变路线（按月主题关键词）
const ROADMAP_IMG = {
  '护肤': 'https://images.unsplash.com/photo-1556228720-195a672e8a03?w=160&h=160&fit=crop&q=70',
  '皮肤': 'https://images.unsplash.com/photo-1556228720-195a672e8a03?w=160&h=160&fit=crop&q=70',
  '运动': 'https://images.unsplash.com/photo-1518611012118-696072aa579a?w=160&h=160&fit=crop&q=70',
  '健身': 'https://images.unsplash.com/photo-1518611012118-696072aa579a?w=160&h=160&fit=crop&q=70',
  '体态': 'https://images.unsplash.com/photo-1518611012118-696072aa579a?w=160&h=160&fit=crop&q=70',
  '减脂': 'https://images.unsplash.com/photo-1518611012118-696072aa579a?w=160&h=160&fit=crop&q=70',
  '发型': 'https://images.unsplash.com/photo-1492106087820-71f1a00d2b11?w=160&h=160&fit=crop&q=70',
  '妆容': 'https://images.unsplash.com/photo-1503236823255-94609f598e71?w=160&h=160&fit=crop&q=70',
  '穿搭': 'https://images.unsplash.com/photo-1483985988355-763728e1935b?w=160&h=160&fit=crop&q=70',
  '风格': 'https://images.unsplash.com/photo-1483985988355-763728e1935b?w=160&h=160&fit=crop&q=70',
  '气质': 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=160&h=160&fit=crop&q=70'
}
const ROADMAP_FALLBACK = [
  'https://images.unsplash.com/photo-1556228720-195a672e8a03?w=160&h=160&fit=crop&q=70',
  'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=160&h=160&fit=crop&q=70',
  'https://images.unsplash.com/photo-1483985988355-763728e1935b?w=160&h=160&fit=crop&q=70'
]

// 根据 report 数据构建配图 URL（与文案关联）
function buildCdnImages(report) {
  const m = (report && report.modules) || {}
  const hairTop = (m.hairmakeup && m.hairmakeup.hairRecommend && m.hairmakeup.hairRecommend.top3) || []
  const makeup = (m.hairmakeup && m.hairmakeup.makeup) || {}
  const advice = (m.style && m.style.clothingAdvice) || {}
  const roadmap = (m.optimize && m.optimize.roadmap3m) || {}

  return {
    hair: hairTop.map(h => {
      // 优先用 AI 返回的 imageKey（最准确）
      if (h.imageKey && HAIR_KEY_IMG[h.imageKey]) return HAIR_KEY_IMG[h.imageKey]
      // 退回关键词匹配（兼容老报告 / AI 没返回 imageKey 的情况）
      const txt = (h.name || '') + ' ' +
                  (h.length || '') + ' ' +
                  (h.layers || '') + ' ' +
                  (h.bangs || '') + ' ' +
                  (h.style || '') + ' ' +
                  (h.reason || '')
      return pickByKeyword(txt, HAIR_STYLE_IMG, '') ||
             pickByKeyword(h.length || h.name, HAIR_IMG, HAIR_FALLBACK)
    }),
    makeup: {
      foundation: pickByKeyword(
        // 用整体妆容风格 + 粉底色号文案，识别淡/浓
        (makeup.style || '') + ' ' +
        ((makeup.foundation || {}).tone || '') + ' ' +
        ((makeup.foundation || {}).shade || ''),
        FOUNDATION_IMG, '/images/refs/makeup_light.jpg'
      ),
      eyeBrow: pickByKeyword(
        ((makeup.eyeBrow || {}).shape || '') + ' ' +
        ((makeup.eyeBrow || {}).shadow || '') + ' ' +
        ((makeup.eyeBrow || {}).eyeliner || ''),
        EYE_IMG, EYE_FALLBACK
      ),
      // 唇妆固定用口红图（色号在文案里说清楚就够了）
      lipRecommend: LIP_FALLBACK,
      // 腮红固定用腮红图
      blush: BLUSH_FALLBACK
    },
    advice: {
      silhouette: pickByKeyword(advice.silhouette, SILHOUETTE_IMG, SILHOUETTE_FALLBACK),
      material: pickByKeyword(advice.material, MATERIAL_IMG, MATERIAL_FALLBACK),
      pattern: pickByKeyword(advice.pattern, PATTERN_IMG, PATTERN_FALLBACK)
    },
    roadmap: [
      pickByKeyword(roadmap.month1, ROADMAP_IMG, ROADMAP_FALLBACK[0]),
      pickByKeyword(roadmap.month2, ROADMAP_IMG, ROADMAP_FALLBACK[1]),
      pickByKeyword(roadmap.month3, ROADMAP_IMG, ROADMAP_FALLBACK[2])
    ]
  }
}

Page({
  data: {
    report: null,
    activeTab: 'dna',
    tabKeys: ['optimize', 'hairmakeup', 'dna', 'style', 'celebrity'],
    tabLabels: { dna: '面部&骨相', style: '皮肤&风格', hairmakeup: '发型&妆容', optimize: '颜值&蜕变', celebrity: '明星相似' },
    shared: false,
    // Canvas 雷达图
    radarCanvasId: '',
    // CDN 配图：根据报告数据动态构建（onLoad 时填充）
    cdnImages: { hair: [], makeup: {}, advice: {}, roadmap: [] }
  },

  // 配图加载失败：将该 URL 置空，模板里 wx:if 会自动隐藏
  onCdnImgError(e) {
    const { key, idx, sub } = e.currentTarget.dataset
    const cdnImages = this.data.cdnImages
    if (sub) {
      cdnImages[key][sub] = ''
    } else if (idx !== undefined && idx !== '') {
      cdnImages[key][idx] = ''
    } else {
      cdnImages[key] = ''
    }
    this.setData({ cdnImages })
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

    // 老报告兜底补算颜值百分位
    if (report.basic && (report.basic.percentile == null || isNaN(report.basic.percentile))) {
      report.basic.percentile = calcPercentile(report.basic.overallScore)
    }

    this.setData({
      report,
      activeTab: this.getInitialTab(id),
      scoreRotation: Math.round((report.basic.overallScore / 10) * 360),
      cdnImages: buildCdnImages(report)
    })
    setTimeout(() => this.drawRadarChart(), 300)
  },

  // 首次进入默认 dna，再次进入恢复用户最近停留的 tab（按报告 id 维度记录）
  getInitialTab(id) {
    const validTabs = this.data.tabKeys
    try {
      const map = wx.getStorageSync('reportLastTab') || {}
      const last = id && map[id]
      if (last && validTabs.indexOf(last) >= 0) return last
    } catch (e) {}
    return 'dna'
  },

  onTabTap(e) {
    const tab = e.currentTarget.dataset.tab
    this.setData({ activeTab: tab })
    // 持久化用户最近停留的 tab
    try {
      const report = this.data.report
      if (report && report.id) {
        const map = wx.getStorageSync('reportLastTab') || {}
        map[report.id] = tab
        wx.setStorageSync('reportLastTab', map)
      }
    } catch (e) {}
    // 切换Tab后重绘雷达图
    setTimeout(() => this.drawRadarChart(), 100)
  },

  // 头像加载失败时：先尝试退到服务器URL，再失败则清空显示占位符
  onAvatarError() {
    const report = this.data.report
    if (!report) return
    if (report.photoUrlRemote && report.photoUrl !== report.photoUrlRemote) {
      console.warn('[report] 本地图加载失败，回退服务器URL')
      report.photoUrl = report.photoUrlRemote
    } else {
      report.photoUrl = ''
    }
    this.setData({ report })
  },

  // 明星头像加载失败：清空 imageUrl 改用首字母占位
  onCelebImgError(e) {
    const ci = e.currentTarget.dataset.ci
    const report = this.data.report
    if (!report || !report.modules || !report.modules.celebrity) return
    const list = report.modules.celebrity.top5 || []
    if (list[ci]) {
      list[ci].imageUrl = ''
      this.setData({ [`report.modules.celebrity.top5[${ci}].imageUrl`]: '' })
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
    this._drawRadar(ctx, w, h, labels, scores, '#D4B87A', '骨相评分')
  },

  // 风格雷达图
  drawStyleRadar(ctx, w, h, data) {
    if (!data) return
    const labels = ['明度', '纯度', '量感', '冷暖', '饱和度']
    const warmCool = data.skinType === '暖皮' ? 8 : data.skinType === '冷皮' ? 3 : 5
    const scores = [data.brightness || 5, data.purity || 5, data.mass || 5, warmCool, 6]
    this._drawRadar(ctx, w, h, labels, scores, '#6BA3D6', '风格属性')
  },

  // 发型雷达图
  drawHairMakeupRadar(ctx, w, h, data) {
    if (!data?.hairRecommend?.top3) return
    const top3 = data.hairRecommend.top3
    const labels = ['修饰脸型', '显高显瘦', '打理难度', '时尚度', '气质匹配']
    const scores = top3.length > 0
      ? [top3[0].score || 7, 6, 5, 7, top3[0].score || 7]
      : [5, 5, 5, 5, 5]
    this._drawRadar(ctx, w, h, labels, scores, '#E85C5C', '发型适配')
  },

  // 蜕变雷达图
  drawOptimizeRadar(ctx, w, h, data) {
    if (!data?.optimizablePoints) return
    const labels = ['五官协调', '皮肤状态', '发型适配', '妆容加分', '整体气质']
    const scores = [7, 6, 5, 6, 6]
    this._drawRadar(ctx, w, h, labels, scores, '#F0B8D0', '蜕变潜力')
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

        // === 背景：奶油米色 ===
        ctx.fillStyle = '#FFF8F3'
        ctx.fillRect(0, 0, w, h)

        // === 顶部玫瑰金渐变头图 ===
        const headerH = 92
        const grad = ctx.createLinearGradient(0, 0, w, headerH)
        grad.addColorStop(0, '#B76E79')
        grad.addColorStop(0.5, '#C38D9E')
        grad.addColorStop(1, '#E8A87C')
        ctx.fillStyle = grad
        ctx.fillRect(0, 0, w, headerH)

        // 装饰圆点
        ctx.fillStyle = 'rgba(255,255,255,0.15)'
        ctx.beginPath(); ctx.arc(w - 30, 25, 28, 0, Math.PI * 2); ctx.fill()
        ctx.beginPath(); ctx.arc(28, headerH - 18, 20, 0, Math.PI * 2); ctx.fill()

        // 标题
        ctx.fillStyle = '#fff'
        ctx.font = 'bold 20px sans-serif'
        ctx.textAlign = 'center'
        ctx.fillText('✦ 形象风格诊断报告', w / 2, 44)

        ctx.font = '11px sans-serif'
        ctx.fillStyle = 'rgba(255,255,255,0.85)'
        const now = new Date()
        const dateStr = `${now.getFullYear()}.${String(now.getMonth() + 1).padStart(2, '0')}.${String(now.getDate()).padStart(2, '0')}  ·  美哒 Meeta`
        ctx.fillText(dateStr, w / 2, 66)

        // === 评分卡片（悬浮于头图与内容之间）===
        const scoreCardY = headerH - 26
        const scoreCardH = 110
        ctx.shadowColor = 'rgba(183,110,121,0.18)'
        ctx.shadowBlur = 12
        ctx.shadowOffsetY = 4
        ctx.fillStyle = '#fff'
        this._roundRect(ctx, p, scoreCardY, cw, scoreCardH, 14)
        ctx.fill()
        ctx.shadowColor = 'transparent'
        ctx.shadowBlur = 0
        ctx.shadowOffsetY = 0

        // 头像
        const avatarR = 28
        const avatarCX = p + 16 + avatarR
        const avatarCY = scoreCardY + 22 + avatarR

        ctx.save()
        ctx.beginPath()
        ctx.arc(avatarCX, avatarCY, avatarR + 2, 0, Math.PI * 2)
        const avatarRing = ctx.createLinearGradient(avatarCX - avatarR, avatarCY - avatarR, avatarCX + avatarR, avatarCY + avatarR)
        avatarRing.addColorStop(0, '#B76E79')
        avatarRing.addColorStop(1, '#E8A87C')
        ctx.fillStyle = avatarRing
        ctx.fill()
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
            ctx.font = 'bold 14px sans-serif'
            ctx.textAlign = 'center'
            ctx.fillText('Me', avatarCX, avatarCY + 5)
          }
        } else {
          ctx.fillStyle = '#fff'
          ctx.font = 'bold 14px sans-serif'
          ctx.textAlign = 'center'
          ctx.fillText('Me', avatarCX, avatarCY + 5)
        }

        // 分数 + /10
        const scoreX = avatarCX + avatarR + 18
        const scoreBaseY = avatarCY - 4
        ctx.textAlign = 'left'
        ctx.font = 'bold 36px sans-serif'
        const scoreGrad = ctx.createLinearGradient(scoreX, scoreBaseY - 20, scoreX, scoreBaseY + 10)
        scoreGrad.addColorStop(0, '#B76E79')
        scoreGrad.addColorStop(1, '#8B4F58')
        ctx.fillStyle = scoreGrad
        ctx.fillText(String(report.basic.overallScore), scoreX, scoreBaseY + 8)

        const scoreW = ctx.measureText(String(report.basic.overallScore)).width
        ctx.font = '13px sans-serif'
        ctx.fillStyle = '#B89E8F'
        ctx.fillText('/10', scoreX + scoreW + 4, scoreBaseY + 8)

        // 视龄徽章（右上角）
        const ageTag = (report.basic.tags || []).find(t => t && t.indexOf('视龄') === 0) ||
          ((report.basic.tags || [])[(report.basic.tags || []).length - 1])
        if (ageTag) {
          let ageText = String(ageTag)
          while (ageText.indexOf('视龄') === 0) {
            ageText = ageText.substring(2)
            if (ageText.charAt(0) === '·') ageText = ageText.substring(1)
          }
          ageText = '✦ 视龄·' + ageText
          ctx.font = 'bold 11px sans-serif'
          const ageW = ctx.measureText(ageText).width + 18
          const ageX = w - p - 12 - ageW
          const ageY = scoreCardY + 18
          const ageGrad = ctx.createLinearGradient(ageX, ageY, ageX + ageW, ageY + 22)
          ageGrad.addColorStop(0, '#FFD86F')
          ageGrad.addColorStop(0.5, '#E8A87C')
          ageGrad.addColorStop(1, '#C38D9E')
          ctx.fillStyle = ageGrad
          this._roundRect(ctx, ageX, ageY, ageW, 22, 11)
          ctx.fill()
          ctx.fillStyle = '#fff'
          ctx.textAlign = 'center'
          ctx.fillText(ageText, ageX + ageW / 2, ageY + 15)
        }

        // 标签（除视龄外的 4 个）
        const otherTags = (report.basic.tags || []).filter((t, i, arr) => {
          if (!t) return false
          if (t.indexOf('视龄') === 0) return false
          if (i === arr.length - 1) return false
          return true
        }).slice(0, 4)
        if (otherTags.length) {
          const tagsY = scoreCardY + scoreCardH - 30
          ctx.font = 'bold 10px sans-serif'
          // 计算总宽度做水平铺开
          const tagWs = otherTags.map(t => ctx.measureText(t).width + 18)
          const totalTagW = tagWs.reduce((a, b) => a + b, 0)
          const gap = otherTags.length > 1 ? (cw - 32 - totalTagW) / (otherTags.length - 1) : 0
          let tagX = p + 16
          otherTags.forEach((tag, i) => {
            const tw = tagWs[i]
            // 浅粉渐变背景
            const tg = ctx.createLinearGradient(tagX, tagsY, tagX + tw, tagsY + 18)
            tg.addColorStop(0, '#FFF3E0')
            tg.addColorStop(1, '#FFE4EC')
            ctx.fillStyle = tg
            this._roundRect(ctx, tagX, tagsY, tw, 18, 9)
            ctx.fill()
            ctx.fillStyle = '#E58FA1'
            ctx.textAlign = 'center'
            ctx.fillText(tag, tagX + tw / 2, tagsY + 12)
            tagX += tw + gap
          })
        }

        // === 顶部总结模块（核心结论）===
        let y = scoreCardY + scoreCardH + 16
        const conclusion = report.modules.optimize?.coreConclusion
        if (conclusion) {
          ctx.font = '11px sans-serif'
          const conLines = this._wrapText(ctx, conclusion, cw - 32, 4)
          const conH = 20 + 18 + conLines.length * 16 + 14

          // 渐变背景
          const sumGrad = ctx.createLinearGradient(p, y, p + cw, y + conH)
          sumGrad.addColorStop(0, '#FFF3E0')
          sumGrad.addColorStop(1, '#FFE4EC')
          ctx.fillStyle = sumGrad
          this._roundRect(ctx, p, y, cw, conH, 12)
          ctx.fill()

          // 边框
          ctx.strokeStyle = 'rgba(183,110,121,0.18)'
          ctx.lineWidth = 1
          this._roundRect(ctx, p, y, cw, conH, 12)
          ctx.stroke()

          // 标题
          ctx.font = 'bold 12px sans-serif'
          ctx.fillStyle = '#B76E79'
          ctx.textAlign = 'left'
          ctx.fillText('✦ 核心结论', p + 14, y + 20)

          // 内容
          ctx.font = '11px sans-serif'
          ctx.fillStyle = '#6B5550'
          conLines.forEach((line, i) => {
            ctx.fillText(line, p + 14, y + 42 + i * 16)
          })
          y += conH + 12
        }

        // === 模块卡片 ===
        const sections = [
          {
            title: '🧬 面部&骨相', color: '#B76E79',
            show: !!report.modules.dna,
            lines: () => {
              const d = report.modules.dna
              const l = [`${d.faceType || ''} · ${d.boneType || ''}`]
              if (d.keyInsight) l.push('✦ ' + d.keyInsight)
              return l
            }
          },
          {
            title: '🎨 皮肤&风格', color: '#C38D9E',
            show: !!report.modules.style,
            lines: () => {
              const d = report.modules.style
              const l = [`${d.skinType || ''} · ${d.season || ''} · ${d.mainStyle || ''}`]
              if (d.keyInsight) l.push('✦ ' + d.keyInsight)
              return l
            }
          },
          {
            title: '✂️ 发型&妆容', color: '#E8A87C',
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
            title: '🌟 颜值&蜕变', color: '#D4A574',
            show: !!report.modules.optimize,
            lines: () => {
              const d = report.modules.optimize
              const l = []
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
            ctx.font = '10.5px sans-serif'
            textLines.push(...this._wrapText(ctx, line, cw - 28, 3))
          })
          const cardH = 16 + 18 + textLines.length * 16 + 10

          // 卡片白色背景
          ctx.fillStyle = '#fff'
          this._roundRect(ctx, p, y, cw, cardH, 12)
          ctx.fill()

          // 左侧色条
          ctx.fillStyle = sec.color
          this._roundRect(ctx, p, y, 4, cardH, 2)
          ctx.fill()

          // 标题
          ctx.font = 'bold 12px sans-serif'
          ctx.fillStyle = '#3D2C28'
          ctx.textAlign = 'left'
          ctx.fillText(sec.title, p + 14, y + 20)

          // 内容
          ctx.font = '10.5px sans-serif'
          let lineY = y + 38
          textLines.forEach(line => {
            ctx.fillStyle = line.startsWith('✦') ? '#B89E8F' : '#5C4A45'
            ctx.fillText(line, p + 14, lineY)
            lineY += 16
          })

          y += cardH + 10
        })

        // === 底部水印（紧跟内容后）===
        const footerH = 56
        const footerY = Math.min(y + 4, h - footerH - 16)
        const fGrad = ctx.createLinearGradient(p, footerY, p + cw, footerY + footerH)
        fGrad.addColorStop(0, '#B76E79')
        fGrad.addColorStop(1, '#E8A87C')
        ctx.fillStyle = fGrad
        this._roundRect(ctx, p, footerY, cw, footerH, 12)
        ctx.fill()

        ctx.font = 'bold 15px sans-serif'
        ctx.fillStyle = '#fff'
        ctx.textAlign = 'center'
        ctx.fillText('美哒 Meeta', w / 2, footerY + 24)

        ctx.font = '10px sans-serif'
        ctx.fillStyle = 'rgba(255,255,255,0.85)'
        ctx.fillText('AI 反种草形象风格诊断', w / 2, footerY + 42)

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
