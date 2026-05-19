// 报告数据校验与兜底

const REPORT_SCHEMA = {
  basic: ['overallScore', 'tags', 'advantages'],
  modules: ['bone', 'skin', 'colorStyle', 'outfit'],
  faceShape: ['type', 'score', 'features'],
  skinColor: ['type', 'brightness', 'purity', 'season', 'goodColors'],
  style: ['mainStyle', 'mainScore', 'features'],
  bodyShape: ['shoulderType', 'bodyRatio'],
  summary: ['coreConclusion']
}

const FALLBACK_REPORT = {
  basic: {
    overallScore: 7.0,
    tags: ['综合型', '待深入分析'],
    advantages: '您的面部特征具有独特魅力，建议通过详细分析获取精准结论',
    weaknesses: '本次分析精度有限，建议重新拍摄清晰照片再次诊断'
  },
  modules: {
    bone: {
      title: '骨相分析', faceType: '待分析', faceScore: 7, boneType: '待分析', boneDesc: '',
      threeCourts: { upper: '', middle: '', lower: '', balance: '' },
      fiveEyes: { analysis: '', suggestion: '' },
      faceFeatures: [], suitableHaircuts: [], avoidHaircuts: [], suitableCollars: [],
      keyInsight: ''
    },
    skin: {
      title: '皮肤状态', skinType: '待分析', brightness: 7, purity: 7, skinAge: '',
      overallDesc: '', problems: [], season: '待分析', seasonDetail: '',
      goodColors: [], badColors: [], goodHairColors: [], badHairColors: [],
      skincareAdvice: [], keyInsight: ''
    },
    colorStyle: {
      title: '色彩风格', mainStyle: '待分析', mainScore: 7, styleDesc: '',
      subStyles: [], styleFeatures: { mass: '中', curve: '中性', movement: '中性' },
      colorPalette: { primary: [], secondary: [], neutral: [], accent: [] },
      clothingAdvice: {}, sceneAdvice: [], outfitItems: [], avoidItems: [],
      keyInsight: ''
    },
    outfit: {
      title: '穿搭风格',
      hairRecommend: { top3: [], alternatives: [], hairColors: [], avoidHair: [] },
      makeup: { style: '待分析', foundation: {}, eyeBrow: {}, lipRecommend: {}, avoidMakeup: [] },
      bodyShape: { shoulderType: '待分析', bodyRatio: '待分析', suitableTop: [], suitableBottom: [], avoidStyles: [], tips: [] },
      summary: { coreConclusion: '', priorityAdvice: '', dailyTips: [] },
      keyInsight: ''
    }
  },
  faceShape: {
    type: '待分析', score: 7.0,
    features: { smoothness: 7.0, boneStructure: 7.0, proportion: 7.0 },
    suitableHaircuts: [], avoidHaircuts: [], suitableCollars: []
  },
  skinColor: {
    type: '待分析', brightness: 7.0, purity: 7.0,
    season: '待分析', seasonDetail: '', goodColors: [], badColors: [],
    goodHairColors: [], badHairColors: []
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
  // 新格式：有 modules 字段
  if (report.modules && typeof report.modules === 'object') {
    return !!(report.basic && report.basic.overallScore)
  }
  // 旧格式兼容
  const requiredSections = ['basic', 'faceShape', 'skinColor', 'style']
  for (const section of requiredSections) {
    if (!report[section] || typeof report[section] !== 'object') return false
  }
  if (typeof report.basic.overallScore !== 'number') return false
  return true
}

function safeMergeReport(report) {
  const result = JSON.parse(JSON.stringify(FALLBACK_REPORT))
  if (!report || typeof report !== 'object') return result

  // 合并 modules
  if (report.modules && typeof report.modules === 'object') {
    for (const key of Object.keys(report.modules)) {
      if (result.modules[key] && typeof report.modules[key] === 'object' && !Array.isArray(report.modules[key])) {
        result.modules[key] = { ...result.modules[key], ...report.modules[key] }
      } else if (report.modules[key] !== undefined) {
        result.modules[key] = report.modules[key]
      }
    }
  }

  // 合并顶层字段
  for (const section of Object.keys(result)) {
    if (section === 'modules') continue
    if (report[section] && typeof report[section] === 'object' && !Array.isArray(report[section])) {
      result[section] = { ...result[section], ...report[section] }
    } else if (report[section] !== undefined) {
      result[section] = report[section]
    }
  }

  // 拷贝 report 中有但 schema 中没有的字段
  for (const key of Object.keys(report)) {
    if (!result[key]) result[key] = report[key]
  }

  return result
}

module.exports = { validateReport, safeMergeReport, FALLBACK_REPORT }
