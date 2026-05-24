// 通义千问 API 服务
const axios = require('axios')

// 连接池：复用 TCP 连接，避免每次请求创建新连接
const httpAgent = new (require('http').Agent)({ keepAlive: true, maxSockets: 100, timeout: 60000 })
const httpsAgent = new (require('https').Agent)({ keepAlive: true, maxSockets: 100, timeout: 60000 })
const axiosInstance = axios.create({
  httpAgent,
  httpsAgent,
  timeout: 60000
})

/**
 * 健壮的 JSON 解析
 */
function robustJSONParse(str) {
  try { return JSON.parse(str) } catch (_) {}
  const codeBlockMatch = str.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (codeBlockMatch) {
    try { return JSON.parse(codeBlockMatch[1].trim()) } catch (_) {}
  }
  const jsonMatch = str.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error('无法提取JSON')
  let json = jsonMatch[0]
  try { return JSON.parse(json) } catch (_) {}
  let fixed = json
  const openBraces = (fixed.match(/\{/g) || []).length
  const closeBraces = (fixed.match(/\}/g) || []).length
  const openBrackets = (fixed.match(/\[/g) || []).length
  const closeBrackets = (fixed.match(/\]/g) || []).length
  for (let i = 0; i < openBrackets - closeBrackets; i++) fixed += ']'
  for (let i = 0; i < openBraces - closeBraces; i++) fixed += '}'
  try { return JSON.parse(fixed) } catch (_) {}
  fixed = fixed.replace(/,\s*([\]}])/g, '$1')
  try { return JSON.parse(fixed) } catch (_) {}
  let lastValid = json.lastIndexOf('",')
  if (lastValid > 0) {
    let truncated = json.substring(0, lastValid + 1)
    const ob = (truncated.match(/\{/g) || []).length
    const cb = (truncated.match(/\}/g) || []).length
    const obr = (truncated.match(/\[/g) || []).length
    const cbr = (truncated.match(/\]/g) || []).length
    for (let i = 0; i < obr - cbr; i++) truncated += ']'
    for (let i = 0; i < ob - cb; i++) truncated += '}'
    try { return JSON.parse(truncated) } catch (_) {}
  }
  throw new Error('JSON解析失败')
}

const QWEN_API_KEY = process.env.QWEN_API_KEY
const BASE_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions'

// ============================================================
// VL 分析（2次调用）
// ============================================================

/**
 * VL调用1: 形象DNA + 皮肤&风格DNA
 */
async function analyzePart1(imageInput, photoType = 'face', gender = 'female', userInfo = {}) {
  const ageInfo = userInfo.age ? `${userInfo.age}岁` : ''
  const bodyInfo = (userInfo.height || userInfo.weight) ? `，身高${userInfo.height || '?'}cm，体重${userInfo.weight || '?'}kg` : ''
  const prompt = `你是一位顶级形象分析AI，请仔细观察这张${photoType === 'face' ? '人脸正面' : '全身'}${gender === 'male' ? '男性' : '女性'}照片${ageInfo ? '（' + ageInfo + bodyInfo + '）' : ''}，完成两个模块的深度分析。

【重要规则】
1. 必须严格基于照片具体特征做判断，不同人必须有明显差异，要给出清晰的分析结果
2. 脸型必须精确判定，不要默认给oval
3. 评分必须体现真实差异，禁止给"安全分"
4. 所有描述必须具体，禁止写"适中""一般""正常"等模糊词
5. 文案使用第二人称"你"来描述

以JSON格式输出：

{
  "module1_dna": {
    "title": "面部骨相诊断报告",
    "faceType": "脸型名称（必须精确：如菱形脸/鹅蛋脸/方圆脸/长脸/心形脸等）",
    "faceScore": 0-10,
    "boneType": "骨相型/皮相型/骨皮均衡",
    "boneDesc": "骨相特点2-3句详细描述（必须具体说哪里突出、哪里平缓）",
    "colorIntensity": "五官色彩浓淡（必须精确判定：浓颜/淡颜/中间颜，根据眉、眼、唇与肤色对比度判断）",
    "colorIntensityDesc": "浓淡颜判定理由1-2句（具体说明对比度和五官色彩饱和度）",
    "visualAge": "视觉年龄（必须精确给出岁数数字或区间，如 26 或 25-27，不要写"年轻""成熟"等模糊词）",
    "visualAgeDesc": "视觉年龄判定理由1-2句",
    "faceWidth": "宽/适中/窄",
    "faceLength": "长/适中/短",
    "threeCourts": {
      "upper": "上庭比例分析与修饰建议（必须写具体偏长/偏短/适中及修饰方向）",
      "middle": "中庭比例分析与修饰建议",
      "lower": "下庭比例分析与修饰建议",
      "balance": "均衡/上长/中长/下长"
    },
    "fiveEyes": {
      "analysis": "五眼比例分析（必须写具体宽窄情况）",
      "suggestion": "眼距修饰建议(妆容/发型)"
    },
    "lineStyle": "面部线条风格（如：线条利落分明/线条柔和流畅/线条刚柔并济等）",
    "faceFeatures": [
      { "name": "颧骨", "desc": "具体描述", "score": 0-10 },
      { "name": "下颌线", "desc": "具体描述", "score": 0-10 },
      { "name": "眉骨", "desc": "具体描述", "score": 0-10 },
      { "name": "鼻梁", "desc": "具体描述", "score": 0-10 },
      { "name": "下巴", "desc": "具体描述", "score": 0-10 }
    ],
    "landmarks": {
      "hairline": { "y": 0.1-0.9 },
      "eyebrowLeft": { "x": 0.1-0.9, "y": 0.1-0.9 },
      "eyebrowRight": { "x": 0.1-0.9, "y": 0.1-0.9 },
      "noseBase": { "y": 0.1-0.9 },
      "chin": { "y": 0.1-0.9 },
      "leftEyeInner": { "x": 0.1-0.9 },
      "leftEyeOuter": { "x": 0.1-0.9 },
      "rightEyeInner": { "x": 0.1-0.9 },
      "rightEyeOuter": { "x": 0.1-0.9 }
    },
    "keyInsight": "1-2句骨相核心洞察"
  },
  "module2_style": {
    "title": "色彩风格诊断报告",
    "skinType": "冷皮/暖皮/中性皮（必须精确判定）",
    "brightness": 0-10,
    "purity": 0-10,
    "mass": 0-10,
    "massDesc": "量感描述",
    "skinAge": "皮肤视觉年龄评估",
    "overallDesc": "皮肤整体状态2-3句描述",
    "problems": [
      { "name": "问题名", "level": "无/轻微/中等/明显", "area": "位置", "advice": "改善建议" }
    ],
    "season": "四季色彩季型（如冷夏/暖秋/柔春/净冬等，必须精确）",
    "seasonDetail": "季型详细说明",
    "goodColors": [
      { "name": "颜色名", "hex": "#色值", "usage": "穿搭/妆容使用场景" }
    ],
    "badColors": [
      { "name": "避雷色名", "hex": "#色值", "reason": "原因" }
    ],
    "mainStyle": "主风格名称（如戏剧型/少年型/优雅型/浪漫型等，必须精确）",
    "mainScore": 0-10,
    "styleDesc": "风格核心特征2-3句描述",
    "subStyles": [
      { "name": "副风格名", "score": 0-10, "desc": "简述" }
    ],
    "styleFeatures": {
      "mass": "量感描述及原因",
      "curve": "直曲描述及原因",
      "movement": "动静描述及原因"
    },
    "colorPalette": {
      "primary": ["主色调1", "主色调2", "主色调3"],
      "secondary": ["辅助色1", "辅助色2"],
      "neutral": ["中性色1", "中性色2"],
      "accent": ["点缀色1", "点缀色2"]
    },
    "clothingAdvice": {
      "silhouette": "版型建议(2-3句)",
      "material": "材质建议(2-3句)",
      "pattern": "图案建议(2-3句)",
      "accessory": "配饰风格建议(2-3句)"
    },
    "sceneAdvice": [
      { "scene": "职场", "desc": "穿搭方案描述", "keyItems": "关键单品" },
      { "scene": "日常", "desc": "穿搭方案描述", "keyItems": "关键单品" },
      { "scene": "约会", "desc": "穿搭方案描述", "keyItems": "关键单品" },
      { "scene": "休闲", "desc": "穿搭方案描述", "keyItems": "关键单品" }
    ],
    "goodHairColors": [
      { "name": "适配发色", "detail": "深浅色调描述" }
    ],
    "badHairColors": [
      { "name": "避雷发色", "reason": "原因" }
    ],
    "skincareAdvice": ["护肤建议1", "建议2", "建议3"],
    "keyInsight": "1-2句肤色+风格核心洞察"
  }
}

要求：problems至少3个，goodColors至少8个带真实hex色值，badColors至少4个。
请严格按照JSON格式输出，不要包含任何其他文字说明。`

  const maxRetries = 1
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      if (attempt > 0) {
        console.log(`[AI] VL Part1 第${attempt}次重试...`)
        await new Promise(r => setTimeout(r, 2000 * attempt))
      }
      console.log('[AI] VL Part1 使用Key:', QWEN_API_KEY?.substring(0, 8) + '...', '图片类型:', imageInput?.substring(0, 30))
      const response = await axiosInstance.post(BASE_URL, {
        model: process.env.QWEN_VL_MODEL || 'qwen-vl-max',
        messages: [{
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: imageInput } },
            { type: 'text', text: prompt }
          ]
        }],
        temperature: 0.3,
        top_p: 0.9
      }, {
        headers: { 'Authorization': `Bearer ${QWEN_API_KEY}`, 'Content-Type': 'application/json' },
        timeout: 90000
      })
      const content = response.data?.choices?.[0]?.message?.content
      if (!content) throw new Error('VL模型返回为空')
      console.log('[AI] VL Part1 原始返回:', content.substring(0, 200))
      return robustJSONParse(content)
    } catch (err) {
      const errMsg = err.response?.data?.error?.message || err.message
      console.error(`VL Part1 第${attempt}次调用失败:`, errMsg)
      if (attempt === maxRetries) throw new Error(errMsg)
    }
  }
}

/**
 * VL调用2: 发型妆容 + 颜值优化诊断
 */
async function analyzePart2(imageInput, part1Data, gender = 'female', userInfo = {}) {
  const ageInfo = userInfo.age ? `${userInfo.age}岁` : ''
  const bodyInfo = (userInfo.height || userInfo.weight) ? `，身高${userInfo.height || '?'}cm，体重${userInfo.weight || '?'}kg` : ''
  const prompt = `你是一位顶级形象顾问+发型师+化妆师AI，请根据以下${gender === 'male' ? '男性' : '女性'}${ageInfo ? '（' + ageInfo + bodyInfo + '）' : ''}的面部分析数据和照片，完成两个模块的深度分析。

【重要规则】
1. 必须严格基于具体特征做判断，不同人必须有明显差异
2. 发型推荐必须针对脸型和发质，不要给通用推荐
3. 妆容建议必须具体到色调和手法
4. 颜值优化只能推荐保守方案（护肤/化妆/发型/穿搭），绝对不能推荐任何整容/医美项目
5. 所有描述必须具体，禁止写"适中""百搭""日常"等模糊词
6. 文案使用第二人称"你"来描述

## 已有分析数据
${JSON.stringify(part1Data, null, 2)}

以JSON格式输出：

{
  "module3_hairmakeup": {
    "title": "发型妆容诊断报告",
    "hairRecommend": {
      "top3": [
        { "name": "发型名", "length": "短/中/长", "layers": "层次描述", "bangs": "刘海建议", "care": "打理要点", "reason": "适合原因（必须具体到脸型特征）", "score": 0-10, "imageKey": "必须从以下固定值中选一个最匹配的：long_straight(长直发)/long_curly(长卷发)/wave(大波浪)/wool_curl(羊毛卷/泡面卷)/collarbone(锁骨发/中长发)/short_curly(短卷发/蛋卷头)/bob(波波头/齐耳短发/内扣短发)/ponytail(高马尾/低马尾)/bun(丸子头/盘发)" }
      ],
      "alternatives": [
        { "name": "备选发型", "length": "长度", "style": "风格", "score": 0-10 }
      ],
      "hairColors": [
        { "name": "适配发色", "hex": "#色值", "detail": "深浅色调描述" }
      ],
      "avoidHair": [
        { "name": "避雷发型", "reason": "原因（必须具体到脸型为什么不适合）" }
      ]
    },
    "makeup": {
      "style": "适配妆容风格（必须具体：如清透氧气妆/高级感哑光妆/韩式水光妆等）",
      "foundation": { "tone": "粉底色调", "shade": "色号建议", "concealer": "遮瑕重点" },
      "eyeBrow": { "shape": "眉形建议", "shadow": "眼影色调", "eyeliner": "眼线风格" },
      "lipRecommend": { "destiny": "本命口红色号及色值", "daily": "日常口红色号及色值" },
      "blush": { "color": "腮红色调", "position": "打腮红位置" },
      "avoidMakeup": ["避雷妆容1", "避雷妆容2"]
    },
    "keyInsight": "1-2句发型妆容核心洞察"
  },
  "module4_optimize": {
    "title": "蜕变建议报告",
    "optimizablePoints": [
      {
        "area": "部位（如：黑眼圈/肤质/眉毛/唇色/发型等）",
        "problem": "具体问题描述",
        "conservativePlan": "保守改善方案（只能写护肤/化妆/发型/穿搭等非侵入性方案，绝对不能推荐整容/医美项目）",
        "priority": "高/中/低",
        "timeline": "见效时间（如：即时/1周/1个月/3个月）"
      }
    ],
    "priorityOrder": "改造优先级排序说明（如：1.发型→2.眉型→3.底妆→...）",
    "roadmap3m": {
      "month1": "第1个月重点行动",
      "month2": "第2个月进阶行动",
      "month3": "第3个月巩固行动"
    },
    "coreConclusion": "形象定位+优化核心逻辑（必须具体）",
    "keyInsight": "1-2句优化核心洞察"
  }
}

要求：top3发型必须3个，avoidHair至少3个，hairColors至少3个带hex色值，optimizablePoints至少5个。
请严格按照JSON格式输出，不要包含任何其他文字说明。`

  const maxRetries = 1
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      if (attempt > 0) {
        console.log(`[AI] VL Part2 第${attempt}次重试...`)
        await new Promise(r => setTimeout(r, 2000 * attempt))
      }
      const response = await axiosInstance.post(BASE_URL, {
        model: process.env.QWEN_VL_MODEL || 'qwen-vl-max',
        messages: [{
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: imageInput } },
            { type: 'text', text: prompt }
          ]
        }],
        temperature: 0.4,
        top_p: 0.9
      }, {
        headers: { 'Authorization': `Bearer ${QWEN_API_KEY}`, 'Content-Type': 'application/json' },
        timeout: 90000
      })
      const content = response.data?.choices?.[0]?.message?.content
      if (!content) throw new Error('VL模型返回为空')
      console.log('[AI] VL Part2 原始返回:', content.substring(0, 200))
      return robustJSONParse(content)
    } catch (err) {
      const errMsg = err.response?.data?.error?.message || err.message
      console.error(`VL Part2 第${attempt}次调用失败:`, errMsg)
      if (attempt === maxRetries) throw new Error(errMsg)
    }
  }
}

// ============================================================
// 穿搭咨询相关
// ============================================================

async function analyzeClothingVision(images, consultType = 'single') {
  const isCompare = consultType === 'compare'
  const labelPrefix = isCompare ? images.map((_, i) => `选项${String.fromCharCode(65 + i)}`).join('、') : '该单品'
  const prompt = `你是一位专业的时尚买手和穿搭顾问AI，请仔细观察${isCompare ? '以下多个' : '这'}穿搭单品图片，提取每个单品的视觉特征信息。

${isCompare ? `图片中有${images.length}个不同单品，分别标记为${labelPrefix}。请对每个分别分析。` : '请对该单品进行全面分析。'}

注意：单品可能是服装、口红/彩妆、配饰（帽子/围巾/领带/耳环/项链/手表/墨镜/腰带/包包/鞋子等）中的任何一种，请根据实际内容灵活分析。

以JSON格式输出：
{
  "items": [
    {
      "label": "${isCompare ? '选项A/B/C/D' : '该单品'}",
      "category": "单品类别（如：上衣/口红/帽子/耳环等）",
      "categoryType": "clothing/makeup/accessory",
      "subCategory": "细分类型",
      "color": { "main": "主色调", "secondary": "副色调", "tone": "冷暖调性", "saturation": "饱和度" },
      "fabric": { "type": "材质类型", "texture": "质感描述", "thickness": "厚薄/质地浓稠度", "drape": "垂坠感/上脸效果" },
      "fit": { "silhouette": "版型/外形", "shoulder": "肩型/佩戴方式", "length": "长度/尺寸", "detail": "剪裁/设计细节描述" },
      "style": { "overall": "整体风格", "occasion": "适合场景", "season": "适合季节/场合" },
      "craftsmanship": { "stitching": "工艺/做工", "details": "细节设计描述", "lining": "是否有内衬/包装", "overall": "品质整体评价" }
    }
  ]
}

请严格按照JSON格式输出，不要包含任何其他文字说明。`

  const content = []
  for (const img of images) {
    if (img.imageUrl) {
      content.push({ type: 'image_url', image_url: { url: img.imageUrl } })
    }
  }
  content.push({ type: 'text', text: prompt })

  try {
    const response = await axiosInstance.post(BASE_URL, {
      model: process.env.QWEN_VL_MODEL || 'qwen-vl-max',
      messages: [{ role: 'user', content }],
      temperature: 0.1, top_p: 0.8
    }, {
      headers: { 'Authorization': `Bearer ${QWEN_API_KEY}`, 'Content-Type': 'application/json' },
      timeout: 90000
    })
    const result = response.data?.choices?.[0]?.message?.content
    if (!result) throw new Error('VL模型返回为空')
    return robustJSONParse(result).items || robustJSONParse(result)
  } catch (err) {
    console.error('穿搭视觉分析失败:', err.response?.data || err.message)
    throw new Error(err.response?.data?.error?.message || err.message)
  }
}

async function generateSingleConsult(visualFeatures, userInfo = {}, isRetry = false, reportSummary = null) {
  const sceneLabel = userInfo.consultScene === 'buy' ? '购买决策' : '留存决策'
  const verdictOptions = userInfo.consultScene === 'buy' ? '建议购买 / 建议不买' : '建议自留 / 建议退货'
  const category = userInfo.category || ''
  const isMakeup = /口红|唇釉|腮红|眼影|粉底|彩妆/.test(category)
  const isAccessory = /帽子|围巾|领带|耳环|项链|手链|手镯|包包|鞋子|腰带|手表|墨镜|配饰/.test(category)

  // 根据品类选择评分维度
  let scoreDimensions, detailFormat
  if (isMakeup) {
    scoreDimensions = `"scores": { "colorScore": "色号匹配度 0-10", "textureScore": "质地显色度 0-10", "lastingScore": "持久度/实用性 0-10", "valueScore": "性价比 0-10" }`
    detailFormat = `"details": {
    "colorScore": { "pros": "色号优点(1-2句)", "cons": "色号不足(1-2句)" },
    "textureScore": { "pros": "质地显色优点(1-2句)", "cons": "质地显色不足(1-2句)" },
    "lastingScore": { "pros": "持久度/实用性优点(1-2句)", "cons": "持久度/实用性不足(1-2句)" },
    "valueScore": { "pros": "性价比优点(1-2句)", "cons": "性价比不足(1-2句)" }
  }`
  } else if (isAccessory) {
    scoreDimensions = `"scores": { "matchScore": "搭配适配度 0-10", "qualityScore": "材质做工 0-10", "styleScore": "风格适配度 0-10", "valueScore": "性价比 0-10" }`
    detailFormat = `"details": {
    "matchScore": { "pros": "搭配适配优点(1-2句)", "cons": "搭配适配不足(1-2句)" },
    "qualityScore": { "pros": "材质做工优点(1-2句)", "cons": "材质做工不足(1-2句)" },
    "styleScore": { "pros": "风格适配优点(1-2句)", "cons": "风格适配不足(1-2句)" },
    "valueScore": { "pros": "性价比优点(1-2句)", "cons": "性价比不足(1-2句)" }
  }`
  } else {
    scoreDimensions = `"scores": { "fitScore": "版型适合度 0-10", "colorScore": "颜色匹配度 0-10", "qualityScore": "质感做工 0-10", "valueScore": "性价比 0-10" }`
    detailFormat = `"details": {
    "fitScore": { "pros": "版型优点(1-2句)", "cons": "版型不足(1-2句)" },
    "colorScore": { "pros": "颜色优点(1-2句)", "cons": "颜色不足(1-2句)" },
    "qualityScore": { "pros": "质感优点(1-2句)", "cons": "质感不足(1-2句)" },
    "valueScore": { "pros": "性价比优点(1-2句)", "cons": "性价比不足(1-2句)" }
  }`
  }

  // 构建形象诊断报告的量身定制信息
  let reportSection = ''
  if (reportSummary) {
    const lines = ['## 该用户的形象诊断报告（必须据此量身定制分析）']
    if (reportSummary.faceType) lines.push(`- 脸型：${reportSummary.faceType}`)
    if (reportSummary.boneType) lines.push(`- 骨相类型：${reportSummary.boneType}`)
    if (reportSummary.lineStyle) lines.push(`- 面部线条：${reportSummary.lineStyle}`)
    if (reportSummary.dnaInsight) lines.push(`- 骨相洞察：${reportSummary.dnaInsight}`)
    if (reportSummary.season) lines.push(`- 色彩季型：${reportSummary.season}`)
    if (reportSummary.skinType) lines.push(`- 肤色类型：${reportSummary.skinType}`)
    if (reportSummary.mainStyle) lines.push(`- 主风格：${reportSummary.mainStyle}`)
    if (reportSummary.styleFeatures) {
      const sf = reportSummary.styleFeatures
      if (sf.mass) lines.push(`- 量感：${sf.mass}`)
      if (sf.curve) lines.push(`- 直曲：${sf.curve}`)
      if (sf.movement) lines.push(`- 动静：${sf.movement}`)
    }
    if (reportSummary.clothingAdvice) {
      const ca = reportSummary.clothingAdvice
      if (ca.silhouette) lines.push(`- 适配版型：${ca.silhouette}`)
      if (ca.material) lines.push(`- 适配材质：${ca.material}`)
      if (ca.pattern) lines.push(`- 适配图案：${ca.pattern}`)
      if (ca.accessory) lines.push(`- 适配配饰：${ca.accessory}`)
    }
    if (reportSummary.goodColors && reportSummary.goodColors.length > 0) {
      lines.push(`- 适配色系：${reportSummary.goodColors.join('、')}`)
    }
    if (reportSummary.badColors && reportSummary.badColors.length > 0) {
      lines.push(`- 避雷色系：${reportSummary.badColors.join('、')}`)
    }
    if (reportSummary.styleInsight) lines.push(`- 风格洞察：${reportSummary.styleInsight}`)
    if (reportSummary.coreConclusion) lines.push(`- 核心结论：${reportSummary.coreConclusion}`)
    if (reportSummary.optimizeInsight) lines.push(`- 优化洞察：${reportSummary.optimizeInsight}`)
    reportSection = lines.join('\n') + '\n\n**重要：请务必结合以上个人形象特征进行针对性分析，评分和建议都要体现"量身定制"。例如：颜色分析要对照适配/避雷色系，版型分析要对照骨相和风格特征。**'
  }

  const prompt = `你是一位拥有15年经验的资深时尚买手和穿搭顾问AI，请根据以下${isMakeup ? '彩妆' : isAccessory ? '配饰' : '服饰'}视觉特征和个人信息，进行专业的单品决策分析。

## ${isMakeup ? '彩妆' : isAccessory ? '配饰' : '服饰'}视觉特征
${JSON.stringify(visualFeatures, null, 2)}

## 填写信息
- 穿搭类别：${userInfo.category || '未知'}
- 价格区间：${userInfo.priceRange || '未知'}
- 身型特点：${userInfo.bodyFeatures && userInfo.bodyFeatures.length > 0 ? userInfo.bodyFeatures.join('、') : '未选择'}
- 穿着场景：${userInfo.wearScenes && userInfo.wearScenes.length > 0 ? userInfo.wearScenes.join('、') : '未选择'}
- 穿搭困扰：${userInfo.trouble || '未选择'}
- 决策场景：${sceneLabel}

${reportSection}

## 请严格按照以下JSON格式输出（禁止输出任何其他文字）：

{
  ${scoreDimensions},
  "verdict": "${verdictOptions}二者选一",
  ${detailFormat},
  "tips": ["穿搭优化建议1", "建议2", "建议3"],
  "dadaComment": "以哒哒(AI时尚猫咪)口吻的1-2句幽默点评",
  "personalReason": "基于用户个人形象特征的1-2句针对性理由（如：你的肤色属冷夏型，这件暖橘色与你不匹配；你是优雅型风格，这件街头风偏大不太适合你等。无诊断报告时填空字符串）",
  "outfitAdvice": [
    { "type": "accessory", "icon": "ring", "title": "饰品搭配", "description": "具体建议(1-2句)", "reason": "搭配理由" },
    { "type": "hairstyle", "icon": "hair", "title": "发型搭配", "description": "具体建议(1-2句)", "reason": "搭配理由" },
    { "type": "makeup", "icon": "makeup", "title": "妆容搭配", "description": "具体建议(1-2句)", "reason": "搭配理由" },
    { "type": "shoes", "icon": "heel", "title": "鞋履搭配", "description": "具体建议(1-2句)", "reason": "搭配理由" },
    { "type": "bag", "icon": "bag", "title": "包包搭配", "description": "具体建议(1-2句)", "reason": "搭配理由" }
  ]
}

严格JSON格式输出。`

  try {
    const response = await axiosInstance.post(BASE_URL, {
      model: process.env.QWEN_TEXT_MODEL || 'qwen-plus',
      messages: [
        { role: 'system', content: '你是专业的时尚买手AI，必须给出明确结论。严格输出JSON格式。' },
        { role: 'user', content: prompt }
      ],
      temperature: isRetry ? 0.5 : 0.3, top_p: 0.85, max_tokens: 2500
    }, {
      headers: { 'Authorization': `Bearer ${QWEN_API_KEY}`, 'Content-Type': 'application/json' },
      timeout: 90000
    })
    const content = response.data?.choices?.[0]?.message?.content
    if (!content) throw new Error('模型返回为空')
    return robustJSONParse(content)
  } catch (err) {
    console.error('单品决策生成失败:', err.response?.data || err.message)
    throw new Error(err.response?.data?.error?.message || err.message)
  }
}

async function generateCompareConsult(visualFeatures, userInfo = {}, isRetry = false, reportSummary = null) {
  const items = Array.isArray(visualFeatures) ? visualFeatures : [visualFeatures]
  const itemLabels = items.map((_, i) => `选项${String.fromCharCode(65 + i)}`).join('、')
  // 检测品类类型
  const categoryType = items[0]?.categoryType || ''
  const isMakeup = categoryType === 'makeup' || /口红|唇釉|腮红|眼影|粉底|彩妆/.test(items[0]?.category || '')
  const isAccessory = categoryType === 'accessory' || /帽子|围巾|领带|耳环|项链|手链|手镯|包包|鞋子|腰带|手表|墨镜|配饰/.test(items[0]?.category || '')
  const itemTypeLabel = isMakeup ? '彩妆' : isAccessory ? '配饰' : '服饰'

  // 根据品类选择对比维度
  let compareDimensions, scoreKeys
  if (isMakeup) {
    compareDimensions = ['色号匹配', '质地显色', '持久实用', '性价比']
    scoreKeys = ['colorScore', 'textureScore', 'lastingScore', 'valueScore']
  } else if (isAccessory) {
    compareDimensions = ['搭配适配', '材质做工', '风格适配', '性价比']
    scoreKeys = ['matchScore', 'qualityScore', 'styleScore', 'valueScore']
  } else {
    compareDimensions = ['显瘦修饰', '日常百搭', '场合适配', '质感高级', '性价比', '耐看实用']
    scoreKeys = ['slimScore', 'versatileScore', 'occasionScore', 'qualityScore', 'valueScore', 'durableScore']
  }

  // 构建形象诊断报告的量身定制信息
  let reportSection = ''
  if (reportSummary) {
    const lines = ['## 该用户的形象诊断报告（必须据此量身定制分析）']
    if (reportSummary.faceType) lines.push(`- 脸型：${reportSummary.faceType}`)
    if (reportSummary.boneType) lines.push(`- 骨相类型：${reportSummary.boneType}`)
    if (reportSummary.lineStyle) lines.push(`- 面部线条：${reportSummary.lineStyle}`)
    if (reportSummary.dnaInsight) lines.push(`- 骨相洞察：${reportSummary.dnaInsight}`)
    if (reportSummary.season) lines.push(`- 色彩季型：${reportSummary.season}`)
    if (reportSummary.skinType) lines.push(`- 肤色类型：${reportSummary.skinType}`)
    if (reportSummary.mainStyle) lines.push(`- 主风格：${reportSummary.mainStyle}`)
    if (reportSummary.styleFeatures) {
      const sf = reportSummary.styleFeatures
      if (sf.mass) lines.push(`- 量感：${sf.mass}`)
      if (sf.curve) lines.push(`- 直曲：${sf.curve}`)
      if (sf.movement) lines.push(`- 动静：${sf.movement}`)
    }
    if (reportSummary.clothingAdvice) {
      const ca = reportSummary.clothingAdvice
      if (ca.silhouette) lines.push(`- 适配版型：${ca.silhouette}`)
      if (ca.material) lines.push(`- 适配材质：${ca.material}`)
      if (ca.pattern) lines.push(`- 适配图案：${ca.pattern}`)
      if (ca.accessory) lines.push(`- 适配配饰：${ca.accessory}`)
    }
    if (reportSummary.goodColors && reportSummary.goodColors.length > 0) {
      lines.push(`- 适配色系：${reportSummary.goodColors.join('、')}`)
    }
    if (reportSummary.badColors && reportSummary.badColors.length > 0) {
      lines.push(`- 避雷色系：${reportSummary.badColors.join('、')}`)
    }
    if (reportSummary.styleInsight) lines.push(`- 风格洞察：${reportSummary.styleInsight}`)
    if (reportSummary.coreConclusion) lines.push(`- 核心结论：${reportSummary.coreConclusion}`)
    if (reportSummary.optimizeInsight) lines.push(`- 优化洞察：${reportSummary.optimizeInsight}`)
    reportSection = lines.join('\n') + '\n\n**重要：请务必结合以上个人形象特征进行针对性对比分析，评分和推荐都要体现"量身定制"。哪款更契合用户的脸型、肤色、风格，就给更高分。**'
  }

  const prompt = `你是一位拥有15年经验的资深时尚买手AI，请对以下${items.length}件${itemTypeLabel}单品进行横向对比分析。

## ${itemTypeLabel}视觉特征（${itemLabels}）
${JSON.stringify(visualFeatures, null, 2)}

## 补充信息
- 对比场景：${userInfo.compareScene || '未指定'}

${reportSection}

## 请严格按照以下JSON格式输出：

{
  "rankings": [{ "index": 0, "label": "选项A", "totalScore": 0 }],
  "scores": [{ "index": 0, "label": "选项A", "${scoreKeys.join('": 0-10, "')}": 0-10 }],
  "comparisons": [{ "index": 0, "label": "选项A", "pros": "优势(1-2句)", "cons": "不足(1-2句)" }],
  "finalChoice": { "index": 0, "label": "选项X", "reason": "核心理由(1-2句)" },
  "bestScenarios": [{ "index": 0, "label": "选项A", "scenario": "最佳场景" }],
  "dadaComment": "以哒哒口吻的1-2句幽默点评",
  "personalReason": "基于用户个人形象特征的1-2句针对性理由（如：你的肤色属冷夏型，A款的冷色调更衬你等。无诊断报告时填空字符串）",
  "outfitAdvice": [
    { "type": "accessory", "icon": "ring", "title": "饰品搭配", "description": "建议", "reason": "理由" },
    { "type": "hairstyle", "icon": "hair", "title": "发型搭配", "description": "建议", "reason": "理由" },
    { "type": "makeup", "icon": "makeup", "title": "妆容搭配", "description": "建议", "reason": "理由" },
    { "type": "shoes", "icon": "heel", "title": "鞋履搭配", "description": "建议", "reason": "理由" },
    { "type": "bag", "icon": "bag", "title": "包包搭配", "description": "建议", "reason": "理由" }
  ]
}

严格JSON格式输出。`

  try {
    const response = await axiosInstance.post(BASE_URL, {
      model: process.env.QWEN_TEXT_MODEL || 'qwen-plus',
      messages: [
        { role: 'system', content: '你是专业的时尚买手AI，必须给出明确排名。严格输出JSON格式。' },
        { role: 'user', content: prompt }
      ],
      temperature: isRetry ? 0.5 : 0.3, top_p: 0.85, max_tokens: 2500
    }, {
      headers: { 'Authorization': `Bearer ${QWEN_API_KEY}`, 'Content-Type': 'application/json' },
      timeout: 90000
    })
    const content = response.data?.choices?.[0]?.message?.content
    if (!content) throw new Error('模型返回为空')
    return robustJSONParse(content)
  } catch (err) {
    console.error('多选一决策生成失败:', err.response?.data || err.message)
    throw new Error(err.response?.data?.error?.message || err.message)
  }
}

async function detectCategory(images) {
  const prompt = `请识别这个穿搭单品的类别，只能从以下选项中选择一个返回：上衣、裤子、半裙、连衣裙、外套、衬衫、T恤、针织衫、卫衣、风衣、大衣、羽绒服、牛仔、口红/唇釉、腮红、眼影、帽子、围巾、领带、耳环、项链、手链/手镯、包包、鞋子、腰带、手表、墨镜、其他\n\n直接返回类别名称，不要输出任何其他文字。`
  const content = []
  for (const img of images) {
    if (img.imageUrl) content.push({ type: 'image_url', image_url: { url: img.imageUrl } })
  }
  content.push({ type: 'text', text: prompt })
  try {
    const response = await axiosInstance.post(BASE_URL, {
      model: process.env.QWEN_VL_MODEL || 'qwen-vl-max',
      messages: [{ role: 'user', content }],
      temperature: 0.1, top_p: 0.8, max_tokens: 20
    }, {
      headers: { 'Authorization': `Bearer ${QWEN_API_KEY}`, 'Content-Type': 'application/json' },
      timeout: 30000
    })
    const result = response.data?.choices?.[0]?.message?.content?.trim()
    if (!result) throw new Error('VL模型返回为空')
    return result
  } catch (err) {
    console.error('服装类别识别失败:', err.response?.data || err.message)
    throw new Error(err.response?.data?.error?.message || err.message)
  }
}

module.exports = {
  analyzePart1, analyzePart2,
  analyzeClothingVision, generateSingleConsult, generateCompareConsult, detectCategory,
  generateBeautyPlan
}

// ============================================================
// 28天蜕变计划生成
// ============================================================
/**
 * 根据用户诊断报告关键摘要，生成 28 天 × 每天 3 个变美小行为
 * @param {object} summary { faceShape, skinSeason, skinType, mainStyle, shoulderType, bodyRatio, weaknesses, gender }
 * @returns { days: [{day, theme, tasks: [{title, desc, cat, duration}]}] }
 */
async function generateBeautyPlan(summary = {}) {
  const s = summary || {}
  const userPart = [
    s.gender ? `性别: ${s.gender}` : '',
    s.faceShape ? `脸型: ${s.faceShape}` : '',
    s.skinSeason ? `肤色季型: ${s.skinSeason}` : '',
    s.skinType ? `肤色类型: ${s.skinType}` : '',
    s.mainStyle ? `主风格: ${s.mainStyle}` : '',
    s.shoulderType ? `肩型: ${s.shoulderType}` : '',
    s.bodyRatio ? `身材比例: ${s.bodyRatio}` : '',
    s.weaknesses ? `当前短板: ${s.weaknesses}` : ''
  ].filter(Boolean).join('\n')

  const prompt = `你是一位资深形象顾问 + 健康教练。请基于用户的"形象诊断报告摘要"，为她/他制定一份"28天蜕变计划"，每天 3 件可量化、可打勾完成的小事，覆盖：运动塑形、面部/头部按摩、皮肤护理、体态气质、习惯养成五大方向，难度循序渐进。

【用户诊断摘要】
${userPart || '（暂无具体诊断信息，按通用方案生成）'}

【输出要求】
1. 严格输出合法 JSON，不要任何额外解释、不要 markdown 代码块。
2. 结构如下：
{
  "focuses": ["精致下颌线", "提亮气色", "改善体态"],
  "days": [
    {
      "day": 1,
      "theme": "启动周·激活循环",
      "tasks": [
        {"title": "开合跳 20 个", "desc": "唤醒全身代谢", "cat": "运动", "duration": "2 分钟"},
        {"title": "头部按摩 20 下", "desc": "太阳穴+风池穴打圈", "cat": "保养", "duration": "2 分钟"},
        {"title": "喝水 8 杯", "desc": "改善皮肤水润度", "cat": "习惯", "duration": "全天"}
      ]
    }
    // ...共 28 天
  ]
}
3. focuses 必须是 3 个简短的中文短语（每个不超过8字），代表本计划核心改善的 3 个点，需要紧贴用户的脸型/肤色/风格/体型/短板信息，例如"精致下颌线/提亮冷调气色/纠正含胸"。
4. 必须正好 28 天，每天 tasks 数量为 3。
5. 每个 task 的 title 需要量化（含次数/时长/具体动作），如"仰卧起坐 20 个"、"靠墙站 10 分钟"、"颈部拉伸 5 分钟"。
6. cat 字段从这些里选：运动 / 护肤 / 发型 / 妆容 / 体态 / 习惯。其中至少包含 1 天的"发型"任务（如练习编发/打理刘海/护发精油按摩），至少 1 天的"妆容"任务（如练习画眉/口红试色/底妆步骤）。
7. 计划应结合用户的脸型、肤色、风格、体型给出针对性动作（例如圆脸→咬肌按摩；冷调→冷色穿搭尝试；溜肩→肩部塑形）。
8. 28 天分 4 周：启动、坚持、进阶、冲刺，theme 字段简短点题（不超过10字）。
9. 语气亲切、可执行，不堆砌口号。`

  const apiKey = QWEN_API_KEY
  if (!apiKey) throw new Error('未配置 QWEN_API_KEY')

  const response = await axiosInstance.post(BASE_URL, {
    model: process.env.QWEN_TEXT_MODEL || 'qwen-plus',
    messages: [
      { role: 'system', content: '你是专业形象顾问与健康教练，擅长制定循序渐进的变美执行计划。严格输出 JSON。' },
      { role: 'user', content: prompt }
    ],
    temperature: 0.7,
    top_p: 0.9,
    max_tokens: 4000,
    response_format: { type: 'json_object' }
  }, {
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    timeout: 90000
  })

  const text = response.data?.choices?.[0]?.message?.content
  if (!text) throw new Error('大模型返回为空')
  const data = robustJSONParse(text)
  if (!data || !Array.isArray(data.days)) throw new Error('返回结构不合法')
  return data
}
