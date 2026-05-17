// 报告数据结构定义与校验

// 报告期望的完整结构
const REPORT_SCHEMA = {
  basic: {
    overallScore: 'number',
    tags: 'array',
    advantages: 'string',
    weaknesses: 'string'
  },
  faceShape: {
    type: 'string',
    score: 'number',
    features: { smoothness: 'number', boneStructure: 'number', proportion: 'number' },
    suitableHaircuts: 'array',
    avoidHaircuts: 'array',
    suitableCollars: 'array'
  },
  skinColor: {
    type: 'string',
    brightness: 'number',
    purity: 'number',
    season: 'string',
    seasonDetail: 'string',
    goodColors: 'array',
    badColors: 'array',
    goodHairColors: 'array',
    badHairColors: 'array'
  },
  style: {
    mainStyle: 'string',
    mainScore: 'number',
    subStyles: 'array',
    features: { mass: 'string', curve: 'string', movement: 'string' },
    clothingAdvice: 'object',
    sceneAdvice: 'array'
  },
  bodyShape: {
    shoulderType: 'string',
    bodyRatio: 'string',
    suitableTop: 'array',
    suitableBottom: 'array',
    avoidStyles: 'array',
    tips: 'array'
  },
  outfitItems: {
    recommended: 'array',
    avoidItems: 'array'
  },
  hairRecommend: {
    top3: 'array',
    alternatives: 'array',
    hairColors: 'array',
    avoidHair: 'array'
  },
  makeup: {
    style: 'string',
    foundation: 'object',
    eyeBrow: 'object',
    lipRecommend: 'object',
    avoidMakeup: 'array'
  },
  summary: {
    coreConclusion: 'string',
    priorityAdvice: 'string',
    dailyTips: 'array'
  }
}

// 兜底报告（当AI输出异常时使用）
const FALLBACK_REPORT = {
  basic: {
    overallScore: 7.0,
    tags: ['综合型', '待深入分析'],
    advantages: '您的面部特征具有独特魅力，建议通过详细分析获取精准结论',
    weaknesses: '本次分析精度有限，建议重新拍摄清晰照片再次诊断'
  },
  faceShape: {
    type: '待分析',
    score: 7.0,
    features: { smoothness: 7.0, boneStructure: 7.0, proportion: 7.0 },
    suitableHaircuts: [],
    avoidHaircuts: [],
    suitableCollars: []
  },
  skinColor: {
    type: '待分析',
    brightness: 7.0,
    purity: 7.0,
    season: '待分析',
    seasonDetail: '建议重新诊断获取精准色彩分析',
    goodColors: [],
    badColors: [],
    goodHairColors: [],
    badHairColors: []
  },
  style: {
    mainStyle: '待分析',
    mainScore: 7.0,
    subStyles: [],
    features: { mass: '中等', curve: '中性', movement: '中性' },
    clothingAdvice: { silhouette: '', material: '', pattern: '' },
    sceneAdvice: []
  },
  bodyShape: {
    shoulderType: '待分析',
    bodyRatio: '待分析',
    suitableTop: [],
    suitableBottom: [],
    avoidStyles: [],
    tips: []
  },
  outfitItems: { recommended: [], avoidItems: [] },
  hairRecommend: { top3: [], alternatives: [], hairColors: [], avoidHair: [] },
  makeup: {
    style: '待分析',
    foundation: { tone: '', shade: '', concealer: '' },
    eyeBrow: { shape: '', shadow: '', eyeliner: '' },
    lipRecommend: { destiny: '', daily: '' },
    avoidMakeup: []
  },
  summary: {
    coreConclusion: '本次分析结果有限，建议重新拍摄清晰正面照再次诊断',
    priorityAdvice: '建议优先重新进行AI诊断',
    dailyTips: ['选择光线充足的环境拍照', '确保面部无遮挡', '素颜或淡妆效果更佳']
  }
}

// 校验报告数据完整性
function validateReport(report) {
  if (!report || typeof report !== 'object') return false

  // 检查核心字段是否存在
  const requiredSections = ['basic', 'faceShape', 'skinColor', 'style', 'bodyShape', 'summary']
  for (const section of requiredSections) {
    if (!report[section] || typeof report[section] !== 'object') return false
  }

  // 检查 basic 必要字段
  if (typeof report.basic.overallScore !== 'number') return false
  if (!Array.isArray(report.basic.tags)) return false

  return true
}

// 安全合并：用兜底数据填充缺失字段
function safeMergeReport(report) {
  const result = JSON.parse(JSON.stringify(FALLBACK_REPORT))

  if (!report) return result

  for (const section of Object.keys(result)) {
    if (report[section] && typeof report[section] === 'object') {
      if (Array.isArray(result[section])) {
        result[section] = Array.isArray(report[section]) ? report[section] : result[section]
      } else {
        result[section] = { ...result[section], ...report[section] }
      }
    }
  }

  return result
}

module.exports = {
  REPORT_SCHEMA,
  FALLBACK_REPORT,
  validateReport,
  safeMergeReport
}
