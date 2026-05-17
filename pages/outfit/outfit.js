// pages/outfit/outfit.js
Page({
  data: {
    currentScene: 'all',
    scenes: [
      { key: 'all', name: '全部' },
      { key: 'daily', name: '日常' },
      { key: 'work', name: '职场' },
      { key: 'date', name: '约会' },
      { key: 'casual', name: '休闲' }
    ],
    outfits: [],
    filteredList: [],
    hasReport: false
  },

  onLoad() {
    this.loadReportData()
    this.generateOutfits()
  },

  onShow() {
    this.loadReportData()
  },

  loadReportData() {
    const reports = wx.getStorageSync('reports') || []
    if (reports.length > 0) {
      this.setData({ hasReport: true })
    }
  },

  generateOutfits() {
    const outfits = [
      { id: 1, name: '清冷职场', scene: 'work', items: ['灰蓝西装外套', '白色醋酸衬衫', '烟灰阔腿裤', '银色耳环'], matchReason: '冷调配色契合冷夏肤色，修身版型突显气质', score: 9.2, colors: ['#7B9EB0', '#FFFFFF', '#8E9398', '#C0C0C0'] },
      { id: 2, name: '温柔日常', scene: 'daily', items: ['玫瑰粉针织衫', '高腰直筒裤', '薄荷绿针织开衫'], matchReason: '玫瑰粉为本命色，直筒裤修饰比例', score: 8.8, colors: ['#C4889B', '#3A3A4A', '#8DBFB0'] },
      { id: 3, name: '浪漫约会', scene: 'date', items: ['薰衣草紫A字裙', '灰粉真丝吊带', '裸色高跟鞋'], matchReason: '薰衣草紫完美匹配冷夏色彩，A字裙优化比例', score: 9.0, colors: ['#9B8EC4', '#C9A9A6', '#D4A574'] },
      { id: 4, name: '休闲周末', scene: 'casual', items: ['白色T恤', '深蓝直筒牛仔裤', '烟灰针织开衫', '帆布鞋'], matchReason: '简约休闲风，深蓝牛仔与冷皮适配', score: 8.3, colors: ['#FFFFFF', '#1A2A3A', '#8E9398'] },
      { id: 5, name: '知性通勤', scene: 'work', items: ['黑茶色西装', '雾蓝衬衫', '高腰西裤', '珍珠耳钉'], matchReason: '雾蓝为本命色，西装版型修饰身形', score: 9.0, colors: ['#2A1F14', '#7B9EB0', '#3A3A4A'] },
      { id: 6, name: '法式日常', scene: 'daily', items: ['条纹针织衫', '卡其色阔腿裤', '丝质围巾'], matchReason: '条纹元素适配简约风，阔腿裤优化比例', score: 8.5, colors: ['#1A1A2E', '#C5B99B', '#C9A9A6'] }
    ]

    this.setData({ outfits, filteredList: outfits })
  },

  onFilterScene(e) {
    const key = e.currentTarget.dataset.key
    this.setData({ currentScene: key })
    this.applyFilters()
  },

  applyFilters() {
    let list = this.data.outfits
    if (this.data.currentScene !== 'all') {
      list = list.filter(o => o.scene === this.data.currentScene)
    }
    if (this.data.hasReport) {
      list.sort((a, b) => b.score - a.score)
    }
    this.setData({ filteredList: list })
  },

  onGoDiagnose() {
    wx.navigateTo({ url: '/pages/diagnose/diagnose' })
  }
})
