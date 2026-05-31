// pages/index/index.js
const { wxLogin, ensureLogin, request, API, uploadImage } = require('../../utils/api')
const { formatDate, getScoreLevel, calcPercentile } = require('../../utils/format')
const taskState = require('../../utils/task-state')
const { mixinTaskBars } = require('../../utils/task-bars')

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

// 9 型第一印象人格定义（模块级常量，避免 Page 选项过滤导致 this 上访问不到）
const IMPRESSION_PERSONAS = {
  deer:    { id: 1, animal: '小鹿', style: '温柔亲和型', emoji: '🦌', image: '/images/9型人格/小鹿.jpg', tagline: '一眼就让人卸下防备的那种温度', traits: ['亲和力', '柔和'] },
  rabbit:  { id: 2, animal: '白兔', style: '天真元气型', emoji: '🐰', image: '/images/9型人格/兔子.jpg', tagline: '把"少女感"穿在了脸上', traits: ['少女感', '元气'] },
  lark:    { id: 3, animal: '云雀', style: '诗意氛围感', emoji: '🕊️', image: '/images/9型人格/云雀.jpg', tagline: '画面感选手，走过都自带 BGM', traits: ['氛围感', '空气感'] },
  fox:     { id: 4, animal: '灵狐', style: '风情张力型', emoji: '🦊', image: '/images/9型人格/灵狐.jpg', tagline: '不动声色，就能把人勾住', traits: ['魅惑感', '张力'] },
  phoenix: { id: 5, animal: '凤凰', style: '锋芒独特型', emoji: '🐦‍🔥', image: '/images/9型人格/凤凰.jpg', tagline: '记忆点拉满，撞脸概率几乎为 0', traits: ['记忆点', '锋芒'] },
  swan:    { id: 6, animal: '天鹅', style: '清冷高级型', emoji: '🦢', image: '/images/9型人格/天鹅.jpg', tagline: '骨相与气质都站在"高级"这一边', traits: ['高级感', '清冷'] },
  leopard: { id: 7, animal: '野豹', style: '冷艳精英型', emoji: '🐆', image: '/images/9型人格/野豹.jpg', tagline: '气场比五官先到一步', traits: ['冷艳', '精英'] },
  wolf:    { id: 8, animal: '孤狼', style: '特立独行型', emoji: '🐺', image: '/images/9型人格/孤狼.jpg', tagline: '不靠谁，每一帧都自成一派', traits: ['辨识度', '独立'] },
  cat:     { id: 9, animal: '猫咪', style: '灵动百搭型', emoji: '🐱', image: '/images/9型人格/猫咪.jpg', tagline: '没有短板，怎么拍都好看', traits: ['百搭', '灵动'] }
}

// 9 型原型向量 — 维度顺序：[亲和力, 魅惑感, 少女感, 氛围感, 记忆点, 高级感]
// 用于 z-score 余弦相似度匹配。猫咪不参与原型匹配（只在六维全部 ≥ 8.0 时单独命中）。
const PERSONA_PROTOTYPES = {
  deer:    [ 1.5, -0.5,  0.8,  0.3, -0.8, -0.5 ],
  rabbit:  [ 0.8, -1.0,  1.6,  0.2, -0.7, -0.8 ],
  lark:    [ 0.2, -0.3,  0.5,  1.5, -0.3,  0.6 ],
  fox:     [-0.3,  1.6, -0.5,  0.4,  0.6,  0.2 ],
  phoenix: [-0.2,  0.8, -0.3,  0.3,  1.6,  0.6 ],
  swan:    [-0.5, -0.3,  0.3,  0.8,  0.2,  1.6 ],
  leopard: [-1.2,  1.2, -1.0,  0.0,  0.5,  1.4 ],
  wolf:    [-1.5,  0.3, -1.2, -0.2,  1.4,  0.8 ]
}
const IMPRESSION_DIM_ORDER = ['approachability', 'allure', 'youthfulness', 'aura', 'distinctiveness', 'sophistication']

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
    slogan: '国内首款「反种草」形象诊断平台',
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
    consultTask: null,
    // ===== 报告详情态 =====
    activeTab: 'impression',
    tabKeys: ['impression', 'celebrity', 'optimize', 'hairmakeup', 'dna', 'style'],
    tabLabels: { impression: '第一印象', celebrity: '明星相似', optimize: '颜值&蜕变', hairmakeup: '发型&妆容', dna: '面部&骨相', style: '皮肤&风格' },
    shared: false,
    cdnImages: { hair: [], makeup: {}, advice: {}, roadmap: [] },
    currentReportId: '',
    // 假门测试：静态商品数据
    staticProducts: []
  },

  onLoad(options) {
    this.setData({ staticProducts: pickRandom3() })
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
    if (!this._taskBarsMixed) { mixinTaskBars(this, { onDone: (type) => { if (type === 'diagnose') this.loadLatestReport() } }); this._taskBarsMixed = true }
    this.startTaskBars()
  },

  onHide() {
    this.stopTaskBars()
    this._clearShareLockTimer()
  },

  onUnload() {
    this.stopTaskBars()
    this._clearShareLockTimer()
  },

  onTapDiagnoseTask() {
    // 兼容旧调用入口；统一委托 onTapTaskBar
    this.onTapTaskBar({ currentTarget: { dataset: { type: 'diagnose' } } })
  },

  // 覆盖 mixin 的 onTapTaskBar：诊断完成后留在首页，原地刷新
  onTapTaskBar(e) {
    const type = e.currentTarget.dataset.type
    const t = taskState.get(type)
    if (!t) return
    if (type === 'diagnose' && t.status === 'done' && t.resultUrl) {
      taskState.clear('diagnose')
      this.setData({ diagnoseTask: null })
      const m = /id=([^&]+)/.exec(t.resultUrl)
      if (m && m[1]) this.setData({ currentReportId: m[1] })
      this.loadLatestReport()
      return
    }
    // 其他类型 / 状态走默认逻辑
    if (t.status === 'done' && t.resultUrl) {
      taskState.clear(type)
      this.setData({ [type + 'Task']: null })
      wx.navigateTo({ url: t.resultUrl })
    } else if (t.status === 'error') {
      wx.showModal({ title: type === 'diagnose' ? '诊断失败' : '决策失败', content: t.errorMsg || '请重新尝试', confirmText: '关闭', showCancel: false })
      taskState.clear(type)
      this.setData({ [type + 'Task']: null })
    } else if (t.status === 'running') {
      wx.navigateTo({ url: type === 'diagnose' ? '/pages/diagnose/diagnose?view=1' : '/pages/consult-analyzing/consult-analyzing?view=1' })
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
    // 第一印象 · 魅力六边形：根据已有报告数据派生 6 维评分
    if (!target.modules) target.modules = {}
    target.modules.impression = this.computeImpression(target)
    this.setData({
      hasReport: true,
      latestReport: target,
      scoreLevel: getScoreLevel(target.basic?.overallScore || 0),
      activeTab: 'impression',
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
        case 'impression': this.drawImpressionRadar(ctx, width, height, report.modules.impression); break
        case 'dna': this.drawDNARadar(ctx, width, height, report.modules.dna); break
        case 'style': this.drawStyleRadar(ctx, width, height, report.modules.style); break
        case 'hairmakeup': this.drawHairMakeupRadar(ctx, width, height, report.modules.hairmakeup); break
        case 'optimize': this.drawOptimizeRadar(ctx, width, height, report.modules.optimize); break
      }
    })
  },

  // ====================== 第一印象 · 魅力六边形 ======================
  computeImpression(report) {
    const dna = report && report.modules && report.modules.dna
    const style = report && report.modules && report.modules.style
    const ageTag = (report && report.basic && (report.basic.tags || []).find(t => t && t.indexOf('视龄') === 0)) || ''
    const ageNum = parseInt((ageTag.match(/\d+/) || ['0'])[0], 10)

    // 已有 AI 输出数据时优先使用六维分数；persona 强制按新规则重算（修复旧规则全员猫咪问题）
    const existed = report && report.modules && report.modules.impression
    if (existed && Array.isArray(existed.scores) && existed.scores.length === 6 && typeof existed.attractIndex === 'number') {
      existed.persona = this._pickImpressionPersona(existed.scores, { dna, style, ageNum })
      existed.appealType = this._computeAppealType(existed.scores)
      return existed
    }
    const dims = [
      { key: 'approachability', name: '亲和力', desc: '笑感、眼神温度、面部柔和度', weight: 0.16 },
      { key: 'allure', name: '魅惑感', desc: '五官立体度、唇眼比、轮廓张力', weight: 0.18 },
      { key: 'youthfulness', name: '少女感', desc: '视龄、皮肤紧致度、五官圆润度', weight: 0.14 },
      { key: 'aura', name: '氛围感', desc: '眼神戏、面部空气感、情绪饱和', weight: 0.16 },
      { key: 'distinctiveness', name: '记忆点', desc: '五官辨识度、风格独特性', weight: 0.16 },
      { key: 'sophistication', name: '高级感', desc: '骨相清冷度、量感、线条利落度', weight: 0.20 }
    ]
    const base = (report.basic && report.basic.overallScore) || 7
    // 根据 reportId 生成稳定的伪随机偏移，保证同一报告每次进入数值一致
    const seedStr = String(report.id || (report.basic && report.basic.overallScore) || 'meeta')
    let seed = 0
    for (let i = 0; i < seedStr.length; i++) seed = (seed * 31 + seedStr.charCodeAt(i)) & 0x7fffffff
    function rnd(i) {
      const x = Math.sin(seed * 9301 + i * 49297) * 233280
      return x - Math.floor(x)
    }

    // —— 数据驱动信号：用 dna / style / 视龄 直接驱动六维差异（取代弱随机）——
    const lineStyle = (dna && dna.lineStyle) || ''
    const boneType = (dna && dna.boneType) || ''
    const mainStyle = (style && style.mainStyle) || ''
    const features = (dna && dna.faceFeatures) || []
    const featMap = {}
    features.forEach(f => { if (f && f.name) featMap[f.name] = f.score || 0 })
    const colgu = featMap['颧骨'] || 0
    const jaw   = featMap['下颌线'] || 0
    const brow  = featMap['眉骨'] || 0
    const nose  = featMap['鼻梁'] || 0
    const chin  = featMap['下巴'] || 0
    const massVal = (style && typeof style.mass === 'number') ? style.mass : 5

    const isSharp     = /利落|分明|锋|刚/.test(lineStyle)
    const isSoft      = /柔和|流畅|圆润/.test(lineStyle)
    const isBalanced  = /刚柔并济/.test(lineStyle)
    const isBoneDom   = /骨相/.test(boneType)
    const isSkinDom   = /皮相/.test(boneType)
    const isYoung     = ageNum > 0 && ageNum < 23
    const isMature    = ageNum >= 30
    const styleTag    = mainStyle || ''

    // 每维的"明确信号"（量级 ±2 左右），主要由数据决定，随机仅用于打破并列
    const signals = {
      approachability:
          (isSoft ? 1.2 : 0) + (isSharp ? -1.0 : 0)
        + (isSkinDom ? 0.6 : 0) + (isBoneDom ? -0.6 : 0)
        + (/可爱|甜|柔|少年|自然/.test(styleTag) ? 0.7 : 0)
        + (/戏剧|冷|高级|前卫/.test(styleTag) ? -0.8 : 0),
      allure:
          (jaw - 6) * 0.3 + (nose - 6) * 0.2
        + (isSharp ? 0.6 : 0) + (isSoft ? -0.4 : 0)
        + (/浪漫|戏剧|魅力/.test(styleTag) ? 1.0 : 0)
        + (/少年|甜美|可爱/.test(styleTag) ? -0.8 : 0)
        + (massVal >= 6 ? 0.4 : (massVal <= 3 ? -0.4 : 0)),
      youthfulness:
          (isYoung ? 1.5 : 0) + (isMature ? -1.4 : 0)
        + (isSkinDom ? 0.8 : 0) + (isBoneDom ? -0.6 : 0)
        + (/少年|自然|甜美|可爱/.test(styleTag) ? 0.8 : 0)
        + (/戏剧|优雅|前卫/.test(styleTag) ? -0.6 : 0),
      aura:
          (isBalanced ? 0.8 : 0)
        + (/优雅|浪漫|高级|戏剧/.test(styleTag) ? 0.8 : 0)
        + (/少年|可爱/.test(styleTag) ? -0.4 : 0)
        + (isMature ? 0.4 : 0),
      distinctiveness:
          (colgu - 6) * 0.3 + (brow - 6) * 0.25 + (chin - 6) * 0.2
        + (isBoneDom ? 0.8 : 0)
        + (/戏剧|前卫|异域/.test(styleTag) ? 1.2 : 0)
        + (/自然|甜美/.test(styleTag) ? -0.5 : 0),
      sophistication:
          (isSharp ? 1.0 : 0) + (isSoft ? -0.6 : 0)
        + (isBoneDom ? 1.0 : 0) + (isSkinDom ? -0.6 : 0)
        + (jaw - 6) * 0.2 + (colgu - 6) * 0.2
        + (/优雅|高级|戏剧|前卫/.test(styleTag) ? 0.8 : 0)
        + (/少年|甜美|可爱/.test(styleTag) ? -1.0 : 0)
        + (isMature ? 0.4 : 0)
    }
    const scores = dims.map((d, i) => {
      const sig = signals[d.key] || 0
      const noise = (rnd(i + 1) - 0.5) * 0.6 // ±0.3 小噪声打破并列
      let s = base + sig + noise
      s = Math.max(5.0, Math.min(9.7, s))
      return { key: d.key, name: d.name, desc: d.desc, score: Math.round(s * 10) / 10 }
    })
    // 基于报告数据生成"用户具体的形象原因"
    this._fillImpressionReasons(scores, { report, dna, style, ageNum })
    let weighted = 0
    scores.forEach((s, i) => { weighted += s.score * dims[i].weight })
    // 0-10 加权分映射到 0-100 吸引力指数
    const attractIndex = Math.max(0, Math.min(100, Math.round(weighted * 10)))
    // 简单的同龄人击败比例（非线性，越高越接近天花板）
    const percentile = Math.max(40, Math.min(99, Math.round(40 + (attractIndex - 60) * 1.4)))
    // 9 型人格（新规则：z-score 余弦相似度 + 语义加权）
    const persona = this._pickImpressionPersona(scores, { dna, style, ageNum })
    // 惊艳型 / 耐看型 标签
    const appealType = this._computeAppealType(scores)
    return { scores, attractIndex, percentile, persona, appealType }
  },

  // 惊艳型 / 耐看型：基于六维分数判定第一印象类型
  // 惊艳型 = 第一眼冲击力（魅惑感 + 记忆点 + 氛围感）更强
  // 耐看型 = 越看越好看（高级感 + 亲和力 + 少女感）更强
  _computeAppealType(scores) {
    const sMap = {}
    ;(scores || []).forEach(s => { sMap[s.key] = s.score || 0 })
    const striking = (sMap.allure || 0) + (sMap.distinctiveness || 0) + (sMap.aura || 0)
    const enduring = (sMap.sophistication || 0) + (sMap.approachability || 0) + (sMap.youthfulness || 0)
    return striking >= enduring ? '惊艳型' : '耐看型'
  },

  // 9 型第一印象人格定义（保留为页面属性以兼容老引用，实际使用模块级常量）
  _IMPRESSION_PERSONAS: IMPRESSION_PERSONAS,

  _pickImpressionPersona(scores, ctx) {
    ctx = ctx || {}
    // 维度顺序需与 PERSONA_PROTOTYPES 一致
    const arr = IMPRESSION_DIM_ORDER.map(k => {
      const s = scores.find(x => x.key === k)
      return s ? s.score : 0
    })
    const mean = arr.reduce((s, v) => s + v, 0) / arr.length
    const variance = arr.reduce((s, v) => s + (v - mean) * (v - mean), 0) / arr.length
    const stdDev = Math.sqrt(variance) || 1e-6
    const minScore = Math.min.apply(null, arr)

    // 1) 真·猫咪：六维 min ≥ 8.0（极稀有，预期 <3%）
    if (minScore >= 8.0) {
      return Object.assign({ key: 'cat' }, IMPRESSION_PERSONAS.cat)
    }

    // 2) z-score 形态匹配：把分数标准化只看"形状"，与 8 个原型计算余弦相似度
    const userZ = arr.map(v => (v - mean) / stdDev)
    function dot(a, b) { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s }
    function norm(a) { return Math.sqrt(dot(a, a)) }
    function cosine(a, b) { return dot(a, b) / (norm(a) * norm(b) + 1e-6) }

    // 3) 语义偏置：dna / style / 视龄 给某些人格小幅加分
    const lineStyle = (ctx.dna && ctx.dna.lineStyle) || ''
    const boneType  = (ctx.dna && ctx.dna.boneType) || ''
    const mainStyle = (ctx.style && ctx.style.mainStyle) || ''
    const ageNum    = ctx.ageNum || 0
    const boost = { deer:0, rabbit:0, lark:0, fox:0, phoenix:0, swan:0, leopard:0, wolf:0 }

    if (/利落|分明|锋|刚/.test(lineStyle)) { boost.swan += 0.06; boost.leopard += 0.06; boost.wolf += 0.05 }
    if (/柔和|流畅|圆润/.test(lineStyle)) { boost.deer += 0.06; boost.rabbit += 0.05; boost.lark += 0.04 }
    if (/骨相/.test(boneType))            { boost.swan += 0.05; boost.leopard += 0.05; boost.wolf += 0.04 }
    if (/皮相/.test(boneType))            { boost.deer += 0.05; boost.rabbit += 0.05 }
    if (/戏剧|前卫/.test(mainStyle))      { boost.phoenix += 0.07; boost.leopard += 0.05 }
    if (/浪漫|魅力/.test(mainStyle))      { boost.fox += 0.07; boost.swan += 0.04 }
    if (/少年|自然/.test(mainStyle))      { boost.rabbit += 0.05; boost.wolf += 0.04 }
    if (/优雅|高级/.test(mainStyle))      { boost.swan += 0.07; boost.lark += 0.04 }
    if (/可爱|甜美/.test(mainStyle))      { boost.rabbit += 0.07; boost.deer += 0.05 }
    if (ageNum > 0 && ageNum < 23)        { boost.rabbit += 0.04; boost.deer += 0.03 }
    if (ageNum >= 30)                     { boost.swan += 0.03; boost.leopard += 0.03 }

    let bestKey = 'deer'
    let bestScore = -Infinity
    Object.keys(PERSONA_PROTOTYPES).forEach(k => {
      const sim = cosine(userZ, PERSONA_PROTOTYPES[k])
      const total = sim + (boost[k] || 0)
      if (total > bestScore) { bestScore = total; bestKey = k }
    })
    return Object.assign({ key: bestKey }, IMPRESSION_PERSONAS[bestKey])
  },

  // 根据 dna / style / 视龄 等具体数据，为每个维度生成"形象原因"句子
  _fillImpressionReasons(scores, ctx) {
    const { dna, style, ageNum } = ctx
    const faceType = (dna && dna.faceType) || ''
    const boneType = (dna && dna.boneType) || ''
    const lineStyle = (dna && dna.lineStyle) || ''
    const colorIntensity = (dna && dna.colorIntensity) || ''
    const faceScore = (dna && parseFloat(dna.faceScore)) || 0
    const visualAge = (dna && dna.visualAge) || ''
    // AI 实际返回的 faceFeatures 名称：颧骨/下颌线/眉骨/鼻梁/下巴
    const features = (dna && dna.faceFeatures) || []
    const feat = {}; const featDesc = {}
    features.forEach(f => { if (f && f.name) { feat[f.name] = f.score || 0; featDesc[f.name] = f.desc || '' } })
    const mainStyle = (style && style.mainStyle) || ''
    const subStyles = (style && style.subStyles) || []
    const skinType = (style && style.skinType) || ''
    const season = (style && style.season) || ''
    const mass = (style && typeof style.mass === 'number') ? style.mass : 0
    const brightness = (style && style.brightness) || 0
    const purity = (style && style.purity) || 0

    function level(s) { return s >= 8.5 ? 'H' : s >= 7 ? 'M' : 'L' }
    // 从 AI 真实返回的五官特征中取最高分特征
    function pickTopFeature(nameList) {
      let top = ''; let max = 0
      nameList.forEach(n => { if ((feat[n] || 0) > max) { max = feat[n]; top = n } })
      return max >= 7 ? top : ''
    }
    // 返回所有评分 >= threshold 的特征名
    function highFeatures(threshold) {
      return features.filter(f => (f.score || 0) >= threshold).map(f => f.name)
    }
    // 返回评分最低的特征名（软肋）
    function weakFeature() {
      let min = 999; let name = ''
      features.forEach(f => { if ((f.score || 0) < min) { min = f.score; name = f.name } })
      return min <= 5 ? name : ''
    }

    const reasonBuilders = {
      approachability(s) {
        const lv = level(s)
        const tags = []
        // 脸型：圆润/柔和类 → 亲和力高
        if (/圆|鹅蛋|心形|心型|椭圆/.test(faceType)) tags.push(`${faceType}的柔和轮廓天然没有距离感`)
        else if (/方|长|菱|钻石/.test(faceType)) tags.push(`${faceType}轮廓给人感觉较强势，亲和力需造型来弥补`)
        // 线条风格
        if (/柔和|流畅|圆润/.test(lineStyle)) tags.push(`面部${lineStyle}，初见不带攻击性`)
        else if (/利落|分明|锋|刚/.test(lineStyle)) tags.push(`面部线条${lineStyle}，初见有点距离感`)
        // 色彩浓淡：淡颜更亲和
        if (/淡/.test(colorIntensity)) tags.push('淡颜五官观感柔软，更易建立信任')
        else if (/浓/.test(colorIntensity)) tags.push('浓颜五官冲击力强，亲和与魅惑二选一')
        // 下颌线分数：圆润型（低分 = 圆）→ 亲和
        const jawScore = feat['下颌线'] || 0
        if (jawScore && jawScore <= 5) tags.push('下颌线弧度圆润，微笑时格外温柔')
        else if (jawScore >= 8) tags.push('下颌线清晰锐利，气场强过亲和感')
        // 暖皮加亲和
        if (/暖/.test(skinType)) tags.push(`${skinType}底色，笑起来很有感染力`)
        if (!tags.length) tags.push('五官节奏平稳，不带明显攻击性，但记忆点也偏弱')
        const prefix = lv === 'H' ? '第一眼就让人卸下防备——' : lv === 'M' ? '初印象是「不锋利、可接近」——' : '初次见面会有一点疏离感——'
        const suffix = lv === 'L' ? '；建议用暖色穿搭、柔和发型、微笑眼妆进一步化解。' : '。'
        return prefix + tags.slice(0, 3).join('，') + suffix
      },
      allure(s) {
        const lv = level(s)
        const tags = []
        // 骨相特征是魅惑感核心
        const jawScore = feat['下颌线'] || 0; const noseScore = feat['鼻梁'] || 0
        const boneScore = feat['眉骨'] || 0; const cheekScore = feat['颧骨'] || 0
        if (jawScore >= 7) tags.push(`下颌线${featDesc['下颌线'] ? '（' + featDesc['下颌线'].slice(0, 12) + '…）' : '分明'}，轮廓张力十足`)
        if (noseScore >= 7) tags.push(`鼻梁${noseScore >= 8.5 ? '挺拔精致，立体感极强' : '有高度，增添面部起伏'}`)
        if (boneScore >= 7) tags.push(`眉骨${boneScore >= 8 ? '骨感突出，眼窝深邃' : '有轮廓，眼神更有力量'}`)
        if (cheekScore >= 7) tags.push(`颧骨适度突出，侧脸颧颊比例令人着迷`)
        // 浓颜 = 视觉冲击力强
        if (/浓/.test(colorIntensity)) tags.push(`${colorIntensity}五官对比度高，视觉上更抓人`)
        // 线条风格
        if (/利落|分明|锋|刚/.test(lineStyle)) tags.push(`${lineStyle}面部线条带着吸引人的张力`)
        if (/骨相/.test(boneType)) tags.push(`${boneType}气质，骨相本身就是最大的魅力加持`)
        if (!tags.length) {
          if (faceScore >= 7) tags.push('五官精致协调，整体散发自然吸引力')
          else tags.push('五官和谐但起伏偏少，魅惑感偏含蓄')
        }
        const prefix = lv === 'H' ? '镜头下气场拉满，自带「多看一眼」的引力——' : lv === 'M' ? '魅惑感属于"日常耐看、越看越有"路线——' : '魅惑感偏含蓄，更适合温柔治愈的方向——'
        const suffix = lv === 'L' ? '；深色眼妆、轮廓修容、大地色唇是快速放大张力的捷径。' : '。'
        return prefix + tags.slice(0, 3).join('，') + suffix
      },
      youthfulness(s) {
        const lv = level(s)
        const tags = []
        // 视龄直接说出来
        if (visualAge) tags.push(`视觉年龄约 ${visualAge}`)
        else if (ageNum > 0) tags.push(`视觉年龄约 ${ageNum} 岁`)
        // 脸型
        if (/圆|心形|心型|鹅蛋|椭圆/.test(faceType)) tags.push(`${faceType}保有天然的圆润感`)
        else if (/方|长|菱/.test(faceType)) tags.push(`${faceType}线条感成熟，少女感退位成熟感上位`)
        // 线条
        if (/柔和|流畅|圆润/.test(lineStyle)) tags.push('线条圆融，不带岁月感的锐利')
        // 皮肤明度
        if (brightness >= 7) tags.push(`皮肤明度 ${brightness} 分，气色透亮显嫩`)
        else if (brightness && brightness <= 5) tags.push(`皮肤明度 ${brightness} 分，肤色状态会拉低视觉年龄感`)
        // 皮肤纯净度
        if (purity >= 7) tags.push('皮肤纯净细腻，底色加分不少')
        // 肤色类型
        if (/暖/.test(skinType)) tags.push(`${skinType}气色活泼，更显鲜嫩`)
        else if (/冷/.test(skinType)) tags.push(`${skinType}底色更显清冷，少女感让位成熟感`)
        if (!tags.length) tags.push('整体气质介于青春与成熟之间')
        const prefix = lv === 'H' ? '少女感是你的天然王牌——' : lv === 'M' ? '少女感与气质感保持平衡——' : '成熟感是你更大的优势——'
        const suffix = lv === 'L' ? '；走清冷高级路线，比装嫩更高分。' : '。'
        return prefix + tags.slice(0, 3).join('，') + suffix
      },
      aura(s) {
        const lv = level(s)
        const tags = []
        // 主风格 + 季节色彩直接给文案素材
        if (mainStyle) tags.push(`${mainStyle}的风格调性让整体有明确的气场方向`)
        if (season) tags.push(`${season}色彩季型的配色会大幅强化你的氛围感`)
        // 子风格补充
        const sub = subStyles.find(s => /文艺|复古|知性|前卫|异域/.test(s.name || ''))
        if (sub) tags.push(`${sub.name}的副风格给你增添了层次`)
        // 眉骨/颧骨高 → 眼神有戏
        const boneScore = feat['眉骨'] || 0
        if (boneScore >= 7) tags.push('眉骨有立体感，眼神自然带戏')
        // 量感
        if (mass >= 7) tags.push(`量感 ${mass} 分，足以撑起强烈的视觉存在感`)
        else if (mass && mass <= 4) tags.push(`量感偏轻（${mass} 分），自带空灵松弛的氛围`)
        // 浓颜 = 氛围感强
        if (/浓/.test(colorIntensity)) tags.push('浓颜五官情绪张力强，轻松制造氛围')
        if (!tags.length) tags.push('整体氛围完整，但风格感还可以进一步锐化')
        const prefix = lv === 'H' ? '走进画面就有故事感——' : lv === 'M' ? '氛围感稳定，但还差一点点「只属于你」的符号——' : '氛围感偏日常，更接近可爱/邻家系——'
        const suffix = lv === 'L' ? '；在妆容留白、配色统一、眼神管理上做精准强化，氛围感会快速上来。' : '。'
        return prefix + tags.slice(0, 3).join('，') + suffix
      },
      distinctiveness(s) {
        const lv = level(s)
        const tags = []
        // 找 AI 给分最高的骨相特征当记忆锚点
        const topFeat = pickTopFeature(['颧骨', '下颌线', '眉骨', '鼻梁', '下巴'])
        if (topFeat) {
          const sc = feat[topFeat]
          tags.push(`${topFeat}是你最强的辨识度锚点（${sc} 分）${featDesc[topFeat] ? '——' + featDesc[topFeat].slice(0, 14) : ''}`)
        }
        // 脸型独特性
        if (/菱|钻石|心形|倒三角/.test(faceType)) tags.push(`${faceType}在人群里极低撞脸率`)
        else if (faceType) tags.push(`${faceType}让整脸轮廓有记忆点`)
        // 骨相型 = 强记忆点
        if (/骨相/.test(boneType)) tags.push('骨相型五官本身就自带高辨识度')
        // 主风格独特性
        if (mainStyle && !/自然|清新|简约/.test(mainStyle)) tags.push(`${mainStyle}风格少见，见一面就难忘`)
        // 浓颜记忆点强
        if (/浓/.test(colorIntensity)) tags.push('浓颜五官高对比度，一眼就被记住')
        // 弱特征
        const weak = weakFeature()
        if (!tags.length) {
          if (weak) tags.push(`${weak}偏弱，整体均衡但缺少一个「主角」五官`)
          else tags.push('五官比例协调，但缺乏一个能被描述出来的视觉焦点')
        }
        const prefix = lv === 'H' ? '是那种「看一次就能描述出来」的脸——' : lv === 'M' ? '记忆点属于「看第二眼才会发现」型——' : '五官偏均衡，记忆点有待强化——'
        const suffix = lv === 'L' ? '；主动用发型、眼妆或一件标志性单品制造视觉锚点。' : '。'
        return prefix + tags.slice(0, 3).join('，') + suffix
      },
      sophistication(s) {
        const lv = level(s)
        const tags = []
        // 骨相特征：下颌线、颧骨、鼻梁是高级感核心
        const jawScore = feat['下颌线'] || 0; const cheekScore = feat['颧骨'] || 0; const noseScore = feat['鼻梁'] || 0; const chinScore = feat['下巴'] || 0
        if (jawScore >= 7) tags.push(`下颌线 ${jawScore} 分${featDesc['下颌线'] ? '（' + featDesc['下颌线'].slice(0, 10) + '…）' : '，轮廓清晰'}，高级感直接来自骨相`)
        else if (jawScore && jawScore <= 5) tags.push('下颌线偏圆润，会削减一些骨相高级感')
        if (cheekScore >= 7) tags.push(`颧骨适度高挑，侧脸有雕塑感`)
        if (noseScore >= 7) tags.push(`鼻梁${noseScore >= 8.5 ? '挺拔精致，立体感顶级' : '有高度，撑起面部立体结构'}`)
        if (chinScore >= 7) tags.push('下巴线条流畅，侧颜极加分')
        // 线条风格
        if (/利落|分明|清冷|骨感|锐|直线/.test(lineStyle)) tags.push(`面部${lineStyle}，自带清冷的高级距离感`)
        // 骨相型
        if (/骨相/.test(boneType)) tags.push('骨相主导型——岁月越久越耐看')
        // 量感
        if (mass >= 7) tags.push(`量感 ${mass} 分，极简造型也能镇场`)
        // 主风格
        if (/高级|清冷|文艺|知性|极简/.test(mainStyle)) tags.push(`${mainStyle}风格与高级感相辅相成`)
        // 冷皮 = 更清冷高级
        if (/冷/.test(skinType)) tags.push(`${skinType}底色天然带着一丝清冷高级感`)
        if (!tags.length) {
          if (faceScore >= 7) tags.push('整体精致感在线，但高级感还需靠造型来诠释')
          else tags.push('五官协调，高级感不是天然标签，需要靠穿搭和妆容来定义')
        }
        const prefix = lv === 'H' ? '骨相和气场都站在「高级」这一边——' : lv === 'M' ? '高级感在线，少女/甜感会拉走一点权重——' : '高级感不是你天然的标签，但可以通过造型后天习得——'
        const suffix = lv === 'L' ? '；简约配色、利落剪裁、低饱和哑光妆是最快捷径。' : '。'
        return prefix + tags.slice(0, 3).join('，') + suffix
      }
    }
    scores.forEach(s => {
      const fn = reasonBuilders[s.key]
      s.reason = fn ? fn(s.score) : s.desc
    })
  },

  drawImpressionRadar(ctx, w, h, data) {
    if (!data || !Array.isArray(data.scores)) return
    const labels = data.scores.map(s => s.name)
    const scores = data.scores.map(s => s.score)
    this._drawRadar(ctx, w, h, labels, scores, '#B89968', '魅力六维')
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

  // 跳转穿搭决策Tab
  onGoOutfitConsult() {
    wx.switchTab({ url: '/pages/outfit/outfit' })
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

        // 整体冷调底色（淡冰蓝渐变）
        const pageBg = ctx.createLinearGradient(0, 0, 0, h)
        pageBg.addColorStop(0, '#F2F4FF')
        pageBg.addColorStop(1, '#EAF1FA')
        ctx.fillStyle = pageBg; ctx.fillRect(0, 0, w, h)
        const headerH = 130
        // 酷炫赛博渐变：深夜空 → 电紫 → 品红 → 青
        const grad = ctx.createLinearGradient(0, 0, w, headerH)
        grad.addColorStop(0, '#0F0C29')
        grad.addColorStop(0.35, '#7B2CBF')
        grad.addColorStop(0.7, '#FF3CAC')
        grad.addColorStop(1, '#00D4FF')
        ctx.fillStyle = grad; ctx.fillRect(0, 0, w, headerH)

        // 装饰：右上 + 左下 大光晕
        ctx.fillStyle = 'rgba(255,255,255,0.18)'
        ctx.beginPath(); ctx.arc(w - 30, 25, 36, 0, Math.PI * 2); ctx.fill()
        ctx.fillStyle = 'rgba(0,212,255,0.22)'
        ctx.beginPath(); ctx.arc(28, headerH - 20, 28, 0, Math.PI * 2); ctx.fill()
        // 底部高亮霓虹线
        const lineGrad = ctx.createLinearGradient(0, 0, w, 0)
        lineGrad.addColorStop(0, 'rgba(0,212,255,0)')
        lineGrad.addColorStop(0.5, 'rgba(255,255,255,0.85)')
        lineGrad.addColorStop(1, 'rgba(255,60,172,0)')
        ctx.fillStyle = lineGrad
        ctx.fillRect(0, headerH - 1.5, w, 1.5)

        // 标题（带轻微辉光）
        ctx.shadowColor = 'rgba(0,212,255,0.55)'; ctx.shadowBlur = 10
        ctx.fillStyle = '#fff'; ctx.font = 'bold 22px sans-serif'; ctx.textAlign = 'center'
        ctx.fillText('✦ 形象风格诊断报告', w / 2, 50)
        ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0
        ctx.font = '11px sans-serif'; ctx.fillStyle = 'rgba(255,255,255,0.88)'
        const now = new Date()
        const dateStr = `${now.getFullYear()}.${String(now.getMonth() + 1).padStart(2, '0')}.${String(now.getDate()).padStart(2, '0')}  ·  美哒 Meeta`
        ctx.fillText(dateStr, w / 2, 76)

        const scoreCardY = headerH - 26, scoreCardH = 110
        ctx.shadowColor = 'rgba(123,44,191,0.22)'; ctx.shadowBlur = 14; ctx.shadowOffsetY = 4
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

        // ==================== 第一印象完整模块 ====================
        const imp = report.modules && report.modules.impression
        if (imp) {
          // —— 标题行：✦ 第一印象 · X型 + 惊艳/耐看胶囊 ——
          ctx.font = 'bold 14px sans-serif'; ctx.fillStyle = '#3D2C28'; ctx.textAlign = 'left'
          const titleText = '✦ 第一印象' + (imp.persona ? ' · ' + (imp.persona.animal || '') + '型' : '')
          ctx.fillText(titleText, p, y + 16)
          const titleW = ctx.measureText(titleText).width
          if (imp.appealType) {
            ctx.font = 'bold 10px sans-serif'
            const tagText = imp.appealType
            const tagW = ctx.measureText(tagText).width + 16
            const tagX = p + titleW + 8
            const tagY = y + 4
            const tg = ctx.createLinearGradient(tagX, tagY, tagX + tagW, tagY + 18)
            if (imp.appealType === '惊艳型') {
              tg.addColorStop(0, '#C77DFF'); tg.addColorStop(0.5, '#E5A3FF'); tg.addColorStop(1, '#FFB16B')
            } else {
              tg.addColorStop(0, '#1E88E5'); tg.addColorStop(0.5, '#4FC3F7'); tg.addColorStop(1, '#4DD0E1')
            }
            ctx.fillStyle = tg
            this._roundRect(ctx, tagX, tagY, tagW, 18, 9); ctx.fill()
            ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.font = 'bold 10px sans-serif'
            ctx.fillText(tagText, tagX + tagW / 2, tagY + 13)
            ctx.textAlign = 'left'
          }
          y += 28

          // —— 吸引力指数 ——
          ctx.font = 'bold 32px sans-serif'
          const aiGrad = ctx.createLinearGradient(p, y, p, y + 32)
          aiGrad.addColorStop(0, '#B76E79'); aiGrad.addColorStop(1, '#E8A87C')
          ctx.fillStyle = aiGrad
          const aiText = String(imp.attractIndex || 0)
          ctx.fillText(aiText, p, y + 28)
          const aiW = ctx.measureText(aiText).width
          ctx.font = '11px sans-serif'; ctx.fillStyle = '#B89E8F'
          ctx.fillText('/100', p + aiW + 4, y + 28)
          ctx.font = '9.5px sans-serif'; ctx.fillStyle = '#888'
          ctx.fillText('ATTRACTION INDEX · 吸引力指数', p, y + 44)
          if (imp.percentile) {
            ctx.font = 'bold 11px sans-serif'; ctx.fillStyle = '#B76E79'; ctx.textAlign = 'right'
            ctx.fillText(`▲ 击败 ${imp.percentile}% 同龄人`, p + cw, y + 28)
            ctx.textAlign = 'left'
          }
          y += 56

          // —— 9 型人格 hero 块 ——
          if (imp.persona) {
            const persona = imp.persona
            const phH = 92
            const phGrad = ctx.createLinearGradient(p, y, p + cw, y + phH)
            phGrad.addColorStop(0, 'rgba(229,201,136,0.25)'); phGrad.addColorStop(1, 'rgba(232,168,124,0.10)')
            ctx.fillStyle = phGrad
            this._roundRect(ctx, p, y, cw, phH, 12); ctx.fill()
            ctx.strokeStyle = 'rgba(212,184,131,0.40)'; ctx.lineWidth = 1
            this._roundRect(ctx, p, y, cw, phH, 12); ctx.stroke()

            const phR = 28
            const phCX = p + 16 + phR
            const phCY = y + phH / 2
            let drewPhoto = false
            if (persona.image) {
              const pImg = await this._loadImage(canvas, persona.image)
              if (pImg) {
                ctx.beginPath(); ctx.arc(phCX, phCY, phR + 2, 0, Math.PI * 2)
                const rg = ctx.createLinearGradient(phCX - phR, phCY - phR, phCX + phR, phCY + phR)
                rg.addColorStop(0, '#E5C988'); rg.addColorStop(1, '#B89968')
                ctx.fillStyle = rg; ctx.fill()
                ctx.save(); ctx.beginPath()
                ctx.arc(phCX, phCY, phR, 0, Math.PI * 2); ctx.clip()
                ctx.drawImage(pImg, phCX - phR, phCY - phR, phR * 2, phR * 2)
                ctx.restore()
                drewPhoto = true
              }
            }
            if (!drewPhoto && persona.emoji) {
              ctx.fillStyle = 'rgba(255,255,255,0.55)'
              ctx.beginPath(); ctx.arc(phCX, phCY, phR, 0, Math.PI * 2); ctx.fill()
              ctx.font = '38px sans-serif'; ctx.textAlign = 'center'
              ctx.fillText(persona.emoji, phCX, phCY + 14)
              ctx.textAlign = 'left'
            }

            const tx = phCX + phR + 16
            ctx.font = 'bold 17px sans-serif'; ctx.fillStyle = '#8B4F58'
            ctx.fillText(persona.animal || '', tx, y + 26)
            const aW = ctx.measureText(persona.animal || '').width
            ctx.font = '12px sans-serif'; ctx.fillStyle = '#A07876'
            ctx.fillText('｜' + (persona.style || ''), tx + aW + 2, y + 26)
            if (persona.tagline) {
              ctx.font = '10.5px sans-serif'; ctx.fillStyle = '#6B5550'
              const tagMaxW = (p + cw - 12) - tx
              const tlLines = this._wrapText(ctx, persona.tagline, tagMaxW, 2)
              tlLines.forEach((line, i) => ctx.fillText(line, tx, y + 44 + i * 14))
            }
            if (persona.traits && persona.traits.length) {
              ctx.font = 'bold 9px sans-serif'
              let trX = tx
              const trY = y + phH - 18
              persona.traits.slice(0, 3).forEach(tr => {
                const trText = '# ' + tr
                const trW = ctx.measureText(trText).width + 12
                if (trX + trW > p + cw - 8) return
                ctx.fillStyle = 'rgba(229,201,136,0.42)'
                this._roundRect(ctx, trX, trY, trW, 13, 6); ctx.fill()
                ctx.fillStyle = '#8B6B3A'; ctx.textAlign = 'center'
                ctx.fillText(trText, trX + trW / 2, trY + 9)
                ctx.textAlign = 'left'
                trX += trW + 6
              })
            }
            y += phH + 14
          }

          // —— 六维评分 ——
          const scores = imp.scores || []
          if (scores.length) {
            ctx.font = 'bold 12px sans-serif'; ctx.fillStyle = '#3D2C28'; ctx.textAlign = 'left'
            ctx.fillText('六维评分', p, y + 14)
            y += 22
            scores.forEach((s, i) => {
              const rowY = y + i * 22
              ctx.font = '11px sans-serif'; ctx.fillStyle = '#5C4A45'; ctx.textAlign = 'left'
              ctx.fillText(s.name || '', p, rowY + 13)
              const barX = p + 60
              const barW = cw - 60 - 36
              const barY = rowY + 6
              ctx.fillStyle = 'rgba(183,110,121,0.10)'
              this._roundRect(ctx, barX, barY, barW, 7, 3.5); ctx.fill()
              const sv = Math.max(0, Math.min(10, Number(s.score) || 0))
              const fillW = barW * (sv / 10)
              if (fillW > 0) {
                const bg = ctx.createLinearGradient(barX, barY, barX + fillW, barY + 7)
                bg.addColorStop(0, '#E8A87C'); bg.addColorStop(1, '#B76E79')
                ctx.fillStyle = bg
                this._roundRect(ctx, barX, barY, fillW, 7, 3.5); ctx.fill()
              }
              ctx.font = 'bold 11px sans-serif'; ctx.fillStyle = '#8B4F58'; ctx.textAlign = 'right'
              ctx.fillText(sv.toFixed(1), p + cw, rowY + 13)
              ctx.textAlign = 'left'
            })
            y += scores.length * 22 + 10
          }

          // —— 维度解析 ——
          if (scores.length) {
            ctx.font = 'bold 12px sans-serif'; ctx.fillStyle = '#3D2C28'; ctx.textAlign = 'left'
            ctx.fillText('维度解析 · 你的形象原因', p, y + 14)
            y += 24
            scores.forEach(s => {
              ctx.font = 'bold 11px sans-serif'; ctx.fillStyle = '#8B4F58'; ctx.textAlign = 'left'
              ctx.fillText(s.name || '', p, y + 12)
              ctx.font = '10px sans-serif'; ctx.fillStyle = '#B89E8F'; ctx.textAlign = 'right'
              ctx.fillText(`${(Number(s.score) || 0).toFixed(1)}/10`, p + cw, y + 12)
              ctx.textAlign = 'left'
              y += 16
              if (s.desc) {
                ctx.font = '9.5px sans-serif'; ctx.fillStyle = '#B89E8F'
                ctx.fillText(s.desc, p, y + 11)
                y += 14
              }
              if (s.reason) {
                ctx.font = '10.5px sans-serif'; ctx.fillStyle = '#5C4A45'
                const lines = this._wrapText(ctx, s.reason, cw, 5)
                lines.forEach(line => {
                  ctx.fillText(line, p, y + 12)
                  y += 15
                })
              }
              y += 8
            })
          }

          // —— 关键洞察 ——
          if (imp.keyInsight) {
            ctx.font = '11px sans-serif'
            const lines = this._wrapText(ctx, imp.keyInsight, cw - 28, 5)
            const insightH = 32 + lines.length * 16 + 4
            const ig = ctx.createLinearGradient(p, y, p + cw, y + insightH)
            ig.addColorStop(0, '#FFF3E0'); ig.addColorStop(1, '#FFE4EC')
            ctx.fillStyle = ig
            this._roundRect(ctx, p, y, cw, insightH, 12); ctx.fill()
            ctx.strokeStyle = 'rgba(183,110,121,0.20)'; ctx.lineWidth = 1
            this._roundRect(ctx, p, y, cw, insightH, 12); ctx.stroke()
            ctx.font = 'bold 11px sans-serif'; ctx.fillStyle = '#B76E79'; ctx.textAlign = 'left'
            ctx.fillText('✦ 关键洞察', p + 14, y + 20)
            ctx.font = '10.5px sans-serif'; ctx.fillStyle = '#6B5550'
            lines.forEach((line, i) => ctx.fillText(line, p + 14, y + 40 + i * 16))
            y += insightH + 12
          }
        }

        // ==================== 页脚（赛博渐变呼应头部） ====================
        const footerH = 56
        const footerY = y + 8
        const fGrad = ctx.createLinearGradient(p, footerY, p + cw, footerY + footerH)
        fGrad.addColorStop(0, '#0F0C29')
        fGrad.addColorStop(0.5, '#7B2CBF')
        fGrad.addColorStop(1, '#00D4FF')
        ctx.fillStyle = fGrad
        this._roundRect(ctx, p, footerY, cw, footerH, 12); ctx.fill()
        // 顶部霓虹高光线
        const fLine = ctx.createLinearGradient(p, 0, p + cw, 0)
        fLine.addColorStop(0, 'rgba(255,60,172,0)')
        fLine.addColorStop(0.5, 'rgba(255,255,255,0.85)')
        fLine.addColorStop(1, 'rgba(0,212,255,0)')
        ctx.fillStyle = fLine
        ctx.fillRect(p + 12, footerY + 1, cw - 24, 1.2)
        ctx.shadowColor = 'rgba(0,212,255,0.5)'; ctx.shadowBlur = 8
        ctx.font = 'bold 15px sans-serif'; ctx.fillStyle = '#fff'; ctx.textAlign = 'center'
        ctx.fillText('美哒 Meeta', w / 2, footerY + 24)
        ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0
        ctx.font = '10px sans-serif'; ctx.fillStyle = 'rgba(255,255,255,0.88)'
        ctx.fillText('反种草形象风格诊断', w / 2, footerY + 42)
        const finalY = Math.min(footerY + footerH + 16, h)

        setTimeout(() => {
          wx.canvasToTempFilePath({
            canvas,
            fileType: 'jpg',
            quality: 0.9,
            x: 0,
            y: 0,
            width: w,
            height: finalY,
            destWidth: w * dpr,
            destHeight: finalY * dpr,
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

  // 转发样式池：两种文案/封面随机出现，让分享卡更有新鲜感
  _pickShareCard() {
    const report = this.data.latestReport
    const pct = report?.basic?.percentile
    const pctNum = (pct != null && !isNaN(pct)) ? pct : 90
    const impr = report?.modules?.impression
    const idx = impr?.attractIndex || 88
    const styles = [
      {
        title: `我的颜值打败了 ${pctNum}% 的人，你敢测吗？帮你打个真分`,
        imageUrl: '/images/yanzhi1.jpg'
      },
      {
        title: '原来别人眼里的我，第一印象是「__」',
        imageUrl: '/images/第一印象.jpg'
      }
    ]
    return styles[Math.floor(Math.random() * styles.length)]
  },

  onShareAppMessage() {
    // 一旦用户从右上角菜单触发转发，立即解锁，2 分钟内有效
    this._unlockByShare()
    const card = this._pickShareCard()
    return {
      title: card.title,
      path: '/pages/index/index',
      imageUrl: card.imageUrl
    }
  },

  onShareTimeline() {
    this._unlockByShare(true)
    const card = this._pickShareCard()
    return {
      title: card.title,
      query: '',
      imageUrl: card.imageUrl
    }
  },

  generateTickerList() {
    const prefixes = ['小', '大', '阿', '懒', '快乐', '迷糊', '可爱', '甜甜', '温柔', '元气', '佛系', '资深', '野生', '倔强', '傲娇']
    const suffixes = ['橘猫', '桃子', '奶茶', '云朵', '草莓', '布丁', '西瓜', '棉花糖', '小熊', '柠檬', '椰子', '芒果', '松鼠', '鲸鱼', '星星', '泡芙', '果冻', '薯条', '饼干', '樱桃', '泡泡', '饭团', '抹茶', '可可', '豆豆', '糯米', '蜜桃', '柚子', '栗子', '奶酪']
    const actions = [
      '正在进行形象风格分析', '正在进行穿搭决策', '正在生成形象诊断报告',
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
  },

  // 假门测试：首页商品卡片点击
  onPreviewProductImage(e) {
    const src = e.currentTarget.dataset.src
    const urls = this.data.staticProducts.map(p => p.image)
    wx.previewImage({ current: src, urls })
  },

  onIndexProductTap(e) {
    const id = e.currentTarget.dataset.id
    const product = (this.data.staticProducts || []).find(p => p.id === id)
    // 本地埋点（兜底）
    const key = 'shopRecClickCount'
    wx.setStorageSync(key, (wx.getStorageSync(key) || 0) + 1)
    const logs = wx.getStorageSync('shopRecClickLogs') || []
    logs.push({ id, p: 'index', t: Date.now() })
    wx.setStorageSync('shopRecClickLogs', logs)
    // 服务端上报（静默，不影响用户体验）
    request(API.track, {
      method: 'POST',
      data: { event: 'product_click', productId: id, productName: product ? product.name : '', page: 'index' }
    }).catch(() => {})

    wx.showModal({
      title: '好物推荐即将上线',
      content: '我们正在接入精选好物，点击即代表你的期待！感谢你的反馈 🥰',
      showCancel: false,
      confirmText: '期待上线'
    })
  }
})
