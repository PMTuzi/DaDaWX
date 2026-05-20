// 穿搭咨询结果校验与兜底

const FALLBACK_SINGLE_RESULT = {
  scores: {
    fitScore: 7,
    colorScore: 7,
    qualityScore: 7,
    valueScore: 7
  },
  verdict: '建议自留',
  details: {
    fitScore: { pros: '整体合适', cons: '可注意细节' },
    colorScore: { pros: '颜色日常百搭', cons: '可尝试更亮色点缀' },
    qualityScore: { pros: '质感尚可', cons: '细节可再观察' },
    valueScore: { pros: '价格合理', cons: '对比同类可再考量' }
  },
  tips: ['搭配高腰下装可优化比例', '可叠穿增加层次感', '配饰选择简约风格'],
  dadaComment: '这件还行啦，但哒哒觉得你可以找到更心动的喵~',
  personalReason: '',
  outfitAdvice: [
    { type: 'accessory', icon: 'ring', title: '饰品搭配', description: '建议搭配简约金属饰品，提升整体精致感', reason: '简约饰品与该款风格协调' },
    { type: 'hairstyle', icon: 'hair', title: '发型搭配', description: '建议搭配低马尾或自然披发，保持清爽感', reason: '发型简洁不抢风头' },
    { type: 'makeup', icon: 'makeup', title: '妆容搭配', description: '建议日常淡妆，裸粉色系唇妆点缀', reason: '淡妆与该款气质匹配' },
    { type: 'shoes', icon: 'heel', title: '鞋履搭配', description: '建议搭配小白鞋或乐福鞋，休闲百搭', reason: '舒适鞋款提升实穿性' },
    { type: 'bag', icon: 'bag', title: '包包搭配', description: '建议搭配简约托特包或斜挎小包', reason: '包型与整体风格统一' }
  ]
}

const FALLBACK_COMPARE_RESULT = {
  rankings: [
    { index: 0, label: '选项A', totalScore: 7.0 },
    { index: 1, label: '选项B', totalScore: 6.0 }
  ],
  scores: [
    { index: 0, label: '选项A', slimScore: 7, versatileScore: 7, occasionScore: 7, qualityScore: 7, valueScore: 7, durableScore: 7 },
    { index: 1, label: '选项B', slimScore: 6, versatileScore: 6, occasionScore: 6, qualityScore: 6, valueScore: 6, durableScore: 6 }
  ],
  comparisons: [
    { index: 0, label: '选项A', pros: '综合表现更优', cons: '价格偏高' },
    { index: 1, label: '选项B', pros: '价格实惠', cons: '质感一般' }
  ],
  finalChoice: { index: 0, label: '选项A', reason: '综合评分最高，最适合你' },
  bestScenarios: [
    { index: 0, label: '选项A', scenario: '日常通勤' },
    { index: 1, label: '选项B', scenario: '周末休闲' }
  ],
  dadaComment: 'A款明显更胜一筹，B款就留作备胎吧喵~',
  personalReason: '',
  outfitAdvice: [
    { type: 'accessory', icon: 'ring', title: '饰品搭配', description: '推荐款适合搭配精致银饰', reason: '银饰提升高级感' },
    { type: 'hairstyle', icon: 'hair', title: '发型搭配', description: '推荐搭配干练低马尾', reason: '与推荐款气质相符' },
    { type: 'makeup', icon: 'makeup', title: '妆容搭配', description: '建议清透底妆+豆沙色唇', reason: '日常通勤百搭妆容' },
    { type: 'shoes', icon: 'heel', title: '鞋履搭配', description: '搭配尖头平底鞋或小高跟', reason: '延伸腿部线条' },
    { type: 'bag', icon: 'bag', title: '包包搭配', description: '搭配通勤风手提包', reason: '场景匹配度高' }
  ]
}

function validateSingleResult(result) {
  if (!result) return false
  if (!result.scores || typeof result.scores !== 'object') return false
  // 至少有2个数字评分维度
  const scoreValues = Object.values(result.scores).filter(v => typeof v === 'number')
  if (scoreValues.length < 2) return false
  if (!result.verdict || typeof result.verdict !== 'string') return false
  return true
}

function validateCompareResult(result) {
  if (!result) return false
  if (!result.rankings || !Array.isArray(result.rankings) || result.rankings.length < 2) return false
  if (!result.scores || !Array.isArray(result.scores) || result.scores.length < 2) return false
  if (!result.finalChoice) return false
  return true
}

function safeMergeSingleResult(result) {
  const fallback = JSON.parse(JSON.stringify(FALLBACK_SINGLE_RESULT))
  if (!result) return fallback
  // 动态合并scores：保留AI返回的所有评分维度，缺失的用7兜底
  const mergedScores = {}
  const allKeys = new Set([...Object.keys(result.scores || {}), ...Object.keys(fallback.scores)])
  for (const key of allKeys) {
    mergedScores[key] = typeof result.scores?.[key] === 'number' ? result.scores[key] : (fallback.scores[key] || 7)
  }
  return {
    scores: mergedScores,
    verdict: result.verdict || fallback.verdict,
    details: result.details || fallback.details,
    tips: result.tips && result.tips.length > 0 ? result.tips : fallback.tips,
    dadaComment: result.dadaComment || fallback.dadaComment,
    personalReason: result.personalReason || '',
    outfitAdvice: result.outfitAdvice && result.outfitAdvice.length >= 5 ? result.outfitAdvice : fallback.outfitAdvice
  }
}

function safeMergeCompareResult(result) {
  const fallback = JSON.parse(JSON.stringify(FALLBACK_COMPARE_RESULT))
  if (!result) return fallback
  return {
    rankings: result.rankings || fallback.rankings,
    scores: result.scores || fallback.scores,
    comparisons: result.comparisons || fallback.comparisons,
    finalChoice: result.finalChoice || fallback.finalChoice,
    bestScenarios: result.bestScenarios || fallback.bestScenarios,
    dadaComment: result.dadaComment || fallback.dadaComment,
    personalReason: result.personalReason || '',
    outfitAdvice: result.outfitAdvice && result.outfitAdvice.length >= 5 ? result.outfitAdvice : fallback.outfitAdvice
  }
}

module.exports = {
  validateSingleResult,
  validateCompareResult,
  safeMergeSingleResult,
  safeMergeCompareResult,
  FALLBACK_SINGLE_RESULT,
  FALLBACK_COMPARE_RESULT
}
