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
    fitScore: { pros: '版型整体合适', cons: '可注意肩线位置' },
    colorScore: { pros: '颜色日常百搭', cons: '可尝试更亮色点缀' },
    qualityScore: { pros: '质感尚可', cons: '细节可再观察' },
    valueScore: { pros: '价格合理', cons: '对比同类可再考量' }
  },
  tips: ['搭配高腰下装可优化比例', '可叠穿增加层次感', '配饰选择简约风格'],
  dadaComment: '这件还行啦，但搭搭觉得你可以找到更心动的喵~',
  outfitAdvice: [
    { type: 'accessory', icon: '💍', title: '饰品搭配', description: '建议搭配简约金属饰品，提升整体精致感', reason: '简约饰品与该款风格协调' },
    { type: 'hairstyle', icon: '💇', title: '发型搭配', description: '建议搭配低马尾或自然披发，保持清爽感', reason: '发型简洁不抢服饰风头' },
    { type: 'makeup', icon: '💄', title: '妆容搭配', description: '建议日常淡妆，裸粉色系唇妆点缀', reason: '淡妆与该款气质匹配' },
    { type: 'shoes', icon: '👠', title: '鞋履搭配', description: '建议搭配小白鞋或乐福鞋，休闲百搭', reason: '舒适鞋款提升实穿性' },
    { type: 'bag', icon: '👜', title: '包包搭配', description: '建议搭配简约托特包或斜挎小包', reason: '包型与整体风格统一' }
  ]
}

const FALLBACK_COMPARE_RESULT = {
  rankings: [
    { index: 0, label: '款式A', totalScore: 42 },
    { index: 1, label: '款式B', totalScore: 36 }
  ],
  scores: [
    { index: 0, label: '款式A', slimScore: 7, versatileScore: 7, occasionScore: 7, qualityScore: 7, valueScore: 7, durableScore: 7 },
    { index: 1, label: '款式B', slimScore: 6, versatileScore: 6, occasionScore: 6, qualityScore: 6, valueScore: 6, durableScore: 6 }
  ],
  comparisons: [
    { index: 0, label: '款式A', pros: '版型修身显瘦', cons: '价格偏高' },
    { index: 1, label: '款式B', pros: '价格实惠', cons: '面料一般' }
  ],
  finalChoice: { index: 0, label: '款式A', reason: '综合评分最高，显瘦效果最佳' },
  bestScenarios: [
    { index: 0, label: '款式A', scenario: '日常通勤' },
    { index: 1, label: '款式B', scenario: '周末休闲' }
  ],
  dadaComment: 'A款明显更胜一筹，B款就留作备胎吧喵~',
  outfitAdvice: [
    { type: 'accessory', icon: '💍', title: '饰品搭配', description: '推荐款适合搭配精致银饰', reason: '银饰提升高级感' },
    { type: 'hairstyle', icon: '💇', title: '发型搭配', description: '推荐搭配干练低马尾', reason: '与推荐款气质相符' },
    { type: 'makeup', icon: '💄', title: '妆容搭配', description: '建议清透底妆+豆沙色唇', reason: '日常通勤百搭妆容' },
    { type: 'shoes', icon: '👠', title: '鞋履搭配', description: '搭配尖头平底鞋或小高跟', reason: '延伸腿部线条' },
    { type: 'bag', icon: '👜', title: '包包搭配', description: '搭配通勤风手提包', reason: '场景匹配度高' }
  ]
}

function validateSingleResult(result) {
  if (!result) return false
  if (!result.scores) return false
  const { fitScore, colorScore, qualityScore, valueScore } = result.scores
  if (typeof fitScore !== 'number' || typeof colorScore !== 'number' ||
      typeof qualityScore !== 'number' || typeof valueScore !== 'number') return false
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
  return {
    scores: {
      fitScore: typeof result.scores?.fitScore === 'number' ? result.scores.fitScore : fallback.scores.fitScore,
      colorScore: typeof result.scores?.colorScore === 'number' ? result.scores.colorScore : fallback.scores.colorScore,
      qualityScore: typeof result.scores?.qualityScore === 'number' ? result.scores.qualityScore : fallback.scores.qualityScore,
      valueScore: typeof result.scores?.valueScore === 'number' ? result.scores.valueScore : fallback.scores.valueScore,
    },
    verdict: result.verdict || fallback.verdict,
    details: result.details || fallback.details,
    tips: result.tips && result.tips.length > 0 ? result.tips : fallback.tips,
    dadaComment: result.dadaComment || fallback.dadaComment,
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
