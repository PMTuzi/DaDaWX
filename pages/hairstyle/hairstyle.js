// pages/hairstyle/hairstyle.js
Page({
  data: {
    currentLength: 'all',
    currentStyle: 'all',
    lengths: [
      { key: 'all', name: '全部' },
      { key: 'short', name: '短发' },
      { key: 'medium', name: '中发' },
      { key: 'long', name: '长发' }
    ],
    styles: [
      { key: 'all', name: '全部' },
      { key: 'sweet', name: '少女' },
      { key: 'elegant', name: '御姐' },
      { key: 'retro', name: '复古' },
      { key: 'minimal', name: '简约' }
    ],
    hairstyles: [],
    filteredList: [],
    hasReport: false,
    reportData: null
  },

  onLoad() {
    this.loadReportData()
    this.generateHairstyles()
  },

  onShow() {
    this.loadReportData()
  },

  loadReportData() {
    const reports = wx.getStorageSync('reports') || []
    if (reports.length > 0) {
      this.setData({
        hasReport: true,
        reportData: reports[0]
      })
    }
  },

  generateHairstyles() {
    // 基础发型数据（实际项目中由后端/大模型生成）
    const hairstyles = [
      { id: 1, name: '中长微卷', length: 'medium', style: 'elegant', faceMatch: ['oval', 'diamond'], score: 9.2, desc: '自然微卷轮廓，空气刘海', care: '吹干时用圆梳卷出发尾弧度' },
      { id: 2, name: '低马尾', length: 'long', style: 'minimal', faceMatch: ['oval', 'round'], score: 8.8, desc: '蓬松感低扎，碎发修饰', care: '扎发前用蓬松喷雾' },
      { id: 3, name: '锁骨发外翻', length: 'medium', style: 'sweet', faceMatch: ['oval', 'heart'], score: 8.6, desc: '发尾外翻微卷，法式刘海', care: '用直板夹向外夹出发尾弧度' },
      { id: 4, name: '大波浪长卷', length: 'long', style: 'elegant', faceMatch: ['oval', 'long'], score: 8.5, desc: 'S型大卷，偏分长刘海', care: '卷发棒32mm卷出大弧度' },
      { id: 5, name: '短发bob', length: 'short', style: 'minimal', faceMatch: ['oval', 'square'], score: 8.2, desc: '齐下巴微内扣，空气刘海', care: '吹风机+圆梳内扣定型' },
      { id: 6, name: '丸子头', length: 'medium', style: 'sweet', faceMatch: ['round', 'heart'], score: 7.8, desc: '高扎丸子，蓬松感', care: '拉松头顶和碎发增加空气感' },
      { id: 7, name: '复古卷发', length: 'medium', style: 'retro', faceMatch: ['oval', 'square'], score: 8.0, desc: '复古手推波纹，偏分', care: '用定型喷雾固定波纹' },
      { id: 8, name: '长直发', length: 'long', style: 'minimal', faceMatch: ['oval', 'long'], score: 7.5, desc: '自然垂感直发，中分', care: '定期做柔顺护理' },
      { id: 9, name: '短发精灵', length: 'short', style: 'sweet', faceMatch: ['oval', 'diamond'], score: 8.0, desc: '超短碎发，俏皮感', care: '用发蜡抓出纹理' },
      { id: 10, name: '法式慵懒卷', length: 'long', style: 'retro', faceMatch: ['oval', 'round'], score: 8.3, desc: '慵懒自然卷，偏分', care: '湿发时用摩丝抓出卷度自然风干' }
    ]

    this.setData({ hairstyles, filteredList: hairstyles })
  },

  onFilterLength(e) {
    const key = e.currentTarget.dataset.key
    this.setData({ currentLength: key })
    this.applyFilters()
  },

  onFilterStyle(e) {
    const key = e.currentTarget.dataset.key
    this.setData({ currentStyle: key })
    this.applyFilters()
  },

  applyFilters() {
    let list = this.data.hairstyles
    if (this.data.currentLength !== 'all') {
      list = list.filter(h => h.length === this.data.currentLength)
    }
    if (this.data.currentStyle !== 'all') {
      list = list.filter(h => h.style === this.data.currentStyle)
    }
    // 如果有诊断报告，按适配度排序
    if (this.data.hasReport) {
      list.sort((a, b) => b.score - a.score)
    }
    this.setData({ filteredList: list })
  },

  onGoDiagnose() {
    wx.navigateTo({ url: '/pages/diagnose/diagnose' })
  },

  onHairstyleDetail(e) {
    const id = e.currentTarget.dataset.id
    wx.showToast({ title: '发型详情开发中', icon: 'none' })
  }
})
