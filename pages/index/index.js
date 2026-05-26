// pages/index/index.js
const { wxLogin, ensureLogin, request, API, uploadImage } = require('../../utils/api')
const { formatDate, getScoreLevel, calcPercentile } = require('../../utils/format')
const taskState = require('../../utils/task-state')

// ============ 关键词 → 配图 映射（从 report.js 迁移）============
function pickByKeyword(text, mapping, fallback) {
  if (!text) return fallback || ''
  const t = String(text)
  for (const kw of Object.keys(mapping)) {
    if (t.indexOf(kw) !== -1) return mapping[kw]
  }
  return fallback || ''
}

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

const HAIR_STYLE_IMG = {
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
  '长卷': '/images/refs/hair_long_curly.jpg',
  '短卷': '/images/refs/hair_short_curly.jpg',
  '长直': '/images/refs/hair_long_straight.jpg',
  '直发': '/images/refs/hair_long_straight.jpg',
  '中分': '/images/refs/hair_long_straight.jpg',
  '齐耳': '/images/refs/hair_bob.jpg',
  '齐刘海': '/images/refs/hair_bob.jpg',
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

const FOUNDATION_IMG = {
  '哑光': '/images/refs/makeup_heavy.jpg',
  '浓': '/images/refs/makeup_heavy.jpg',
  '欧美': '/images/refs/makeup_heavy.jpg',
  '烟熏': '/images/refs/makeup_heavy.jpg',
  '复古': '/images/refs/makeup_heavy.jpg',
  '高级感': '/images/refs/makeup_heavy.jpg',
  '雾面': '/images/refs/makeup_heavy.jpg',
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
  '淡': '/images/refs/makeup_light.jpg'
}

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
const LIP_FALLBACK = '/images/refs/makeup_lipstick.jpg'
const BLUSH_FALLBACK = '/images/refs/makeup_blush.jpg'

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

function buildCdnImages(report) {
  const m = (report && report.modules) || {}
  const hairTop = (m.hairmakeup && m.hairmakeup.hairRecommend && m.hairmakeup.hairRecommend.top3) || []
  const makeup = (m.hairmakeup && m.hairmakeup.makeup) || {}
  const advice = (m.style && m.style.clothingAdvice) || {}
  const roadmap = (m.optimize && m.optimize.roadmap3m) || {}

  return {
    hair: hairTop.map(h => {
      if (h.imageKey && HAIR_KEY_IMG[h.imageKey]) return HAIR_KEY_IMG[h.imageKey]
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
      lipRecommend: LIP_FALLBACK,
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
    slogan: '国内首款「反种草」AI 形象诊断平台',
    hasReport: false,
    latestReport: null,
    scoreLevel: null,
    tickerList: [],
    showLoginModal: false,
    loginAvatarUrl: '',
    loginNickname: '',
    pendingAction: '',
    featureTagsRow1: [
      '明星脸匹配', '客观颜值评分', '面部特征分析', '颜值优化建议',
      '骨相轮廓识别', '面部黄金比例', '气质类型解析', '微表情诊断'
    ],
    featureTagsRow2: [
      '穿搭风格建议', '四季色彩分析', '形象风格分析', '身材比例测算',
      '发型脸型适配', '妆容色调推荐', '配饰搭配指南', '场景着装方案'
    ],
    introVideoVisible: true,
    introVideoRetry: 0,
    diagnoseTask: null,
    // ===== 报告详情态 =====
    activeTab: 'celebrity',
    tabKeys: ['celebrity', 'optimize', 'hairmakeup', 'dna', 'style'],
    tabLabels: { celebrity: '明星相似', optimize: '颜值&蜕变', hairmakeup: '发型&妆容', dna: '面部&骨相', style: '皮肤&风格' },
    shared: false,
    cdnImages: { hair: [], makeup: {}, advice: {}, roadmap: [] },
    currentReportId: ''
  },

  onLoad(options) {
    this.checkLogin()
    if (options && options.id) {
      wx.setStorageSync('pendingReportId', options.id)
    }
    // 启用右上角胶囊菜单中的"转发"
    try {
      wx.showShareMenu({ withShareTicket: true, menus: ['shareAppMessage', 'shareTimeline'] })
    } catch (e) {}
    // 恢复分享解锁状态（2 分钟内有效，超时自动重新锁定）
    this._refreshShareLock()
    this.loadLatestReport()
    this.generateTickerList()
  },

  onShow() {
    // 每次进入页面都重新计算解锁是否过期
    this._refreshShareLock()
    // 检查是否有从 report 中转/历史报告进入要显示的指定 id
    const pendingId = wx.getStorageSync('pendingReportId')
    if (pendingId) {
      wx.removeStorageSync('pendingReportId')
      this.setData({ currentReportId: pendingId })
    }
    this.loadLatestReport()
    this.startTaskPolling()
  },

  onHide() {
    this.stopTaskPolling()
    this._clearShareLockTimer()
  },

  onUnload() {
    this.stopTaskPolling()
    this._clearShareLockTimer()
  },

  startTaskPolling() {
    this.stopTaskPolling()
    const tick = () => {
      const t = taskState.get('diagnose')
      this.setData({ diagnoseTask: t })
      if (t && t.status === 'done' && !this._doneClearTimer) {
        this.loadLatestReport()
        this._doneClearTimer = setTimeout(() => {
          taskState.clear('diagnose')
          this.setData({ diagnoseTask: null })
          this._doneClearTimer = null
        }, 30000)
      }
    }
    tick()
    this._taskTimer = setInterval(tick, 600)
  },

  stopTaskPolling() {
    if (this._taskTimer) { clearInterval(this._taskTimer); this._taskTimer = null }
    if (this._doneClearTimer) { clearTimeout(this._doneClearTimer); this._doneClearTimer = null }
  },

  onTapDiagnoseTask() {
    const t = taskState.get('diagnose')
    if (!t) return
    if (t.status === 'done' && t.resultUrl) {
      taskState.clear('diagnose')
      this.setData({ diagnoseTask: null })
      // resultUrl 形如 /pages/report/report?id=xxx，提取 id 后直接刷新当前页
      const m = /id=([^&]+)/.exec(t.resultUrl)
      if (m && m[1]) {
        this.setData({ currentReportId: m[1] })
      }
      this.loadLatestReport()
    } else if (t.status === 'error') {
      wx.showModal({ title: '诊断失败', content: t.errorMsg || '请重新尝试', confirmText: '关闭', showCancel: false })
      taskState.clear('diagnose')
      this.setData({ diagnoseTask: null })
    } else if (t.status === 'running') {
      wx.navigateTo({ url: '/pages/diagnose/diagnose?view=1' })
    }
  },

  async checkLogin() {
    const token = wx.getStorageSync('token')
    if (!token) {
      try { await wxLogin() } catch (e) { console.log('自动登录失败', e) }
    }
  },

  loadLatestReport() {
    const reports = wx.getStorageSync('reports') || []
    if (!reports.length) {
      this.setData({ hasReport: false, latestReport: null })
      return
    }
    const id = this.data.currentReportId
    let target = id ? reports.find(r => r.id === id) : reports[0]
    if (!target) target = reports[0]

    // 老报告兜底补算颜值百分位
    if (target.basic && (target.basic.percentile == null || isNaN(target.basic.percentile))) {
      target.basic.percentile = calcPercentile(target.basic.overallScore)
    }
    this.setData({
      hasReport: true,
      latestReport: target,
      scoreLevel: getScoreLevel(target.basic?.overallScore || 0),
      activeTab: 'celebrity',
      cdnImages: buildCdnImages(target)
    })
    setTimeout(() => this.drawRadarChart(), 300)
  },

  // 立即诊断 - 需要登录确认
  onStartDiagnose() {
    this.requireLogin('diagnose')
  },

  onGoBeautyPlan() {
    wx.navigateTo({ url: '/pages/beauty-plan/beauty-plan' })
  },

  async requireLogin(action) {
    const token = wx.getStorageSync('token')
    const userInfo = wx.getStorageSync('userInfo')
    if (token && userInfo && userInfo.nickName && userInfo.nickName !== '搭搭用户') {
      this.navigateTo(action)
      return
    }
    if (!token) {
      try { await ensureLogin() } catch (e) {
        wx.showToast({ title: '登录失败，请重试', icon: 'none' })
        return
      }
    }
    const info = wx.getStorageSync('userInfo')
    if (info && info.nickName && info.nickName !== '搭搭用户') {
      this.navigateTo(action)
      return
    }
    const hasValidAvatar = info?.avatarUrl && !this._isTempUrl(info.avatarUrl)
    this.setData({
      showLoginModal: true,
      pendingAction: action,
      loginAvatarUrl: hasValidAvatar ? info.avatarUrl : '',
      loginNickname: '',
      autoFocusNickname: true
    })
  },

  _isTempUrl(url) {
    if (!url) return false
    return url.startsWith('http://127.0.0.1') || url.startsWith('wxfile://') || url.includes('/__tmp__/')
  },

  onChooseAvatar(e) {
    const avatarUrl = e.detail.avatarUrl
    if (avatarUrl) this.setData({ loginAvatarUrl: avatarUrl })
  },

  onNicknameInput(e) {
    this.setData({ loginNickname: e.detail.value })
  },

  async onConfirmLogin() {
    const { loginAvatarUrl, loginNickname, pendingAction } = this.data
    if (!loginNickname || !loginNickname.trim()) {
      wx.showToast({ title: '请输入昵称', icon: 'none' })
      return
    }
    wx.showLoading({ title: '保存中...' })
    let avatarCloudUrl = loginAvatarUrl
    if (loginAvatarUrl && (loginAvatarUrl.startsWith('http://127.0.0.1') || loginAvatarUrl.startsWith('wxfile://'))) {
      try {
        avatarCloudUrl = await uploadImage(loginAvatarUrl)
      } catch (err) {
        console.warn('[index] 头像上传失败:', err.message)
        avatarCloudUrl = ''
      }
    }
    const userInfo = {
      ...wx.getStorageSync('userInfo'),
      avatarUrl: avatarCloudUrl,
      nickName: loginNickname.trim(),
      openid: wx.getStorageSync('userInfo')?.openid || ''
    }
    wx.setStorageSync('userInfo', userInfo)
    try {
      const updates = {}
      if (avatarCloudUrl) updates.avatarUrl = avatarCloudUrl
      if (loginNickname) updates.nickName = loginNickname.trim()
      await request(API.updateProfile, { method: 'PUT', data: updates })
    } catch (e) {
      console.warn('[index] 同步用户信息失败:', e.message)
    }
    wx.hideLoading()
    this.setData({ showLoginModal: false, pendingAction: '' })
    this.navigateTo(pendingAction)
  },

  onCloseLoginModal() {
    this.setData({ showLoginModal: false, pendingAction: '' })
  },

  onSkipLogin() {
    const { pendingAction } = this.data
    this.setData({ showLoginModal: false, pendingAction: '', autoFocusNickname: false })
    if (pendingAction) this.navigateTo(pendingAction)
  },

  onPreventBubble() {},

  navigateTo(action) {
    if (action === 'diagnose') {
      const t = taskState.get('diagnose')
      const url = (t && t.status === 'running')
        ? '/pages/diagnose/diagnose?view=1'
        : '/pages/diagnose/diagnose'
      wx.navigateTo({ url })
    }
  },

  // ====================== 报告 Tab/雷达图（迁移自 report.js）======================
  onTabTap(e) {
    const tab = e.currentTarget.dataset.tab
    this.setData({ activeTab: tab })
    setTimeout(() => this.drawRadarChart(), 100)
  },

  onAvatarError() {
    const report = this.data.latestReport
    if (!report) return
    if (report.photoUrlRemote && report.photoUrl !== report.photoUrlRemote) {
      report.photoUrl = report.photoUrlRemote
    } else {
      report.photoUrl = ''
    }
    this.setData({ latestReport: report })
  },

  onCelebImgError(e) {
    const ci = e.currentTarget.dataset.ci
    const report = this.data.latestReport
    if (!report || !report.modules || !report.modules.celebrity) return
    const list = report.modules.celebrity.top5 || []
    if (list[ci]) {
      this.setData({ [`latestReport.modules.celebrity.top5[${ci}].imageUrl`]: '' })
    }
  },

  onCdnImgError(e) {
    const { key, idx, sub } = e.currentTarget.dataset
    const cdnImages = this.data.cdnImages
    if (sub) cdnImages[key][sub] = ''
    else if (idx !== undefined && idx !== '') cdnImages[key][idx] = ''
    else cdnImages[key] = ''
    this.setData({ cdnImages })
  },

  drawRadarChart() {
    const tab = this.data.activeTab
    const report = this.data.latestReport
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
        case 'dna': this.drawDNARadar(ctx, width, height, report.modules.dna); break
        case 'style': this.drawStyleRadar(ctx, width, height, report.modules.style); break
        case 'hairmakeup': this.drawHairMakeupRadar(ctx, width, height, report.modules.hairmakeup); break
        case 'optimize': this.drawOptimizeRadar(ctx, width, height, report.modules.optimize); break
      }
    })
  },

  drawDNARadar(ctx, w, h, data) {
    if (!data?.faceFeatures) return
    const features = data.faceFeatures.slice(0, 5)
    this._drawRadar(ctx, w, h, features.map(f => f.name), features.map(f => f.score || 5), '#2D9BFF', '骨相评分')
  },

  drawStyleRadar(ctx, w, h, data) {
    if (!data) return
    const labels = ['明度', '纯度', '量感', '冷暖', '饱和度']
    const warmCool = data.skinType === '暖皮' ? 8 : data.skinType === '冷皮' ? 3 : 5
    const scores = [data.brightness || 5, data.purity || 5, data.mass || 5, warmCool, 6]
    this._drawRadar(ctx, w, h, labels, scores, '#6BA3D6', '风格属性')
  },

  drawHairMakeupRadar(ctx, w, h, data) {
    if (!data?.hairRecommend?.top3) return
    const top3 = data.hairRecommend.top3
    const labels = ['修饰脸型', '显高显瘦', '打理难度', '时尚度', '气质匹配']
    const scores = top3.length > 0
      ? [top3[0].score || 7, 6, 5, 7, top3[0].score || 7]
      : [5, 5, 5, 5, 5]
    this._drawRadar(ctx, w, h, labels, scores, '#E85C5C', '发型适配')
  },

  drawOptimizeRadar(ctx, w, h, data) {
    if (!data?.optimizablePoints) return
    const labels = ['五官协调', '皮肤状态', '发型适配', '妆容加分', '整体气质']
    const scores = [7, 6, 5, 6, 6]
    this._drawRadar(ctx, w, h, labels, scores, '#F0B8D0', '蜕变潜力')
  },

  _drawRadar(ctx, w, h, labels, scores, color, title) {
    const cx = w / 2, cy = h / 2
    const maxR = Math.min(w, h) / 2 - 30
    const n = labels.length
    const angleStep = (Math.PI * 2) / n
    const startAngle = -Math.PI / 2
    ctx.clearRect(0, 0, w, h)
    for (let level = 1; level <= 5; level++) {
      const r = (maxR * level) / 5
      ctx.beginPath()
      for (let i = 0; i <= n; i++) {
        const angle = startAngle + i * angleStep
        const x = cx + r * Math.cos(angle), y = cy + r * Math.sin(angle)
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
      }
      ctx.closePath(); ctx.strokeStyle = '#E8E8E8'; ctx.lineWidth = 0.5; ctx.stroke()
    }
    for (let i = 0; i < n; i++) {
      const angle = startAngle + i * angleStep
      ctx.beginPath(); ctx.moveTo(cx, cy)
      ctx.lineTo(cx + maxR * Math.cos(angle), cy + maxR * Math.sin(angle))
      ctx.strokeStyle = '#D0D0D0'; ctx.lineWidth = 0.5; ctx.stroke()
    }
    ctx.beginPath()
    for (let i = 0; i <= n; i++) {
      const idx = i % n
      const angle = startAngle + idx * angleStep
      const r = (maxR * scores[idx]) / 10
      const x = cx + r * Math.cos(angle), y = cy + r * Math.sin(angle)
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
    }
    ctx.closePath()
    const hex = color.replace('#', '')
    const r = parseInt(hex.substring(0, 2), 16)
    const g = parseInt(hex.substring(2, 4), 16)
    const b = parseInt(hex.substring(4, 6), 16)
    ctx.fillStyle = `rgba(${r}, ${g}, ${b}, 0.15)`; ctx.fill()
    ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.stroke()
    for (let i = 0; i < n; i++) {
      const angle = startAngle + i * angleStep
      const rad = (maxR * scores[i]) / 10
      const x = cx + rad * Math.cos(angle), y = cy + rad * Math.sin(angle)
      ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fillStyle = color; ctx.fill()
    }
    ctx.font = 'bold 11px sans-serif'
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    for (let i = 0; i < n; i++) {
      const angle = startAngle + i * angleStep
      const rad = (maxR * scores[i]) / 10
      const vx = cx + (rad + 9) * Math.cos(angle)
      const vy = cy + (rad + 9) * Math.sin(angle)
      const valStr = (Math.round(scores[i] * 10) / 10).toString()
      const tw = ctx.measureText(valStr).width
      ctx.fillStyle = 'rgba(255,255,255,0.92)'
      ctx.fillRect(vx - tw / 2 - 3, vy - 8, tw + 6, 14)
      ctx.fillStyle = color
      ctx.fillText(valStr, vx, vy)
    }
    ctx.font = '10px sans-serif'; ctx.fillStyle = '#666'
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    for (let i = 0; i < n; i++) {
      const angle = startAngle + i * angleStep
      const labelR = maxR + 18
      const x = cx + labelR * Math.cos(angle), y = cy + labelR * Math.sin(angle)
      ctx.fillText(labels[i], x, y)
    }
    ctx.font = 'bold 12px sans-serif'; ctx.fillStyle = color; ctx.textAlign = 'center'
    ctx.fillText(title, cx, cy)
  },

  onImagePreview(e) {
    const url = e.currentTarget.dataset.url
    if (!url) return
    wx.previewImage({ current: url, urls: [url] })
  },

  // ==================== 底部操作 ====================
  async onSaveAllImages() {
    this._refreshShareLock()
    if (!this.data.shared) {
      wx.showToast({ title: '点击右上角···转发解锁（2分钟内有效）', icon: 'none', duration: 2200 })
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
        console.error('[index] 保存失败:', err)
        wx.showToast({ title: '保存失败，请重试', icon: 'none' })
      }
    }
  },

  onReDiagnose() {
    this._refreshShareLock()
    if (!this.data.shared) {
      wx.showToast({ title: '点击右上角···转发解锁（2分钟内有效）', icon: 'none', duration: 2200 })
      return
    }
    const t = taskState.get('diagnose')
    const url = (t && t.status === 'running')
      ? '/pages/diagnose/diagnose?view=1'
      : '/pages/diagnose/diagnose'
    wx.navigateTo({ url })
  },

  _roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath()
    ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y)
    ctx.arcTo(x + w, y, x + w, y + r, r)
    ctx.lineTo(x + w, y + h - r)
    ctx.arcTo(x + w, y + h, x + w - r, y + h, r)
    ctx.lineTo(x + r, y + h); ctx.arcTo(x, y + h, x, y + h - r, r)
    ctx.lineTo(x, y + r); ctx.arcTo(x, y, x + r, y, r)
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
    const lines = []; let line = ''
    for (let i = 0; i < text.length; i++) {
      const test = line + text[i]
      if (ctx.measureText(test).width > maxW && line) { lines.push(line); line = text[i] }
      else line = test
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
        const w = res[0].width, h = res[0].height
        canvas.width = w * dpr; canvas.height = h * dpr
        ctx.scale(dpr, dpr)
        const report = this.data.latestReport
        const p = 20, cw = w - p * 2

        ctx.fillStyle = '#FFF8F3'; ctx.fillRect(0, 0, w, h)
        const headerH = 92
        const grad = ctx.createLinearGradient(0, 0, w, headerH)
        grad.addColorStop(0, '#B76E79'); grad.addColorStop(0.5, '#C38D9E'); grad.addColorStop(1, '#E8A87C')
        ctx.fillStyle = grad; ctx.fillRect(0, 0, w, headerH)

        ctx.fillStyle = 'rgba(255,255,255,0.15)'
        ctx.beginPath(); ctx.arc(w - 30, 25, 28, 0, Math.PI * 2); ctx.fill()
        ctx.beginPath(); ctx.arc(28, headerH - 18, 20, 0, Math.PI * 2); ctx.fill()

        ctx.fillStyle = '#fff'; ctx.font = 'bold 20px sans-serif'; ctx.textAlign = 'center'
        ctx.fillText('✦ 形象风格诊断报告', w / 2, 44)
        ctx.font = '11px sans-serif'; ctx.fillStyle = 'rgba(255,255,255,0.85)'
        const now = new Date()
        const dateStr = `${now.getFullYear()}.${String(now.getMonth() + 1).padStart(2, '0')}.${String(now.getDate()).padStart(2, '0')}  ·  美哒 Meeta`
        ctx.fillText(dateStr, w / 2, 66)

        const scoreCardY = headerH - 26, scoreCardH = 110
        ctx.shadowColor = 'rgba(183,110,121,0.18)'; ctx.shadowBlur = 12; ctx.shadowOffsetY = 4
        ctx.fillStyle = '#fff'
        this._roundRect(ctx, p, scoreCardY, cw, scoreCardH, 14); ctx.fill()
        ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0

        const avatarR = 28
        const avatarCX = p + 16 + avatarR
        const avatarCY = scoreCardY + 22 + avatarR
        ctx.save(); ctx.beginPath()
        ctx.arc(avatarCX, avatarCY, avatarR + 2, 0, Math.PI * 2)
        const avatarRing = ctx.createLinearGradient(avatarCX - avatarR, avatarCY - avatarR, avatarCX + avatarR, avatarCY + avatarR)
        avatarRing.addColorStop(0, '#B76E79'); avatarRing.addColorStop(1, '#E8A87C')
        ctx.fillStyle = avatarRing; ctx.fill(); ctx.restore()

        if (report.photoUrl) {
          const avatarImg = await this._loadImage(canvas, report.photoUrl)
          if (avatarImg) {
            ctx.save(); ctx.beginPath()
            ctx.arc(avatarCX, avatarCY, avatarR, 0, Math.PI * 2); ctx.clip()
            ctx.drawImage(avatarImg, avatarCX - avatarR, avatarCY - avatarR, avatarR * 2, avatarR * 2)
            ctx.restore()
          } else {
            ctx.fillStyle = '#fff'; ctx.font = 'bold 14px sans-serif'; ctx.textAlign = 'center'
            ctx.fillText('Me', avatarCX, avatarCY + 5)
          }
        } else {
          ctx.fillStyle = '#fff'; ctx.font = 'bold 14px sans-serif'; ctx.textAlign = 'center'
          ctx.fillText('Me', avatarCX, avatarCY + 5)
        }

        const scoreX = avatarCX + avatarR + 18, scoreBaseY = avatarCY - 4
        ctx.textAlign = 'left'; ctx.font = 'bold 36px sans-serif'
        const scoreGrad = ctx.createLinearGradient(scoreX, scoreBaseY - 20, scoreX, scoreBaseY + 10)
        scoreGrad.addColorStop(0, '#B76E79'); scoreGrad.addColorStop(1, '#8B4F58')
        ctx.fillStyle = scoreGrad
        ctx.fillText(String(report.basic.overallScore), scoreX, scoreBaseY + 8)
        const scoreW = ctx.measureText(String(report.basic.overallScore)).width
        ctx.font = '13px sans-serif'; ctx.fillStyle = '#B89E8F'
        ctx.fillText('/10', scoreX + scoreW + 4, scoreBaseY + 8)

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
          ageGrad.addColorStop(0, '#FFD86F'); ageGrad.addColorStop(0.5, '#E8A87C'); ageGrad.addColorStop(1, '#C38D9E')
          ctx.fillStyle = ageGrad
          this._roundRect(ctx, ageX, ageY, ageW, 22, 11); ctx.fill()
          ctx.fillStyle = '#fff'; ctx.textAlign = 'center'
          ctx.fillText(ageText, ageX + ageW / 2, ageY + 15)
        }

        const otherTags = (report.basic.tags || []).filter((t, i, arr) => {
          if (!t) return false
          if (t.indexOf('视龄') === 0) return false
          if (i === arr.length - 1) return false
          return true
        }).slice(0, 4)
        if (otherTags.length) {
          const tagsY = scoreCardY + scoreCardH - 30
          ctx.font = 'bold 10px sans-serif'
          const tagWs = otherTags.map(t => ctx.measureText(t).width + 18)
          const totalTagW = tagWs.reduce((a, b) => a + b, 0)
          const gap = otherTags.length > 1 ? (cw - 32 - totalTagW) / (otherTags.length - 1) : 0
          let tagX = p + 16
          otherTags.forEach((tag, i) => {
            const tw = tagWs[i]
            const tg = ctx.createLinearGradient(tagX, tagsY, tagX + tw, tagsY + 18)
            tg.addColorStop(0, '#FFF3E0'); tg.addColorStop(1, '#FFE4EC')
            ctx.fillStyle = tg
            this._roundRect(ctx, tagX, tagsY, tw, 18, 9); ctx.fill()
            ctx.fillStyle = '#E58FA1'; ctx.textAlign = 'center'
            ctx.fillText(tag, tagX + tw / 2, tagsY + 12)
            tagX += tw + gap
          })
        }

        let y = scoreCardY + scoreCardH + 16
        const conclusion = report.modules.optimize?.coreConclusion
        if (conclusion) {
          ctx.font = '11px sans-serif'
          const conLines = this._wrapText(ctx, conclusion, cw - 32, 4)
          const conH = 20 + 18 + conLines.length * 16 + 14
          const sumGrad = ctx.createLinearGradient(p, y, p + cw, y + conH)
          sumGrad.addColorStop(0, '#FFF3E0'); sumGrad.addColorStop(1, '#FFE4EC')
          ctx.fillStyle = sumGrad
          this._roundRect(ctx, p, y, cw, conH, 12); ctx.fill()
          ctx.strokeStyle = 'rgba(183,110,121,0.18)'; ctx.lineWidth = 1
          this._roundRect(ctx, p, y, cw, conH, 12); ctx.stroke()
          ctx.font = 'bold 12px sans-serif'; ctx.fillStyle = '#B76E79'; ctx.textAlign = 'left'
          ctx.fillText('✦ 核心结论', p + 14, y + 20)
          ctx.font = '11px sans-serif'; ctx.fillStyle = '#6B5550'
          conLines.forEach((line, i) => ctx.fillText(line, p + 14, y + 42 + i * 16))
          y += conH + 12
        }

        const sections = [
          { title: '🧬 面部&骨相', color: '#B76E79', show: !!report.modules.dna,
            lines: () => {
              const d = report.modules.dna
              const l = [`${d.faceType || ''} · ${d.boneType || ''}`]
              if (d.keyInsight) l.push('✦ ' + d.keyInsight)
              return l
            } },
          { title: '🎨 皮肤&风格', color: '#C38D9E', show: !!report.modules.style,
            lines: () => {
              const d = report.modules.style
              const l = [`${d.skinType || ''} · ${d.season || ''} · ${d.mainStyle || ''}`]
              if (d.keyInsight) l.push('✦ ' + d.keyInsight)
              return l
            } },
          { title: '✂️ 发型&妆容', color: '#E8A87C', show: !!report.modules.hairmakeup,
            lines: () => {
              const d = report.modules.hairmakeup
              const top = d.hairRecommend?.top3?.[0]
              const l = [top ? `推荐：${top.name} ${top.score}/10` : '']
              if (d.keyInsight) l.push('✦ ' + d.keyInsight)
              return l.filter(Boolean)
            } },
          { title: '🌟 颜值&蜕变', color: '#D4A574', show: !!report.modules.optimize,
            lines: () => {
              const d = report.modules.optimize
              const l = []
              if (d.keyInsight) l.push('✦ ' + d.keyInsight)
              return l
            } }
        ]

        sections.forEach(sec => {
          if (!sec.show) return
          const lines = sec.lines()
          if (!lines.length) return
          const textLines = []
          lines.forEach(line => {
            ctx.font = '10.5px sans-serif'
            textLines.push(...this._wrapText(ctx, line, cw - 28, 3))
          })
          const cardH = 16 + 18 + textLines.length * 16 + 10
          ctx.fillStyle = '#fff'
          this._roundRect(ctx, p, y, cw, cardH, 12); ctx.fill()
          ctx.fillStyle = sec.color
          this._roundRect(ctx, p, y, 4, cardH, 2); ctx.fill()
          ctx.font = 'bold 12px sans-serif'; ctx.fillStyle = '#3D2C28'; ctx.textAlign = 'left'
          ctx.fillText(sec.title, p + 14, y + 20)
          ctx.font = '10.5px sans-serif'
          let lineY = y + 38
          textLines.forEach(line => {
            ctx.fillStyle = line.startsWith('✦') ? '#B89E8F' : '#5C4A45'
            ctx.fillText(line, p + 14, lineY)
            lineY += 16
          })
          y += cardH + 10
        })

        const footerH = 56
        const footerY = Math.min(y + 4, h - footerH - 16)
        const fGrad = ctx.createLinearGradient(p, footerY, p + cw, footerY + footerH)
        fGrad.addColorStop(0, '#B76E79'); fGrad.addColorStop(1, '#E8A87C')
        ctx.fillStyle = fGrad
        this._roundRect(ctx, p, footerY, cw, footerH, 12); ctx.fill()
        ctx.font = 'bold 15px sans-serif'; ctx.fillStyle = '#fff'; ctx.textAlign = 'center'
        ctx.fillText('美哒 Meeta', w / 2, footerY + 24)
        ctx.font = '10px sans-serif'; ctx.fillStyle = 'rgba(255,255,255,0.85)'
        ctx.fillText('AI 反种草形象风格诊断', w / 2, footerY + 42)

        setTimeout(() => {
          wx.canvasToTempFilePath({
            canvas,
            fileType: 'jpg',
            quality: 0.85,
            success: (r) => resolve(r.tempFilePath),
            fail: reject
          })
        }, 300)
      })
    })
  },

  // 首页宣传视频事件
  onIntroVideoError(e) {
    console.error('[introVideo] error:', e && e.detail)
    const retry = this.data.introVideoRetry || 0
    if (retry >= 3) return
    this.setData({ introVideoVisible: false, introVideoRetry: retry + 1 })
    setTimeout(() => this.setData({ introVideoVisible: true }), 800 + retry * 600)
  },
  onIntroVideoLoaded() {
    if (this.data.introVideoRetry) this.setData({ introVideoRetry: 0 })
  },
  onIntroVideoPlay() {},

  // ==================== 分享解锁（2 分钟有效） ====================
  // 时长 ms：超过此时间后自动重新锁定
  _SHARE_UNLOCK_TTL: 2 * 60 * 1000,

  // 从存储里恢复解锁状态：未过期则保持解锁并安排到期定时器；已过期则清理
  _refreshShareLock() {
    let ts = 0
    try { ts = Number(wx.getStorageSync('reportSharedAt')) || 0 } catch (e) {}
    const remain = ts ? (this._SHARE_UNLOCK_TTL - (Date.now() - ts)) : 0
    if (ts && remain > 0) {
      if (!this.data.shared) this.setData({ shared: true })
      this._scheduleShareLockExpire(remain)
    } else {
      if (ts) {
        try { wx.removeStorageSync('reportSharedAt') } catch (e) {}
        try { wx.removeStorageSync('reportShared') } catch (e) {}  // 清理旧字段
      }
      if (this.data.shared) this.setData({ shared: false })
      this._clearShareLockTimer()
    }
  },

  _scheduleShareLockExpire(ms) {
    this._clearShareLockTimer()
    this._shareLockTimer = setTimeout(() => {
      try { wx.removeStorageSync('reportSharedAt') } catch (e) {}
      try { wx.removeStorageSync('reportShared') } catch (e) {}
      if (this.data && this.data.shared) {
        this.setData({ shared: false })
        wx.showToast({ title: '解锁已过期，再次分享可继续', icon: 'none', duration: 1800 })
      }
      this._shareLockTimer = null
    }, ms)
  },

  _clearShareLockTimer() {
    if (this._shareLockTimer) {
      clearTimeout(this._shareLockTimer)
      this._shareLockTimer = null
    }
  },

  // 用户触发分享时调用：写入解锁时间戳并安排到期
  _unlockByShare(silent) {
    const now = Date.now()
    try { wx.setStorageSync('reportSharedAt', now) } catch (e) {}
    const wasUnlocked = this.data.shared
    if (!wasUnlocked) this.setData({ shared: true })
    this._scheduleShareLockExpire(this._SHARE_UNLOCK_TTL)
    if (!wasUnlocked && !silent) {
      wx.showToast({ title: '已解锁 2 分钟，请抓紧操作', icon: 'none', duration: 1800 })
    }
  },

  onShareAppMessage() {
    // 一旦用户从右上角菜单触发转发，立即解锁，2 分钟内有效
    this._unlockByShare()
    const report = this.data.latestReport
    const pct = report?.basic?.percentile
    const pctNum = (pct != null && !isNaN(pct)) ? pct : 90
    return {
      title: `我的颜值打败了 ${pctNum}% 的人，你敢测吗？AI 帮你打个真分`,
      path: '/pages/index/index',
      imageUrl: '/images/yanzhi1.jpg'
    }
  },

  onShareTimeline() {
    this._unlockByShare(true)
    const report = this.data.latestReport
    const pct = report?.basic?.percentile
    const pctNum = (pct != null && !isNaN(pct)) ? pct : 90
    return {
      title: `我的颜值打败了 ${pctNum}% 的人，你敢测吗？AI 帮你打个真分`,
      query: '',
      imageUrl: '/images/yanzhi1.jpg'
    }
  },

  generateTickerList() {
    const prefixes = ['小', '大', '阿', '懒', '快乐', '迷糊', '可爱', '甜甜', '温柔', '元气', '佛系', '资深', '野生', '倔强', '傲娇']
    const suffixes = ['橘猫', '桃子', '奶茶', '云朵', '草莓', '布丁', '西瓜', '棉花糖', '小熊', '柠檬', '椰子', '芒果', '松鼠', '鲸鱼', '星星', '泡芙', '果冻', '薯条', '饼干', '樱桃', '泡泡', '饭团', '抹茶', '可可', '豆豆', '糯米', '蜜桃', '柚子', '栗子', '奶酪']
    const actions = [
      '正在进行AI形象风格分析', '正在进行穿搭决策', '正在生成形象诊断报告',
      '正在查看发型推荐', '正在进行妆容分析', '正在获取风格建议', '正在进行色彩诊断'
    ]
    const shuffle = arr => arr.slice().sort(() => Math.random() - 0.5)
    const sPrefixes = shuffle(prefixes), sSuffixes = shuffle(suffixes), sActions = shuffle(actions)
    const list = []
    for (let i = 0; i < 50; i++) {
      const prefix = sPrefixes[i % sPrefixes.length]
      const suffix = sSuffixes[i % sSuffixes.length]
      const action = sActions[i % sActions.length]
      list.push(`${prefix}${suffix.charAt(0)}****${action}`)
    }
    this.setData({ tickerList: list })
  }
})
