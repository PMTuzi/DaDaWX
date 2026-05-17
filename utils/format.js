// 格式化工具
function formatDate(date) {
  const d = new Date(date)
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  const hour = String(d.getHours()).padStart(2, '0')
  const minute = String(d.getMinutes()).padStart(2, '0')
  return `${year}-${month}-${day} ${hour}:${minute}`
}

// 评分等级
function getScoreLevel(score) {
  if (score >= 9) return { text: '极佳', color: '#27ae60' }
  if (score >= 8) return { text: '优秀', color: '#2ecc71' }
  if (score >= 7) return { text: '良好', color: '#f39c12' }
  if (score >= 6) return { text: '中等', color: '#e67e22' }
  return { text: '待提升', color: '#e74c3c' }
}

// 肤色季型中文
function getSeasonName(season) {
  const map = {
    'spring-warm': '暖春型',
    'spring-light': '浅春型',
    'summer-cool': '冷夏型',
    'summer-light': '浅夏型',
    'autumn-warm': '暖秋型',
    'autumn-deep': '深秋型',
    'winter-cool': '冷冬型',
    'winter-deep': '深冬型'
  }
  return map[season] || season
}

// 脸型中文
function getFaceShapeName(shape) {
  const map = {
    'oval': '鹅蛋脸',
    'round': '圆脸',
    'square': '方脸',
    'long': '长脸',
    'diamond': '菱形脸',
    'heart': '心形脸'
  }
  return map[shape] || shape
}

// 适配度等级
function getMatchLevel(score) {
  if (score >= 9) return { text: '高度适配', emoji: '🌟', color: '#27ae60' }
  if (score >= 8) return { text: '适配', emoji: '✨', color: '#2ecc71' }
  if (score >= 7) return { text: '较适配', emoji: '👍', color: '#f39c12' }
  if (score >= 6) return { text: '一般', emoji: '👌', color: '#e67e22' }
  return { text: '不太适配', emoji: '⚠️', color: '#e74c3c' }
}

// 防抖
function debounce(fn, delay = 500) {
  let timer = null
  return function (...args) {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => fn.apply(this, args), delay)
  }
}

// 生成报告分享海报数据
function generatePosterData(report) {
  return {
    avatar: report.basic?.avatar || '',
    score: report.basic?.overallScore || 0,
    tags: report.basic?.tags || [],
    season: report.skinColor?.season || '',
    mainStyle: report.style?.mainStyle || '',
    slogan: '国内首款「反种草」AI 形象决策平台'
  }
}

module.exports = {
  formatDate,
  getScoreLevel,
  getSeasonName,
  getFaceShapeName,
  getMatchLevel,
  debounce,
  generatePosterData
}
