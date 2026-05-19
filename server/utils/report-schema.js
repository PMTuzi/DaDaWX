// 报告数据校验与兜底

const REPORT_SCHEMA = {
  basic: ['overallScore', 'tags', 'advantages', 'weaknesses'],
  faceShape: ['type', 'score', 'features', 'suitableHaircuts', 'avoidHaircuts', 'suitableCollars'],
  skinColor: ['type', 'brightness', 'purity', 'season', 'seasonDetail', 'goodColors', 'badColors'],
  style: ['mainStyle', 'mainScore', 'subStyles', 'features', 'clothingAdvice', 'sceneAdvice'],
  bodyShape: ['shoulderType', 'bodyRatio', 'suitableTop', 'suitableBottom', 'avoidStyles', 'tips'],
  summary: ['coreConclusion', 'priorityAdvice', 'dailyTips']
}

const FALLBACK_REPORT = {
  basic: {
    overallScore: 7.0,
    tags: ['综合型', '待深入分析'],
    advantages: '您的面部特征具有独特魅力，建议通过详细分析获取精准结论',
    weaknesses: '本次分析精度有限，建议重新拍摄清晰照片再次诊断'
  },
  faceShape: {
    type: '待分析', score: 7.0,
    features: { smoothness: 7.0, boneStructure: 7.0, proportion: 7.0 },
    suitableHaircuts: [], avoidHaircuts: [], suitableCollars: []
  },
  skinColor: {
    type: '待分析', brightness: 7.0, purity: 7.0,
    season: '待分析', seasonDetail: '建议重新诊断获取精准色彩分析',
    goodColors: [], badColors: [], goodHairColors: [], badHairColors: []
  },
  style: {
    mainStyle: '待分析', mainScore: 7.0, subStyles: [],
    features: { mass: '中等', curve: '中性', movement: '中性' },
    clothingAdvice: { silhouette: '', material: '', pattern: '' }, sceneAdvice: []
  },
  bodyShape: {
    shoulderType: '待分析', bodyRatio: '待分析',
    suitableTop: [], suitableBottom: [], avoidStyles: [], tips: []
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

function validateReport(report) {
  if (!report || typeof report !== 'object') return false
  const requiredSections = ['basic', 'faceShape', 'skinColor', 'style', 'bodyShape', 'summary']
  for (const section of requiredSections) {
    if (!report[section] || typeof report[section] !== 'object') return false
  }
  if (typeof report.basic.overallScore !== 'number') return false
  if (!Array.isArray(report.basic.tags)) return false
  return true
}

function safeMergeReport(report) {
  const result = JSON.parse(JSON.stringify(FALLBACK_REPORT))
  if (!report || typeof report !== 'object') return result
  for (const section of Object.keys(result)) {
    if (report[section] && typeof report[section] === 'object' && !Array.isArray(report[section])) {
      result[section] = { ...result[section], ...report[section] }
    } else if (report[section] !== undefined) {
      result[section] = report[section]
    }
  }
  // 同时拷贝报告中有但 schema 中没有的字段
  for (const key of Object.keys(report)) {
    if (!result[key]) {
      result[key] = report[key]
    }
  }
  return result
}

module.exports = { validateReport, safeMergeReport, FALLBACK_REPORT }
