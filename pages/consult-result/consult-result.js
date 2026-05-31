// pages/consult-result/consult-result.js
const { request, API } = require('../../utils/api')
const ALL_PRODUCTS = [
  { id: 'p1', image: '/images/穿搭推荐/丝绸白色连衣裙.jpg', name: '丝绸白色连衣裙', tag: '气质优雅·百搭单品', price: '298' },
  { id: 'p2', image: '/images/穿搭推荐/天蓝色连衣裙.jpg', name: '天蓝色连衣裙', tag: '清新活力·显白必备', price: '228' },
  { id: 'p3', image: '/images/穿搭推荐/白色通勤连衣裙.jpg', name: '白色通勤连衣裙', tag: '职场精英·干练有型', price: '268' },
  { id: 'p4', image: '/images/穿搭推荐/粉白约会套装.jpg', name: '粉白约会套装', tag: '甜美约会·少女感十足', price: '388' },
  { id: 'p5', image: '/images/穿搭推荐/蓝色连衣裙.jpg', name: '蓝色连衣裙', tag: '显瘦修身·气质满分', price: '248' },
  { id: 'p6', image: '/images/穿搭推荐/衬衫牛仔.jpg', name: '衬衫牛仔套装', tag: '休闲通勤·轻松穿搭', price: '178' },
  { id: 'p7', image: '/images/穿搭推荐/黄白通勤套装.jpg', name: '黄白通勤套装', tag: '明亮活力·职场首选', price: '358' },
  { id: 'p8', image: '/images/穿搭推荐/黑白通勤套装.jpg', name: '黑白通勤套装', tag: '经典配色·高级感满满', price: '428' },
  { id: 'p9', image: '/images/穿搭推荐/黑白通勤套装2.jpg', name: '黑白通勤套装II', tag: '都市精英·时尚百搭', price: '468' },
  { id: 'p10', image: '/images/穿搭推荐/丝绸高级连衣裙.jpg', name: '丝绸高级连衣裙', tag: '奢感丝滑·高级质感', price: '498' },
  { id: 'p11', image: '/images/穿搭推荐/咖色高级连衣裙.jpg', name: '咖色高级连衣裙', tag: '复古暖调·秋冬必备', price: '368' },
  { id: 'p12', image: '/images/穿搭推荐/紫色套装.jpg', name: '紫色套装', tag: '高饱和撞色·风格出挑', price: '418' },
  { id: 'p13', image: '/images/穿搭推荐/赫本经典小黑裙.jpg', name: '赫本经典小黑裙', tag: '永恒经典·约会首选', price: '338' },
  { id: 'p14', image: '/images/穿搭推荐/黑白通勤裤套装.jpg', name: '黑白通勤裤套装', tag: '简约利落·干练气场', price: '448' }
]
function pickRandom3() {
  const arr = ALL_PRODUCTS.slice()
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr.slice(0, 3)
}
// 返回两组互不重叠的随机 3 件
function pickRandom3Pair() {
  const arr = ALL_PRODUCTS.slice()
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return [arr.slice(0, 3), arr.slice(3, 6)]
}
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
    compareRows: [],
    // 单品模式：动态维度列表
    dimensionList: [],
    // 顶部卡片：用户输入回显 chips
    echoChips: [],
    // 当前激活 tab：'compare'(多维对比) | 'advice'(穿搭建议)
    activeTab: 'compare',
    // 假门测试：静态商品数据（两个 tab 各一组，不重复）
    staticProducts: [],
    staticProducts2: []
  },

  onTabTap(e) {
    const tab = e.currentTarget.dataset.tab
    if (!tab || tab === this.data.activeTab) return
    this.setData({ activeTab: tab })
    if (tab === 'compare') {
      // 切回对比 tab 时重新绘制雷达图（canvas 在隐藏后可能丢失）
      setTimeout(() => this.drawRadar(), 200)
    }
  },

  onLoad(options) {
    const [g1, g2] = pickRandom3Pair()
    this.setData({ staticProducts: g1, staticProducts2: g2 })
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
    this.setData({ record, isCompare, echoChips: this.buildEchoChips(record, isCompare) })

    if (isCompare) {
      this.initCompareData(record)
    } else {
      this.initSingleData(record)
    }
  },

  buildEchoChips(record, isCompare) {
    const chips = []
    if (isCompare) {
      if (record.compareScene) chips.push({ label: '场景', value: record.compareScene })
      if (Array.isArray(record.priceList) && record.priceList.length) {
        chips.push({ label: '价位', value: record.priceList.join(' / ') })
      }
    } else {
      if (record.category) chips.push({ label: '类别', value: record.category })
      if (record.priceRange) chips.push({ label: '价位', value: record.priceRange })
      if (Array.isArray(record.wearScenes) && record.wearScenes.length) {
        chips.push({ label: '场景', value: record.wearScenes.slice(0, 2).join('·') })
      }
      if (record.consultScene) {
        chips.push({ label: '决策', value: record.consultScene === 'buy' ? '购买决策' : '留存决策' })
      }
    }
    return chips
  },

  initSingleData(record) {
    const s = record.scores || {}
    const category = record.category || ''

    // 品类维度映射
    const isMakeup = /口红|唇釉|腮红|眼影|粉底|彩妆/.test(category)
    const isAccessory = /帽子|围巾|领带|耳环|项链|手链|手镯|包包|鞋子|腰带|手表|墨镜|配饰/.test(category)

    let dimensionConfig
    if (isMakeup) {
      dimensionConfig = [
        { key: 'colorScore', name: '色号匹配度', icon: 'palette' },
        { key: 'textureScore', name: '质地显色度', icon: 'gem' },
        { key: 'lastingScore', name: '持久实用性', icon: 'clipboard' },
        { key: 'valueScore', name: '性价比', icon: 'money' }
      ]
    } else if (isAccessory) {
      dimensionConfig = [
        { key: 'matchScore', name: '搭配适配度', icon: 'scissors' },
        { key: 'qualityScore', name: '材质做工', icon: 'gem' },
        { key: 'styleScore', name: '风格适配度', icon: 'palette' },
        { key: 'valueScore', name: '性价比', icon: 'money' }
      ]
    } else {
      dimensionConfig = [
        { key: 'fitScore', name: '版型适合度', icon: 'scissors' },
        { key: 'colorScore', name: '颜色匹配度', icon: 'palette' },
        { key: 'qualityScore', name: '质感做工', icon: 'gem' },
        { key: 'valueScore', name: '性价比', icon: 'money' }
      ]
    }

    const dimensions = dimensionConfig.map(d => d.name)
    const values = dimensionConfig.map(d => s[d.key] || 0)

    // 构建 WXML 可遍历的维度列表
    const dimensionList = dimensionConfig.map(d => ({
      key: d.key,
      name: d.name,
      icon: d.icon,
      score: s[d.key] || 0,
      pros: (record.details && record.details[d.key] && record.details[d.key].pros) || '',
      cons: (record.details && record.details[d.key] && record.details[d.key].cons) || ''
    }))

    // 如果所有值都是0则不绘制
    if (values.every(v => v === 0)) return
    this.setData({
      radarData: { dimensions, values },
      dimensionList
    })
    // 等待 Canvas 渲染后绘制
    setTimeout(() => this.drawRadar(), 500)
  },

  initCompareData(record) {
    const scores = record.scores || []
    if (!Array.isArray(scores) || scores.length === 0) return

    // 根据品类动态选择维度
    const category = record.category || (scores[0] && scores[0].category) || ''
    const isMakeup = /口红|唇釉|腮红|眼影|粉底|彩妆/.test(category)
    const isAccessory = /帽子|围巾|领带|耳环|项链|手链|手镯|包包|鞋子|腰带|手表|墨镜|配饰/.test(category)

    let labels, scoreKeys
    if (isMakeup) {
      labels = ['色号匹配', '质地显色', '持久实用', '性价比']
      scoreKeys = ['colorScore', 'textureScore', 'lastingScore', 'valueScore']
    } else if (isAccessory) {
      labels = ['搭配适配', '材质做工', '风格适配', '性价比']
      scoreKeys = ['matchScore', 'qualityScore', 'styleScore', 'valueScore']
    } else {
      labels = ['显瘦修饰', '日常百搭', '场合适配', '质感高级', '性价比', '耐看实用']
      scoreKeys = ['slimScore', 'versatileScore', 'occasionScore', 'qualityScore', 'valueScore', 'durableScore']
    }

    // 雷达图用排名第一的数据
    const rankings = record.rankings || []
    const topIdx = rankings[0] ? rankings[0].index : 0
    const topScore = scores.find(s => s.index === topIdx) || scores[0]
    const values = scoreKeys.map(k => topScore[k] || 0)

    this.setData({
      radarData: { dimensions: labels, values }
    })

    // 对比表格数据
    const itemLabel = isMakeup ? '色号' : isAccessory ? '款式' : '款式'
    const compareHeaders = ['维度', ...scores.map(s => s.label || (itemLabel + (s.index + 1)))]
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
      title: score ? `穿搭评分 ${score}分 ` : '穿搭决策 - 帮你不踩雷',
      path: '/pages/outfit/outfit',
      imageUrl: '/images/yanzhi2.jpg'
    }
  },

  // 假门测试：记录商品点击兴趣
  onPreviewProductImage(e) {
    const src = e.currentTarget.dataset.src
    const urls = [
      ...this.data.staticProducts.map(p => p.image),
      ...this.data.staticProducts2.map(p => p.image)
    ].filter((v, i, a) => a.indexOf(v) === i)
    wx.previewImage({ current: src, urls })
  },

  onProductTap(e) {
    const id = e.currentTarget.dataset.id
    const allProducts = [...(this.data.staticProducts || []), ...(this.data.staticProducts2 || [])]
    const product = allProducts.find(p => p.id === id)
    // 本地埋点（兜底）
    const key = 'shopRecClickCount'
    wx.setStorageSync(key, (wx.getStorageSync(key) || 0) + 1)
    const logs = wx.getStorageSync('shopRecClickLogs') || []
    logs.push({ id, t: Date.now() })
    wx.setStorageSync('shopRecClickLogs', logs)
    // 服务端上报（静默）
    request(API.track, {
      method: 'POST',
      data: { event: 'product_click', productId: id, productName: product ? product.name : '', page: 'consult-result' }
    }).catch(() => {})

    wx.showModal({
      title: '好物推荐即将上线',
      content: '我们正在接入精选好物，点击即代表你的期待！感谢你的反馈 🥰',
      showCancel: false,
      confirmText: '期待上线'
    })
  }
})
