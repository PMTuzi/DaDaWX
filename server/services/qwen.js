// 通义千问 API 服务（OpenAI 兼容模式）
const axios = require('axios')

/**
 * 健壮的 JSON 解析：尝试修复 LLM 输出的常见 JSON 错误
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
  fixed = fixed.replace(/(\d|"|')\s*\n\s*(["{\[\d])/g, '$1,\n$2')
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
  throw new Error('JSON解析失败，已尝试所有修复方案')
}

const QWEN_API_KEY = process.env.QWEN_API_KEY
const BASE_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions'

/**
 * 步骤1: 视觉大模型 - 深度面部特征提取
 * 包含：三庭五眼、骨相皮相、皮肤状态、发型分析等
 */
async function analyzeVision(imageInput, photoType = 'face') {
  const prompt = `你是一位顶级形象分析AI，请仔细观察这张${photoType === 'face' ? '人脸正面' : '全身'}照片，进行深度面部特征提取，以JSON格式输出：

{
  "faceShape": {
    "type": "oval/round/square/long/diamond/heart",
    "score": 0-10,
    "smoothness": 0-10,
    "boneStructure": 0-10,
    "proportion": 0-10,
    "boneType": "骨相型/皮相型/骨皮均衡",
    "boneDesc": "骨相特点详细描述(颧骨/下颌/眉骨等)",
    "faceWidth": "宽/适中/窄",
    "faceLength": "长/适中/短"
  },
  "threeCourtsFiveEyes": {
    "upperCourt": "上庭比例描述(发际线到眉骨)",
    "middleCourt": "中庭比例描述(眉骨到鼻底)",
    "lowerCourt": "下庭比例描述(鼻底到下巴)",
    "courtBalance": "均衡/上长/中长/下长",
    "leftEyeWidth": "左眼宽度比例",
    "rightEyeWidth": "右眼宽度比例",
    "interEyeDistance": "两眼间距描述",
    "eyeBalance": "均衡/眼距宽/眼距窄"
  },
  "skinStatus": {
    "undertone": "cool/warm/neutral",
    "brightness": 0-10,
    "purity": 0-10,
    "spots": "none/few/moderate/many",
    "spotDesc": "斑点详细描述(位置/类型/程度)",
    "darkCircles": "none/mild/moderate/severe",
    "darkCircleDesc": "黑眼圈详细描述(类型/颜色/范围)",
    "pores": "细腻/一般/粗大",
    "texture": "光滑/一般/粗糙",
    "redness": "无/轻微/明显",
    "oiliness": "干性/中性/混合/油性",
    "overallSkinAge": "比实际年龄年轻/相符/显老"
  },
  "hairStatus": {
    "currentLength": "短/中/长/无法判断",
    "currentStyle": "当前发型描述",
    "hairVolume": "多/适中/少",
    "hairTexture": "细软/适中/粗硬",
    "hairCondition": "健康/一般/受损",
    "faceFraming": "当前发型对脸型的修饰效果描述"
  },
  "features": {
    "eyeShape": "详细描述(杏眼/桃花眼/丹凤眼/圆眼等)",
    "eyeSize": "大/适中/小",
    "eyeSpacing": "宽/适中/窄",
    "noseShape": "详细描述(挺直/小巧/圆润/鹰钩等)",
    "noseSize": "大/适中/小",
    "lipShape": "详细描述(薄唇/厚唇/上薄下厚/微笑唇等)",
    "lipSize": "大/适中/小",
    "eyebrowShape": "详细描述(平眉/挑眉/弯眉/粗眉等)",
    "eyebrowThickness": "粗/适中/细",
    "jawline": "详细描述(圆润/清晰/方钝/尖削等)",
    "forehead": "详细描述(宽阔/适中/窄/发际线形状等)",
    "chinShape": "详细描述(尖/圆/方/微翘等)"
  },
  "styleIndicators": {
    "mass": "大/中/小",
    "curve": "直/偏曲/曲",
    "movement": "动/偏静/静"
  },
  "bodyIndicators": {
    "shoulderType": "描述",
    "bodyRatio": "描述"
  }
}

请严格按照JSON格式输出，不要包含任何其他文字说明。`

  try {
    const response = await axios.post(
      BASE_URL,
      {
        model: process.env.QWEN_VL_MODEL || 'qwen-vl-max',
        messages: [{
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: imageInput } },
            { type: 'text', text: prompt }
          ]
        }],
        temperature: 0.1,
        top_p: 0.8
      },
      {
        headers: {
          'Authorization': `Bearer ${QWEN_API_KEY}`,
          'Content-Type': 'application/json'
        },
        timeout: 90000
      }
    )

    const content = response.data?.choices?.[0]?.message?.content
    if (!content) throw new Error('VL模型返回为空')
    console.log('[AI] VL模型原始返回:', content.substring(0, 200))
    return robustJSONParse(content)
  } catch (err) {
    console.error('通义千问-VL调用失败:', err.response?.data || err.message)
    throw new Error(err.response?.data?.error?.message || err.message)
  }
}

/**
 * 步骤2: 分模块生成报告（4个独立调用，避免单次超时）
 */

// 模块1: 骨相分析
async function generateBoneAnalysis(visualFeatures, gender = 'female') {
  const genderLabel = gender === 'male' ? '男性' : '女性'
  const prompt = `你是一位拥有20年经验的顶级形象顾问AI，请根据以下${genderLabel}用户的面部视觉特征，生成「骨相分析」模块的专业报告。

## 用户视觉特征数据
${JSON.stringify(visualFeatures, null, 2)}

## 请严格按照以下JSON格式输出：

{
  "title": "骨相分析",
  "faceType": "脸型名称",
  "faceScore": 0-10,
  "boneType": "骨相型/皮相型/骨皮均衡",
  "boneDesc": "骨相特点2-3句详细描述",
  "threeCourts": {
    "upper": "上庭比例分析与修饰建议",
    "middle": "中庭比例分析与修饰建议",
    "lower": "下庭比例分析与修饰建议",
    "balance": "三庭总体评价与优化方向"
  },
  "fiveEyes": {
    "analysis": "五眼比例分析",
    "suggestion": "眼距修饰建议(妆容/发型)"
  },
  "faceFeatures": [
    { "name": "颧骨", "desc": "描述", "score": 0-10 },
    { "name": "下颌线", "desc": "描述", "score": 0-10 },
    { "name": "眉骨", "desc": "描述", "score": 0-10 },
    { "name": "鼻梁", "desc": "描述", "score": 0-10 },
    { "name": "下巴", "desc": "描述", "score": 0-10 }
  ],
  "suitableHaircuts": [
    { "name": "发型名", "length": "短/中/长", "outline": "轮廓", "bangs": "刘海建议", "reason": "适合原因", "score": 0-10 }
  ],
  "avoidHaircuts": [
    { "name": "避雷发型", "reason": "原因" }
  ],
  "suitableCollars": [
    { "type": "领型", "reason": "原因", "score": 0-10 }
  ],
  "keyInsight": "1-2句骨相核心洞察"
}

要求：suitableHaircuts至少5个，avoidHaircuts至少3个，suitableCollars至少4个。严格JSON格式。`

  try {
    const response = await axios.post(BASE_URL, {
      model: process.env.QWEN_TEXT_MODEL || 'qwen-plus',
      messages: [
        { role: 'system', content: '你是顶级形象顾问AI，擅长骨相分析。严格输出JSON格式。' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.3, top_p: 0.85, max_tokens: 2048
    }, {
      headers: { 'Authorization': `Bearer ${QWEN_API_KEY}`, 'Content-Type': 'application/json' },
      timeout: 60000
    })
    const content = response.data?.choices?.[0]?.message?.content
    if (!content) throw new Error('模型返回为空')
    return robustJSONParse(content)
  } catch (err) {
    console.error('骨相分析生成失败:', err.response?.data || err.message)
    throw new Error(err.response?.data?.error?.message || err.message)
  }
}

// 模块2: 皮肤状态
async function generateSkinAnalysis(visualFeatures, gender = 'female') {
  const prompt = `你是一位顶级皮肤科+形象顾问AI，请根据以下面部视觉特征，生成「皮肤状态」模块的专业报告。

## 用户视觉特征数据
${JSON.stringify(visualFeatures, null, 2)}

## 请严格按照以下JSON格式输出：

{
  "title": "皮肤状态",
  "skinType": "冷皮/暖皮/中性皮",
  "brightness": 0-10,
  "purity": 0-10,
  "skinAge": "皮肤视觉年龄评估",
  "overallDesc": "皮肤整体状态2-3句描述",
  "problems": [
    { "name": "问题名(如斑点/黑眼圈/毛孔/暗沉/泛红等)", "level": "无/轻微/中等/明显", "area": "位置", "advice": "改善建议" }
  ],
  "season": "四季色彩季型(如冷夏/暖秋)",
  "seasonDetail": "季型详细说明",
  "goodColors": [
    { "name": "颜色名", "hex": "#色值", "usage": "穿搭/妆容使用场景" }
  ],
  "badColors": [
    { "name": "避雷色名", "hex": "#色值", "reason": "原因" }
  ],
  "goodHairColors": [
    { "name": "适配发色", "detail": "深浅色调描述" }
  ],
  "badHairColors": [
    { "name": "避雷发色", "reason": "原因" }
  ],
  "skincareAdvice": ["护肤建议1", "建议2", "建议3"],
  "keyInsight": "1-2句肤色核心洞察"
}

要求：problems至少3个，goodColors至少8个带真实hex色值，badColors至少4个。严格JSON格式。`

  try {
    const response = await axios.post(BASE_URL, {
      model: process.env.QWEN_TEXT_MODEL || 'qwen-plus',
      messages: [
        { role: 'system', content: '你是顶级皮肤科+形象顾问AI。严格输出JSON格式。' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.3, top_p: 0.85, max_tokens: 2048
    }, {
      headers: { 'Authorization': `Bearer ${QWEN_API_KEY}`, 'Content-Type': 'application/json' },
      timeout: 60000
    })
    const content = response.data?.choices?.[0]?.message?.content
    if (!content) throw new Error('模型返回为空')
    return robustJSONParse(content)
  } catch (err) {
    console.error('皮肤分析生成失败:', err.response?.data || err.message)
    throw new Error(err.response?.data?.error?.message || err.message)
  }
}

// 模块3: 色彩风格
async function generateColorStyle(visualFeatures, gender = 'female') {
  const prompt = `你是一位顶级色彩顾问+风格分析师AI，请根据以下面部视觉特征，生成「色彩风格」模块的专业报告。

## 用户视觉特征数据
${JSON.stringify(visualFeatures, null, 2)}

## 请严格按照以下JSON格式输出：

{
  "title": "色彩风格",
  "mainStyle": "主风格名称",
  "mainScore": 0-10,
  "styleDesc": "风格核心特征2-3句描述",
  "subStyles": [
    { "name": "副风格名", "score": 0-10, "desc": "简述" }
  ],
  "styleFeatures": {
    "mass": "量感描述(大/中/小)及原因",
    "curve": "直曲描述及原因",
    "movement": "动静描述及原因"
  },
  "colorPalette": {
    "primary": ["主色调1", "主色调2", "主色调3"],
    "secondary": ["辅助色1", "辅助色2", "辅助色3"],
    "neutral": ["中性色1", "中性色2", "中性色3"],
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
  "outfitItems": [
    { "name": "单品名", "type": "上衣/下装/外套/配饰", "color": "颜色", "material": "材质", "scene": "适配场景", "score": 0-10 }
  ],
  "avoidItems": [
    { "name": "避雷单品", "reason": "原因" }
  ],
  "keyInsight": "1-2句风格核心洞察"
}

要求：outfitItems至少8个，avoidItems至少3个，sceneAdvice必须4个场景。严格JSON格式。`

  try {
    const response = await axios.post(BASE_URL, {
      model: process.env.QWEN_TEXT_MODEL || 'qwen-plus',
      messages: [
        { role: 'system', content: '你是顶级色彩顾问+风格分析师AI。严格输出JSON格式。' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.3, top_p: 0.85, max_tokens: 2048
    }, {
      headers: { 'Authorization': `Bearer ${QWEN_API_KEY}`, 'Content-Type': 'application/json' },
      timeout: 60000
    })
    const content = response.data?.choices?.[0]?.message?.content
    if (!content) throw new Error('模型返回为空')
    return robustJSONParse(content)
  } catch (err) {
    console.error('色彩风格生成失败:', err.response?.data || err.message)
    throw new Error(err.response?.data?.error?.message || err.message)
  }
}

// 模块4: 穿搭风格
async function generateOutfitStyle(visualFeatures, gender = 'female') {
  const prompt = `你是一位顶级形象顾问+发型师+化妆师AI，请根据以下面部视觉特征，生成「穿搭风格」模块的专业报告，涵盖发型、妆容和身形。

## 用户视觉特征数据
${JSON.stringify(visualFeatures, null, 2)}

## 请严格按照以下JSON格式输出：

{
  "title": "穿搭风格",
  "hairRecommend": {
    "top3": [
      { "name": "发型名", "length": "长度", "layers": "层次描述", "bangs": "刘海建议", "care": "打理要点", "reason": "适合原因", "score": 0-10 }
    ],
    "alternatives": [
      { "name": "备选发型", "length": "长度", "style": "风格", "score": 0-10 }
    ],
    "hairColors": [
      { "name": "适配发色", "detail": "深浅色调描述" }
    ],
    "avoidHair": [
      { "name": "避雷发型", "reason": "原因" }
    ]
  },
  "makeup": {
    "style": "适配妆容风格",
    "foundation": { "tone": "粉底色调", "shade": "色号建议", "concealer": "遮瑕重点" },
    "eyeBrow": { "shape": "眉形建议", "shadow": "眼影色调", "eyeliner": "眼线风格" },
    "lipRecommend": { "destiny": "本命口红色号", "daily": "日常口红色号" },
    "avoidMakeup": ["避雷妆容1", "避雷妆容2"]
  },
  "bodyShape": {
    "shoulderType": "肩型",
    "bodyRatio": "身形比例",
    "suitableTop": [
      { "type": "上衣版型", "reason": "原因", "score": 0-10 }
    ],
    "suitableBottom": [
      { "type": "下装版型", "reason": "原因", "score": 0-10 }
    ],
    "avoidStyles": [
      { "type": "避雷版型", "reason": "原因" }
    ],
    "tips": ["比例优化技巧1", "技巧2", "技巧3"]
  },
  "summary": {
    "coreConclusion": "形象定位+适配核心逻辑",
    "priorityAdvice": "发型/穿搭/妆容改造优先级建议",
    "dailyTips": ["日常技巧1", "技巧2", "技巧3"]
  },
  "keyInsight": "1-2句穿搭核心洞察"
}

要求：top3发型必须3个，alternatives至少3个，avoidHair至少3个，suitableTop至少3个，suitableBottom至少3个。严格JSON格式。`

  try {
    const response = await axios.post(BASE_URL, {
      model: process.env.QWEN_TEXT_MODEL || 'qwen-plus',
      messages: [
        { role: 'system', content: '你是顶级形象顾问+发型师+化妆师AI。严格输出JSON格式。' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.3, top_p: 0.85, max_tokens: 2048
    }, {
      headers: { 'Authorization': `Bearer ${QWEN_API_KEY}`, 'Content-Type': 'application/json' },
      timeout: 60000
    })
    const content = response.data?.choices?.[0]?.message?.content
    if (!content) throw new Error('模型返回为空')
    return robustJSONParse(content)
  } catch (err) {
    console.error('穿搭风格生成失败:', err.response?.data || err.message)
    throw new Error(err.response?.data?.error?.message || err.message)
  }
}

/**
 * 保留原有的 generateReport（兼容旧接口）
 * 内部调用4个分模块
 */
async function generateReport(visualFeatures, userTags = [], quantMetrics = {}, gender = 'female') {
  console.log('[AI] 开始分模块生成报告...')
  const t0 = Date.now()

  // 并行调用4个模块
  const [boneAnalysis, skinAnalysis, colorStyle, outfitStyle] = await Promise.all([
    generateBoneAnalysis(visualFeatures, gender).catch(err => {
      console.error('[AI] 骨相分析失败:', err.message)
      return { title: '骨相分析', error: err.message }
    }),
    generateSkinAnalysis(visualFeatures, gender).catch(err => {
      console.error('[AI] 皮肤分析失败:', err.message)
      return { title: '皮肤状态', error: err.message }
    }),
    generateColorStyle(visualFeatures, gender).catch(err => {
      console.error('[AI] 色彩风格失败:', err.message)
      return { title: '色彩风格', error: err.message }
    }),
    generateOutfitStyle(visualFeatures, gender).catch(err => {
      console.error('[AI] 穿搭风格失败:', err.message)
      return { title: '穿搭风格', error: err.message }
    })
  ])

  console.log(`[AI] 4模块报告生成完成, 耗时: ${Date.now() - t0}ms`)

  // 计算综合评分
  const faceScore = boneAnalysis.faceScore || 7
  const skinScore = ((skinAnalysis.brightness || 7) + (skinAnalysis.purity || 7)) / 2
  const styleScore = colorStyle.mainScore || 7
  const overallScore = Math.round((faceScore * 0.35 + skinScore * 0.3 + styleScore * 0.2 + 7 * 0.15) * 10) / 10

  // 合并为完整报告
  const report = {
    basic: {
      overallScore,
      tags: [
        boneAnalysis.faceType || '待分析',
        skinAnalysis.season || '待分析',
        colorStyle.mainStyle || '待分析',
        (visualFeatures.styleIndicators || {}).mass || '中等'
      ],
      advantages: boneAnalysis.keyInsight || '分析完成',
      weaknesses: skinAnalysis.problems?.[0]?.advice || ''
    },
    // 4个模块
    modules: {
      bone: boneAnalysis,
      skin: skinAnalysis,
      colorStyle: colorStyle,
      outfit: outfitStyle
    },
    // 兼容旧字段（从modules中提取）
    faceShape: {
      type: boneAnalysis.faceType || '待分析',
      score: boneAnalysis.faceScore || 7,
      features: { smoothness: (visualFeatures.faceShape || {}).smoothness || 7, boneStructure: (visualFeatures.faceShape || {}).boneStructure || 7, proportion: (visualFeatures.faceShape || {}).proportion || 7 },
      suitableHaircuts: boneAnalysis.suitableHaircuts || [],
      avoidHaircuts: boneAnalysis.avoidHaircuts || [],
      suitableCollars: boneAnalysis.suitableCollars || []
    },
    skinColor: {
      type: skinAnalysis.skinType || '待分析',
      brightness: skinAnalysis.brightness || 7,
      purity: skinAnalysis.purity || 7,
      season: skinAnalysis.season || '待分析',
      seasonDetail: skinAnalysis.seasonDetail || '',
      goodColors: skinAnalysis.goodColors || [],
      badColors: skinAnalysis.badColors || [],
      goodHairColors: skinAnalysis.goodHairColors || [],
      badHairColors: skinAnalysis.badHairColors || []
    },
    style: {
      mainStyle: colorStyle.mainStyle || '待分析',
      mainScore: colorStyle.mainScore || 7,
      subStyles: colorStyle.subStyles || [],
      features: colorStyle.styleFeatures || { mass: '中', curve: '中性', movement: '中性' },
      clothingAdvice: colorStyle.clothingAdvice || {},
      sceneAdvice: colorStyle.sceneAdvice || []
    },
    bodyShape: outfitStyle.bodyShape || { shoulderType: '待分析', bodyRatio: '待分析', suitableTop: [], suitableBottom: [], avoidStyles: [], tips: [] },
    outfitItems: { recommended: colorStyle.outfitItems || [], avoidItems: colorStyle.avoidItems || [] },
    hairRecommend: outfitStyle.hairRecommend || { top3: [], alternatives: [], hairColors: [], avoidHair: [] },
    makeup: outfitStyle.makeup || { style: '待分析', foundation: {}, eyeBrow: {}, lipRecommend: {}, avoidMakeup: [] },
    summary: outfitStyle.summary || { coreConclusion: '', priorityAdvice: '', dailyTips: [] }
  }

  return report
}

// 穿搭咨询相关函数（保持不变）
async function analyzeClothingVision(images, consultType = 'single') {
  const isCompare = consultType === 'compare'
  const labelPrefix = isCompare ? images.map((_, i) => `款式${String.fromCharCode(65 + i)}`).join('、') : '该服饰'
  const prompt = `你是一位专业的时尚买手和穿搭顾问AI，请仔细观察${isCompare ? '以下多件' : '这'}服饰图片，提取每件衣物的视觉特征信息。

${isCompare ? `图片中有${images.length}件不同服饰，分别标记为${labelPrefix}。请对每件分别分析。` : '请对该服饰进行全面分析。'}

以JSON格式输出：
{
  "items": [
    {
      "label": "${isCompare ? '款式A/B/C/D' : '该服饰'}",
      "category": "服饰类别",
      "subCategory": "细分类型",
      "color": { "main": "主色调", "secondary": "副色调", "tone": "冷暖调性", "saturation": "饱和度" },
      "fabric": { "type": "面料类型", "texture": "质感描述", "thickness": "厚薄", "drape": "垂坠感" },
      "fit": { "silhouette": "版型", "shoulder": "肩型", "length": "衣长", "detail": "剪裁细节描述" },
      "style": { "overall": "整体风格", "occasion": "适合场景", "season": "适合季节" },
      "craftsmanship": { "stitching": "缝线工艺", "details": "细节设计描述", "lining": "是否有内衬", "overall": "做工整体评价" }
    }
  ]
}

请严格按照JSON格式输出，不要包含任何其他文字说明。`

  const content = []
  for (const img of images) {
    if (img.imageBase64) {
      content.push({ type: 'image_url', image_url: { url: img.imageBase64.startsWith('data:') ? img.imageBase64 : `data:image/jpeg;base64,${img.imageBase64}` } })
    } else if (img.imageUrl) {
      content.push({ type: 'image_url', image_url: { url: img.imageUrl } })
    }
  }
  content.push({ type: 'text', text: prompt })

  try {
    const response = await axios.post(BASE_URL, {
      model: process.env.QWEN_VL_MODEL || 'qwen-vl-max',
      messages: [{ role: 'user', content }],
      temperature: 0.1, top_p: 0.8
    }, {
      headers: { 'Authorization': `Bearer ${QWEN_API_KEY}`, 'Content-Type': 'application/json' },
      timeout: 90000
    })
    const result = response.data?.choices?.[0]?.message?.content
    if (!result) throw new Error('VL模型返回为空')
    console.log('[穿搭咨询] VL模型原始返回:', result.substring(0, 200))
    const parsed = robustJSONParse(result)
    return parsed.items || parsed
  } catch (err) {
    console.error('穿搭视觉分析失败:', err.response?.data || err.message)
    throw new Error(err.response?.data?.error?.message || err.message)
  }
}

async function generateSingleConsult(visualFeatures, userInfo = {}, isRetry = false) {
  const sceneLabel = userInfo.consultScene === 'buy' ? '购买决策' : '留存决策'
  const verdictOptions = userInfo.consultScene === 'buy' ? '建议购买 / 建议不买' : '建议自留 / 建议退货'
  const prompt = `你是一位拥有15年经验的资深时尚买手和穿搭顾问AI，请根据以下服饰视觉特征和用户信息，进行专业的单品决策分析。

## 服饰视觉特征
${JSON.stringify(visualFeatures, null, 2)}

## 用户填写信息
- 服饰类别：${userInfo.category || '未知'}
- 价格区间：${userInfo.priceRange || '未知'}
- 身型特点：${userInfo.bodyFeatures && userInfo.bodyFeatures.length > 0 ? userInfo.bodyFeatures.join('、') : '未选择'}
- 穿着场景：${userInfo.wearScenes && userInfo.wearScenes.length > 0 ? userInfo.wearScenes.join('、') : '未选择'}
- 穿搭困扰：${userInfo.trouble || '未选择'}
- 决策场景：${sceneLabel}

## 请严格按照以下JSON格式输出（禁止输出任何其他文字）：

{
  "scores": { "fitScore": 0-10, "colorScore": 0-10, "qualityScore": 0-10, "valueScore": 0-10 },
  "verdict": "${verdictOptions}二者选一",
  "details": {
    "fitScore": { "pros": "版型优点(1-2句)", "cons": "版型不足(1-2句)" },
    "colorScore": { "pros": "颜色优点(1-2句)", "cons": "颜色不足(1-2句)" },
    "qualityScore": { "pros": "质感优点(1-2句)", "cons": "质感不足(1-2句)" },
    "valueScore": { "pros": "性价比优点(1-2句)", "cons": "性价比不足(1-2句)" }
  },
  "tips": ["穿搭优化建议1", "建议2", "建议3"],
  "dadaComment": "以搭搭(AI时尚猫咪)口吻的1-2句幽默点评",
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
    const response = await axios.post(BASE_URL, {
      model: process.env.QWEN_TEXT_MODEL || 'qwen-plus',
      messages: [
        { role: 'system', content: '你是专业的时尚买手AI，必须给出明确结论。严格输出JSON格式。' },
        { role: 'user', content: prompt }
      ],
      temperature: isRetry ? 0.5 : 0.3, top_p: 0.85, max_tokens: 4000
    }, {
      headers: { 'Authorization': `Bearer ${QWEN_API_KEY}`, 'Content-Type': 'application/json' },
      timeout: 60000
    })
    const content = response.data?.choices?.[0]?.message?.content
    if (!content) throw new Error('模型返回为空')
    return robustJSONParse(content)
  } catch (err) {
    console.error('单品决策生成失败:', err.response?.data || err.message)
    throw new Error(err.response?.data?.error?.message || err.message)
  }
}

async function generateCompareConsult(visualFeatures, userInfo = {}, isRetry = false) {
  const items = Array.isArray(visualFeatures) ? visualFeatures : [visualFeatures]
  const itemLabels = items.map((_, i) => `款式${String.fromCharCode(65 + i)}`).join('、')
  const prompt = `你是一位拥有15年经验的资深时尚买手AI，请对以下${items.length}件服饰进行横向对比分析。

## 服饰视觉特征（${itemLabels}）
${JSON.stringify(visualFeatures, null, 2)}

## 用户补充信息
- 对比场景：${userInfo.compareScene || '未指定'}

## 请严格按照以下JSON格式输出：

{
  "rankings": [{ "index": 0, "label": "款式A", "totalScore": 0 }],
  "scores": [{ "index": 0, "label": "款式A", "slimScore": 0-10, "versatileScore": 0-10, "occasionScore": 0-10, "qualityScore": 0-10, "valueScore": 0-10, "durableScore": 0-10 }],
  "comparisons": [{ "index": 0, "label": "款式A", "pros": "优势(1-2句)", "cons": "不足(1-2句)" }],
  "finalChoice": { "index": 0, "label": "款式X", "reason": "核心理由(1-2句)" },
  "bestScenarios": [{ "index": 0, "label": "款式A", "scenario": "最佳场景" }],
  "dadaComment": "以搭搭口吻的1-2句幽默点评",
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
    const response = await axios.post(BASE_URL, {
      model: process.env.QWEN_TEXT_MODEL || 'qwen-plus',
      messages: [
        { role: 'system', content: '你是专业的时尚买手AI，必须给出明确排名。严格输出JSON格式。' },
        { role: 'user', content: prompt }
      ],
      temperature: isRetry ? 0.5 : 0.3, top_p: 0.85, max_tokens: 4000
    }, {
      headers: { 'Authorization': `Bearer ${QWEN_API_KEY}`, 'Content-Type': 'application/json' },
      timeout: 60000
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
  const prompt = `请识别这件服饰的类别，只能从以下选项中选择一个返回：上衣、裤子、半裙、连衣裙、外套、衬衫、T恤、针织衫、卫衣、风衣、大衣、羽绒服、牛仔、其他\n\n直接返回类别名称，不要输出任何其他文字。`
  const content = []
  for (const img of images) {
    if (img.imageBase64) content.push({ type: 'image_url', image_url: { url: img.imageBase64.startsWith('data:') ? img.imageBase64 : `data:image/jpeg;base64,${img.imageBase64}` } })
    else if (img.imageUrl) content.push({ type: 'image_url', image_url: { url: img.imageUrl } })
  }
  content.push({ type: 'text', text: prompt })
  try {
    const response = await axios.post(BASE_URL, {
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
  analyzeVision, generateReport,
  generateBoneAnalysis, generateSkinAnalysis, generateColorStyle, generateOutfitStyle,
  analyzeClothingVision, generateSingleConsult, generateCompareConsult, detectCategory
}
