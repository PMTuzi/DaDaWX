// 通义千问 API 服务（新架构：2次VL + 4次Seedream）
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
const VOLCENGINE_API_KEY = process.env.VOLCENGINE_API_KEY
const SEEDREAM_MODEL = process.env.VOLCENGINE_SEEDREAM_MODEL || 'doubao-seedream-5-0-260128'

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
        { "name": "发型名", "length": "短/中/长", "layers": "层次描述", "bangs": "刘海建议", "care": "打理要点", "reason": "适合原因（必须具体到脸型特征）", "score": 0-10 }
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
// Seedream 图片生成（4次并行）
// ============================================================

async function callSeedream(prompt, size = '1920x1920') {
  if (!VOLCENGINE_API_KEY) throw new Error('未配置VOLCENGINE_API_KEY')

  const response = await axiosInstance.post(
    'https://ark.cn-beijing.volces.com/api/v3/images/generations',
    {
      model: SEEDREAM_MODEL,
      prompt,
      size,
      response_format: 'url',
      sequential_image_generation: 'disabled',
      stream: false,
      watermark: false
    },
    {
      headers: {
        'Authorization': `Bearer ${VOLCENGINE_API_KEY}`,
        'Content-Type': 'application/json'
      },
      timeout: 180000
    }
  )
  const imageUrl = response.data?.data?.[0]?.url
  if (!imageUrl) throw new Error('Seedream返回为空')
  return imageUrl
}

/**
 * 构建模块1 prompt: 形象DNA
 */
function buildDNAPrompt(data) {
  const m = data.module1_dna || {}
  const features = m.faceFeatures || []
  const tc = m.threeCourts || {}

  return `一张奶白色高级杂志风长篇诊断报告图片，超长竖版构图（高度是宽度的1.75倍），cream white background #FAFAF8，精致纸张纹理质感。不要大量文字，用雷达图、进度条、图形等数据可视化为主。

顶部：极细金色横线，标题"面部骨相诊断"，副标题"${m.faceType || ''} · ${m.boneType || ''}"。

第一区域"脸型轮廓"：一张优雅的${m.faceType || ''}脸型轮廓线稿图，用金色细线标注三庭五眼分割线，上庭/中庭/下庭三个区域用淡金色/米色/浅灰色填充区分，旁边极简金色箭头+短标签。

第二区域"骨相综合雷达图"：一个精美的5维雷达图，5个轴分别是${features.map(f => f.name).join('、')}，${features.map(f => `${f.name}维度${f.score}/10`).join('，')}，金色线条和半透明淡金色填充，雷达图面积直观展示骨相优劣分布，旁边一个极小的满分虚线五边形作为参照。

第三区域"三庭五眼比例图"：水平三段式比例条，上庭/中庭/下庭三段用淡金/米/浅灰三色填充，长短直观反映比例，每段上方极短标签"${tc.balance || ''}"。下方一个水平的五眼间距标注图，金色细线标注眼距宽窄。

第四区域"面部线条风格"："${m.lineStyle || ''}"，用一条优雅的金色曲线示意+淡灰色面部轮廓剪影。

第五区域"五官评分条形图"：5行金色渐变横条，${features.map(f => `${f.name} ${f.score}/10`).join('，')}，每条长短直观反映分数，右侧极短分数标签。

底部：金色细线+极小洞察文字。

整体风格：VOGUE杂志长篇内页，极简留白，金色和深灰配色，雷达图和数据可视化图表为主，尽量少文字，装饰性细线分隔各区域，内容充满整个页面。`
}

/**
 * 构建模块2 prompt: 皮肤&风格DNA
 */
function buildStyleDNAPrompt(data) {
  const m = data.module2_style || {}
  const goodColors = (m.goodColors || []).slice(0, 8)
  const badColors = (m.badColors || []).slice(0, 4)
  const subStyles = m.subStyles || []
  const sf = m.styleFeatures || {}
  const cp = m.colorPalette || {}
  const ca = m.clothingAdvice || {}
  const scenes = m.sceneAdvice || []

  return `一张奶白色高级杂志风长篇诊断报告图片，超长竖版构图（高度是宽度的1.75倍），cream white background #FAFAF8，精致纸张纹理质感。不要大量文字，用雷达图、色卡、图表等数据可视化为主。

顶部：极细金色横线，标题"色彩风格诊断"，标签"${m.skinType || ''} · ${m.season || ''} · ${m.mainStyle || ''}"。

第一区域"肤色属性雷达图"：一个精美的6维雷达图，6个轴分别是明度、纯度、量感、冷暖、饱和度、对比度，明度${m.brightness || ''}/10、纯度${m.purity || ''}/10、量感${m.mass || ''}/10，其余维度根据"${m.skinType || ''}"和"${m.season || ''}"属性推断，金色线条+半透明淡粉填充，旁边满分虚线六边形参照。

第二区域"本命色卡"：8个真实色彩色块2行4列排列，${goodColors.map(c => `${c.name}色`).join('、')}，每个色块饱满的圆角方形，颜色准确鲜艳。右侧4个打×的灰色避雷色块，${badColors.map(c => `${c.name}色`).join('、')}。下方一条"适配度光谱条"——从最适配到最避雷的渐变色带。

第三区域"色彩搭配环形图"：一个精美的色彩搭配环形图，外环主色组${(cp.primary || []).join('+')}3个色块、中环辅助色组${(cp.secondary || []).join('+')}2个色块+中性色组${(cp.neutral || []).join('+')}2个色块、内环点缀色组${(cp.accent || []).join('+')}2个色块，用环形排列直观展示色彩搭配比例。

第四区域"风格定位雷达图"：一个精美的5维雷达图，5个轴分别是量感、曲直、动静、华丽度、存在感，量感"${sf.mass || ''}"、曲直"${sf.curve || ''}"、动静"${sf.movement || ''}"，金色线条+半透明淡金填充。雷达图中央大字"${m.mainStyle || ''}"，${m.mainScore || ''}/10。旁边副风格${subStyles.map(s => s.name).join('、')}用小标签气泡。

第五区域"穿搭建议"：4个场景穿搭示意小照片竖排——${scenes.map(s => `${s.scene}场景`).join('、')}，每个小照片展示${m.mainStyle || ''}风格的穿搭造型照。右侧一个"材质×图案"2x2矩阵小图标。

底部：金色细线+极小洞察文字。

整体风格：ELLE杂志长篇内页，极简留白，金色/深灰/淡粉配色，雷达图和环形图等数据可视化为主，尽量少文字，内容充满整个页面。`
}

/**
 * 构建模块3 prompt: 发型&妆容
 */
function buildHairMakeupPrompt(data) {
  const m = data.module3_hairmakeup || {}
  const makeup = m.makeup || {}
  const top3 = (m.hairRecommend?.top3 || []).slice(0, 3)
  const avoidHair = (m.hairRecommend?.avoidHair || []).slice(0, 3)
  const hairColors = (m.hairRecommend?.hairColors || []).slice(0, 3)
  const foundation = makeup.foundation || {}
  const eyeBrow = makeup.eyeBrow || {}
  const lip = makeup.lipRecommend || {}
  const blush = makeup.blush || {}

  return `一张奶白色高级杂志风长篇诊断报告图片，超长竖版构图（高度是宽度的1.75倍），cream white background #FAFAF8，精致纸张纹理质感。不要大量文字，用雷达图、照片和色卡等数据可视化为主。

顶部：极细玫瑰金横线，标题"发型妆容诊断"。

第一区域"发型适配度雷达图"：一个精美的6维雷达图，6个轴分别是修饰脸型、显高显瘦、打理难度、时尚度、气质匹配、日常百搭，${top3.map((h, i) => `第${i+1}名${h.name}评分${h.score}/10`).join('，')}，玫瑰金线条+半透明淡粉填充，3个发型在同一个雷达图上用不同深浅的粉色线条叠加对比，旁边满分虚线六边形参照。

第二区域"推荐发型"：3张真实发型造型照片竖排，${top3.map((h, i) => `第${i+1}名是${h.name}${h.length}发型${h.bangs}刘海的造型照片`).join('，')}，每张展示完整发型效果，照片下方极短名称标签+金色星标评分。

第三区域"避雷发型"：3个浅红色打×边框小图标剪影，${avoidHair.map(a => a.name).join('、')}。

第四区域"适配发色"：3条真实发色色带横排，${hairColors.map(c => `${c.name}色${c.detail}的发色效果`).join('，')}，每条展示染发后发丝质感色彩。右侧一个"冷暖色调"渐变光谱条标注适配区域。

第五区域"妆容方案雷达图"：一个精美的5维雷达图，5个轴分别是底妆贴合度、眉眼精致度、唇妆显白度、腮红自然度、整体和谐度，根据"${makeup.style || ''}"风格属性推断各维度得分，玫瑰金线条+半透明淡粉填充。雷达图旁边：一张${makeup.style || ''}妆容特写照片，展示${foundation.tone || ''}底妆、${eyeBrow.shape || ''}眉形、${eyeBrow.shadow || ''}眼影效果。

第六区域"妆容色卡"：2个口红真实色块膏体质感（${lip.destiny || '本命色'}、${lip.daily || '日常色'}），1个腮红色块（${blush.color || ''}），1个眼影色块（${eyeBrow.shadow || ''}），4个色块整齐横排。

底部：玫瑰金细线+极小洞察文字。

整体风格：COSMOPOLITAN杂志长篇内页，极简留白，金色/玫瑰金配色，雷达图和色卡为主，尽量少文字，内容充满整个页面。`
}

/**
 * 构建模块4 prompt: 颜值优化诊断
 */
function buildOptimizePrompt(data) {
  const m = data.module4_optimize || {}
  const points = (m.optimizablePoints || []).slice(0, 5)
  const roadmap = m.roadmap3m || {}

  return `一张奶白色高级杂志风长篇诊断报告图片，超长竖版构图（高度是宽度的1.75倍），cream white background #FAFAF8，精致纸张纹理质感。不要大量文字，用雷达图、对比图和时间轴等数据可视化为主。

顶部：极细金色横线，标题"颜值蜕变建议"，副标题"保守方案·拒绝整容"。

第一区域"颜值潜力雷达图"：一个精美的6维雷达图，6个轴分别是五官协调、皮肤状态、发型适配、妆容加分、穿搭品味、整体气质，根据当前状态推断各维度初始分数，用灰色线条+半透明浅灰填充。旁边叠一层"潜力值"金色线条+半透明淡金填充，两层叠加直观展示优化前后差距，旁边满分虚线六边形参照。

第二区域"优化优先级矩阵"：一个2x2矩阵图，横轴是"见效快→见效慢"，纵轴是"提升大→提升小"，${points.map(p => `"${p.area}"放在${p.priority === '高' ? '见效快+提升大' : p.priority === '中' ? '见效快+提升小' : '见效慢+提升小'}象限`).join('，')}，每个点用金色/浅金/灰色圆点表示优先级，圆点大小表示影响力。

第三区域"优化前后对比"：5组优化示意卡片竖排，${points.map(p => `针对${p.area}的优化——左侧问题状态小图，右侧改善后效果小图，金色箭头从左指向右，箭头上标注"${p.timeline || ''}"，卡片边框颜色表示优先级`).join('；')}。

第四区域"3个月路线图"：横向时间轴，3个节点用金色圆点+金色线条连接。第1个月节点旁：护肤品/化妆工具静物照片；第2个月节点旁：发型改造前后对比剪影图；第3个月节点旁：完整穿搭造型时尚照片。每个节点下方极短月度标签。

第五区域"改造优先级阶梯图"：一个从高到低的金色阶梯图形，5个台阶，每个台阶放极短部位标签和优先级色点，视觉化呈现改造顺序。

底部：金色细线，极短核心结论文字。

整体风格：Harper's Bazaar杂志长篇内页，极简留白，金色/深灰配色，温暖坚定感，雷达图和矩阵图等数据可视化为主，尽量少文字，内容充满整个页面。`
}

/**
 * 并行生成4张模块图片（旧方案，保留兼容）
 */
async function generateAllImages(analysisData) {
  const prompts = [
    { key: 'dna', prompt: buildDNAPrompt(analysisData) },
    { key: 'style', prompt: buildStyleDNAPrompt(analysisData) },
    { key: 'hairmakeup', prompt: buildHairMakeupPrompt(analysisData) },
    { key: 'optimize', prompt: buildOptimizePrompt(analysisData) }
  ]

  console.log('[AI] 开始并行生成4张模块图片...')

  const results = await Promise.all(
    prompts.map(async ({ key, prompt }) => {
      try {
        const imageUrl = await callSeedream(prompt)
        console.log(`[AI] 模块${key}图片生成成功`)
        return { key, imageUrl }
      } catch (err) {
        console.error(`[AI] 模块${key}图片生成失败:`, err.message)
        return { key, imageUrl: null, error: err.message }
      }
    })
  )

  const images = {}
  for (const r of results) {
    images[r.key] = r.imageUrl || ''
  }
  return images
}

// ============================================================
// 定向图片生成（新架构：少量聚焦图片补充数据可视化报告）
// ============================================================

/**
 * 构建三庭五眼比例图 prompt
 */
function buildThreeCourtsPrompt(data) {
  const m = data.module1_dna || {}
  const tc = m.threeCourts || {}
  const fe = m.fiveEyes || {}

  return `一张精致的面部比例分析示意图，竖版构图，奶白色背景 #FAFAF8。

中央：一张优雅的${m.faceType || ''}脸型轮廓线稿，用极细金色线绘制，面部填充极淡肤色渐变。

三庭标注：用两条水平虚线将面部分为上庭/中庭/下庭三个区域，上庭区域填充极淡金色(10%透明度)，中庭区域填充极淡米色(10%透明度)，下庭区域填充极淡灰色(10%透明度)。
每个区域右侧用金色箭头+短标签标注：
上庭：${tc.balance === '上长' ? '偏长 ↑' : tc.balance === '均衡' ? '均衡 ✓' : '偏短 ↓'}
中庭：${tc.balance === '中长' ? '偏长 ↑' : tc.balance === '均衡' ? '均衡 ✓' : '偏短 ↓'}
下庭：${tc.balance === '下长' ? '偏长 ↑' : tc.balance === '均衡' ? '均衡 ✓' : '偏短 ↓'}

五眼标注：在眼部水平位置，用5个等宽竖条标注五眼间距，眼距宽的竖条用淡金色填充，窄的用淡灰色填充。
下方小字：${fe.analysis || ''}

右侧：极简比例条形图，三段横向比例条对比上/中/下庭长度。
底部：金色细线 + "${m.faceType || ''} · ${tc.balance || ''}"

整体风格：高级杂志风，极简留白，金色和深灰配色，装饰性细线，数据可视化为主。`
}

/**
 * 构建本命色卡 prompt
 */
function buildColorCardPrompt(data) {
  const m = data.module2_style || {}
  const goodColors = (m.goodColors || []).slice(0, 8)
  const badColors = (m.badColors || []).slice(0, 4)
  const cp = m.colorPalette || {}

  return `一张精致的个人色彩诊断色卡图，竖版构图，奶白色背景 #FAFAF8。

顶部：极细金色横线，标题"本命色卡"，副标题"${m.skinType || ''} · ${m.season || ''}"。

上半部分"适配色"：8个饱满的圆角方形色块，2行4列排列，
${goodColors.map(c => `${c.name}色(#${c.hex?.replace('#', '') || 'ccc'})`).join('、')}，
每个色块下方极短标签"${goodColors.map(c => c.name).join('/')}"，
色块要色彩准确鲜艳，有细腻的纸张纹理质感。

下半部分"避雷色"：4个灰度降低的色块，1行4列，带浅红色×边框，
${badColors.map(c => `${c.name}色`).join('、')}，
每个色块下方极短标签。

底部：一条"适配度光谱条"——从左到右由暖到冷的渐变色带，标注"${m.skinType || ''}"适配区域。

整体风格：VOGUE杂志色卡内页，极简留白，金色/深灰配色，色彩精准。`
}

/**
 * 构建发型推荐图 prompt
 */
function buildHairstylePrompt(data) {
  const m = data.module3_hairmakeup || {}
  const top3 = (m.hairRecommend?.top3 || []).slice(0, 3)
  const hairColors = (m.hairRecommend?.hairColors || []).slice(0, 3)
  const avoidHair = (m.hairRecommend?.avoidHair || []).slice(0, 2)

  return `一张精致的发型推荐示意图，竖版构图，奶白色背景 #FAFAF8。

顶部：极细玫瑰金横线，标题"发型推荐"。

主区域：3张发型造型示意照片竖排，${top3.map((h, i) => `第${i+1}名：${h.name}${h.length || ''}发型${h.bangs ? '，' + h.bangs + '刘海' : ''}的效果照`).join('；')}。
每张照片下方极简标签+玫瑰金星标评分(${top3.map(h => `${h.score}/10`).join('/')})。

右侧区域"适配发色"：3条发色色带，${hairColors.map(c => `${c.name}(${c.detail || ''})`).join('、')}，每条展示染发后发丝质感色彩。

底部区域"避雷"：2个浅红色打×边框小图标，${avoidHair.map(a => a.name).join('、')}。

整体风格：ELLE杂志发型专题内页，极简留白，玫瑰金/深灰配色，照片为主。`
}

/**
 * 用大模型生成需要生图的提示词（让LLM基于分析数据决定生图内容）
 */
async function generateImagePrompts(analysisData) {
  const m1 = analysisData.module1_dna || {}
  const m2 = analysisData.module2_style || {}
  const m3 = analysisData.module3_hairmakeup || {}

  const prompt = `你是一位AI形象诊断报告的设计师。基于以下分析数据，请为报告生成3张增补可视化图片的详细生图提示词。这些图片将作为数据驱动报告的视觉补充，让报告更加丰富和美观。

## 分析数据摘要
- 脸型: ${m1.faceType || '未知'}，骨相型: ${m1.boneType || '未知'}
- 三庭: ${JSON.stringify(m1.threeCourts || {})}
- 五眼: ${JSON.stringify(m1.fiveEyes || {})}
- 肤色类型: ${m2.skinType || '未知'}，季型: ${m2.season || '未知'}
- 主风格: ${m2.mainStyle || '未知'}
- 适配色: ${(m2.goodColors || []).slice(0, 5).map(c => c.name + '(' + c.hex + ')').join('、')}
- 避雷色: ${(m2.badColors || []).slice(0, 3).map(c => c.name).join('、')}
- 推荐发型: ${(m3.hairRecommend?.top3 || []).map(h => h.name).join('、')}
- 适配发色: ${(m3.hairRecommend?.hairColors || []).map(c => c.name).join('、')}
- 妆容风格: ${m3.makeup?.style || '未知'}

请为以下3个维度各生成一个详细的图片生成提示词，每个提示词要包含具体的分析数据，让生图模型能生成准确的可视化：

1. "threeCourts" - 三庭五眼比例可视化：生成一张精致的面部比例标注示意图，必须包含具体的上庭/中庭/下庭比例数据
2. "colorCard" - 本命色卡：生成一张展示适配色和避雷色的色卡图，必须包含具体的颜色名和色值
3. "hairstyle" - 发型推荐：生成一张展示推荐发型效果的示意图，必须包含具体的发型名称和适配原因

以JSON格式输出：
{
  "imagePrompts": [
    { "key": "threeCourts", "title": "三庭五眼比例图", "prompt": "详细的图片生成提示词，要包含具体数据" },
    { "key": "colorCard", "title": "本命色卡", "prompt": "详细的图片生成提示词，要包含具体色值" },
    { "key": "hairstyle", "title": "发型推荐图", "prompt": "详细的图片生成提示词，要包含具体发型名" }
  ]
}

请严格按照JSON格式输出，不要包含任何其他文字说明。`

  try {
    const response = await axiosInstance.post(BASE_URL, {
      model: process.env.QWEN_TEXT_MODEL || 'qwen-plus',
      messages: [
        { role: 'system', content: '你是专业的形象诊断报告设计师，擅长设计精美的数据可视化图片。严格输出JSON格式。' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.3,
      top_p: 0.85,
      max_tokens: 2000
    }, {
      headers: { 'Authorization': `Bearer ${QWEN_API_KEY}`, 'Content-Type': 'application/json' },
      timeout: 30000
    })
    const content = response.data?.choices?.[0]?.message?.content
    if (!content) throw new Error('模型返回为空')
    const parsed = robustJSONParse(content)
    return parsed.imagePrompts || []
  } catch (err) {
    console.error('[AI] 生成图片提示词失败:', err.message)
    return null
  }
}

/**
 * 定向生成补充图片（新架构：2-3张聚焦图片，配合数据驱动报告）
 * 直接用模板提示词，省掉额外的LLM调用，加快速度
 */
async function generateTargetedImages(analysisData) {
  const prompts = [
    { key: 'threeCourts', prompt: buildThreeCourtsPrompt(analysisData) },
    { key: 'colorCard', prompt: buildColorCardPrompt(analysisData) },
    { key: 'hairstyle', prompt: buildHairstylePrompt(analysisData) }
  ]

  console.log(`[AI] 开始生成${prompts.length}张定向补充图片...`)

  const results = await Promise.all(
    prompts.map(async ({ key, prompt }) => {
      try {
        const imageUrl = await callSeedream(prompt, '1024x1024')
        console.log(`[AI] 定向图片${key}生成成功`)
        return { key, imageUrl }
      } catch (err) {
        console.error(`[AI] 定向图片${key}生成失败:`, err.message)
        return { key, imageUrl: null, error: err.message }
      }
    })
  )

  const images = {}
  for (const r of results) {
    images[r.key] = r.imageUrl || ''
  }
  return images
}

/**
 * 生成单张定向图片
 */
async function generateSingleImage(prompt, size = '1024x1024') {
  return callSeedream(prompt, size)
}

// ============================================================
// 穿搭咨询相关（保留）
// ============================================================

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

  const prompt = `你是一位拥有15年经验的资深时尚买手和穿搭顾问AI，请根据以下服饰视觉特征和个人信息，进行专业的单品决策分析。

## 服饰视觉特征
${JSON.stringify(visualFeatures, null, 2)}

## 填写信息
- 服饰类别：${userInfo.category || '未知'}
- 价格区间：${userInfo.priceRange || '未知'}
- 身型特点：${userInfo.bodyFeatures && userInfo.bodyFeatures.length > 0 ? userInfo.bodyFeatures.join('、') : '未选择'}
- 穿着场景：${userInfo.wearScenes && userInfo.wearScenes.length > 0 ? userInfo.wearScenes.join('、') : '未选择'}
- 穿搭困扰：${userInfo.trouble || '未选择'}
- 决策场景：${sceneLabel}

${reportSection}

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

async function generateCompareConsult(visualFeatures, userInfo = {}, isRetry = false, reportSummary = null) {
  const items = Array.isArray(visualFeatures) ? visualFeatures : [visualFeatures]
  const itemLabels = items.map((_, i) => `款式${String.fromCharCode(65 + i)}`).join('、')

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

  const prompt = `你是一位拥有15年经验的资深时尚买手AI，请对以下${items.length}件服饰进行横向对比分析。

## 服饰视觉特征（${itemLabels}）
${JSON.stringify(visualFeatures, null, 2)}

## 补充信息
- 对比场景：${userInfo.compareScene || '未指定'}

${reportSection}

## 请严格按照以下JSON格式输出：

{
  "rankings": [{ "index": 0, "label": "款式A", "totalScore": 0 }],
  "scores": [{ "index": 0, "label": "款式A", "slimScore": 0-10, "versatileScore": 0-10, "occasionScore": 0-10, "qualityScore": 0-10, "valueScore": 0-10, "durableScore": 0-10 }],
  "comparisons": [{ "index": 0, "label": "款式A", "pros": "优势(1-2句)", "cons": "不足(1-2句)" }],
  "finalChoice": { "index": 0, "label": "款式X", "reason": "核心理由(1-2句)" },
  "bestScenarios": [{ "index": 0, "label": "款式A", "scenario": "最佳场景" }],
  "dadaComment": "以搭搭口吻的1-2句幽默点评",
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
  generateAllImages,
  generateTargetedImages, generateSingleImage, generateImagePrompts,
  analyzeClothingVision, generateSingleConsult, generateCompareConsult, detectCategory
}
