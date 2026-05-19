/**
 * iCREDIT 智能面部特征医美颜值整容美颜分析 - 可视化API
 * 
 * 返回可视化图片：
 *   - faceMarkImg: 人脸关键点标注可视化图
 *   - radarChartImg: 颜值分项雷达图
 *   - beautyCompareImg: 医美优化模拟前后对比图
 *   - defectHeatImg: 面部缺陷热力可视化图
 *   - proportionLineImg: 比例尺寸线标注图
 *   - fullVisualReport: 完整可视化PDF报告链接
 * 
 * 请求参数：
 *   - image: 图片base64/图片公网URL
 *   - type: 1
 *   - needVisual: 1 (开启生成可视化效果图)
 *   - needReport: 1 (生成图文诊断报告)
 */

const https = require('https')

const ICREDIT_HOST = 'ylmr.market.alicloudapi.com'

function getAppCode() {
  const code = process.env.ICREDIT_APPCODE
  if (!code || code === 'your_icredit_appcode') {
    console.warn('[FaceVisual] 未配置 ICREDIT_APPCODE，可视化API不可用')
    return null
  }
  return code
}

function getModelId() {
  return process.env.ICREDIT_VISUAL_MODEL || 'iCREDIT_0849'
}

/**
 * 调用 iCREDIT 面部可视化分析 API
 * @param {string} imageUrl - 图片URL（公网可访问）
 * @param {string} imageBase64 - 或 base64 编码的图片
 * @returns {Object|null} 可视化结果（含图片URL）
 */
async function analyzeFaceVisual(imageUrl, imageBase64) {
  const appCode = getAppCode()
  if (!appCode) return null

  try {
    // 构建请求体
    let imageInput = ''
    if (imageBase64) {
      imageInput = imageBase64.replace(/^data:image\/\w+;base64,/, '')
    } else if (imageUrl) {
      imageInput = imageUrl
    } else {
      return null
    }

    const body = JSON.stringify({
      image: imageInput,
      type: 1,
      needVisual: 1,
      needReport: 1
    })

    const modelId = getModelId()
    const path = `/icredit_ai_model/${modelId}/create_ai_job`

    console.log(`[FaceVisual] 调用iCREDIT可视化API, model: ${modelId}...`)
    const t0 = Date.now()

    const result = await callAPI(path, body, appCode)

    console.log(`[FaceVisual] API响应, 耗时: ${Date.now() - t0}ms`)

    if (!result) {
      console.warn('[FaceVisual] API返回数据为空')
      return null
    }

    // 检查返回码
    if (result.code && result.code !== 200) {
      console.warn(`[FaceVisual] API返回错误: code=${result.code}, msg=${result.message || result.msg || ''}`)
      return null
    }

    return parseVisualResponse(result)
  } catch (err) {
    console.error('[FaceVisual] 调用失败:', err.message || err)
    return null
  }
}

/**
 * 调用 HTTPS API
 */
function callAPI(path, body, appCode) {
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: ICREDIT_HOST,
      path,
      method: 'POST',
      headers: {
        'Authorization': 'APPCODE ' + appCode,
        'Content-Type': 'application/json; charset=UTF-8',
        'Content-Length': Buffer.byteLength(body)
      },
      timeout: 60000  // 可视化生成可能较慢
    }

    const req = https.request(opts, (res) => {
      let data = ''
      res.on('data', d => data += d)
      res.on('end', () => {
        if (res.statusCode !== 200) {
          reject(new Error(`API HTTP ${res.statusCode}: ${data.substring(0, 200)}`))
          return
        }
        try {
          resolve(JSON.parse(data))
        } catch (e) {
          reject(new Error('API响应JSON解析失败'))
        }
      })
    })

    req.on('error', (e) => reject(e))
    req.on('timeout', () => {
      req.destroy()
      reject(new Error('API请求超时'))
    })
    req.write(body)
    req.end()
  })
}

/**
 * 解析可视化API响应
 * 兼容两种返回格式：
 * 1. 标准JSON: { code: 200, data: { faceMarkImg: "...", ... } }
 * 2. iCREDIT格式: { IMAGE_PROCESS_STATUS: "...", IMAGE_PROCESS_EXTRACT_ENTITY: [...] }
 */
function parseVisualResponse(result) {
  // 格式1: 标准JSON格式（新API）
  if (result.data && typeof result.data === 'object') {
    const d = result.data
    const visual = {}

    if (d.faceMarkImg) visual.faceMarkImg = normalizeImageUrl(d.faceMarkImg)
    if (d.radarChartImg) visual.radarChartImg = normalizeImageUrl(d.radarChartImg)
    if (d.beautyCompareImg) visual.beautyCompareImg = normalizeImageUrl(d.beautyCompareImg)
    if (d.defectHeatImg) visual.defectHeatImg = normalizeImageUrl(d.defectHeatImg)
    if (d.proportionLineImg) visual.proportionLineImg = normalizeImageUrl(d.proportionLineImg)
    if (d.fullVisualReport) visual.fullVisualReport = normalizeImageUrl(d.fullVisualReport)

    // 额外字段（可能包含评分等数据）
    if (d.faceScore != null) visual.faceScore = d.faceScore
    if (d.faceType) visual.faceType = d.faceType
    if (d.scores) visual.scores = d.scores

    const hasImages = Object.keys(visual).some(k => k.endsWith('Img'))
    if (!hasImages) {
      console.warn('[FaceVisual] 响应中未找到可视化图片')
      return null
    }

    console.log(`[FaceVisual] 获取到可视化图片: ${Object.keys(visual).filter(k => k.endsWith('Img')).join(', ')}`)
    return visual
  }

  // 格式2: iCREDIT 旧格式（兼容）
  if (result.IMAGE_PROCESS_EXTRACT_ENTITY) {
    console.log('[FaceVisual] 收到iCREDIT标准格式响应，尝试提取可视化数据')
    return extractVisualFromICREDIT(result)
  }

  console.warn('[FaceVisual] 未识别的响应格式')
  return null
}

/**
 * 从 iCREDIT 标准格式中提取可视化数据
 */
function extractVisualFromICREDIT(result) {
  const entities = result.IMAGE_PROCESS_EXTRACT_ENTITY
  if (!entities || !entities.length) return null

  const face = entities[0]
  const visual = {}

  // 尝试提取图片URL类型的实体
  const imageFields = [
    '人脸关键点标注图', '颜值雷达图', '医美对比效果图',
    '面部缺陷热力图', '比例尺寸线标注图', '可视化报告'
  ]
  const fieldMap = {
    '人脸关键点标注图': 'faceMarkImg',
    '颜值雷达图': 'radarChartImg',
    '医美对比效果图': 'beautyCompareImg',
    '面部缺陷热力图': 'defectHeatImg',
    '比例尺寸线标注图': 'proportionLineImg',
    '可视化报告': 'fullVisualReport'
  }

  for (const entity of face) {
    const name = entity.ENTITY_NAME
    const value = entity.ENTITY_VALUE
    if (fieldMap[name] && value) {
      visual[fieldMap[name]] = normalizeImageUrl(value)
    }
  }

  if (Object.keys(visual).length === 0) {
    // 旧格式不包含可视化图片，返回null让前端用Canvas渲染
    return null
  }

  return visual
}

/**
 * 标准化图片URL
 * 处理短链接、相对路径等情况
 */
function normalizeImageUrl(url) {
  if (!url) return null
  // 如果是短链接格式（如 shturl.cc/xxx），补充协议
  if (url.match(/^[a-zA-Z0-9-]+\.[a-z]+\//)) {
    url = 'https://' + url
  }
  // 如果缺少协议
  if (!url.startsWith('http')) {
    url = 'https://' + url
  }
  return url
}

module.exports = { analyzeFaceVisual }
