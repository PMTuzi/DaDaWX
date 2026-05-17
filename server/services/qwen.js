// 通义千问 API 服务（OpenAI 兼容模式）
const axios = require('axios')

const QWEN_API_KEY = process.env.QWEN_API_KEY
// 使用 OpenAI 兼容接口
const BASE_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions'

/**
 * 调用通义千问-VL（视觉语言模型）
 * 提取图片视觉特征
 * imageInput: URL 或 data:image/xxx;base64,... 格式
 */
async function analyzeVision(imageInput, photoType = 'face') {
  const prompt = `你是一位专业的形象分析AI，请仔细观察这张${photoType === 'face' ? '人脸' : '全身'}照片，提取以下视觉特征信息，以JSON格式输出：

{
  "faceShape": {
    "type": "oval/round/square/long/diamond/heart",
    "smoothness": 0-10,
    "boneStructure": 0-10,
    "proportion": 0-10
  },
  "skinTone": {
    "undertone": "cool/warm/neutral",
    "brightness": 0-10,
    "purity": 0-10
  },
  "features": {
    "eyeShape": "描述",
    "noseShape": "描述",
    "lipShape": "描述",
    "eyebrowShape": "描述",
    "jawline": "描述",
    "forehead": "描述"
  },
  "styleIndicators": {
    "mass": "大/中/小",
    "curve": "直/偏曲/曲",
    "movement": "动/偏静/静"
  },
  "bodyIndicators": {
    "shoulderType": "描述（如有全身照）",
    "bodyRatio": "描述（如有全身照）"
  },
  "metrics": {
    "faceWidthToHeight": 0.0,
    "jawToForehead": 0.0,
    "eyeSpacing": 0.0,
    "noseWidth": 0.0,
    "lipToNoseRatio": 0.0
  }
}

请严格按照JSON格式输出，不要包含任何其他文字说明。基于2000-3000个面部特征点进行分析。`

  try {
    const response = await axios.post(
      BASE_URL,
      {
        model: process.env.QWEN_VL_MODEL || 'qwen-vl-max',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image_url',
                image_url: { url: imageInput }
              },
              {
                type: 'text',
                text: prompt
              }
            ]
          }
        ],
        temperature: 0.1,
        top_p: 0.8
      },
      {
        headers: {
          'Authorization': `Bearer ${QWEN_API_KEY}`,
          'Content-Type': 'application/json'
        },
        timeout: 60000
      }
    )

    const content = response.data?.choices?.[0]?.message?.content
    if (!content) throw new Error('VL模型返回为空')

    console.log('[AI] VL模型原始返回:', content.substring(0, 200))

    // 解析JSON
    const jsonMatch = content.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('VL模型输出格式异常')

    return JSON.parse(jsonMatch[0])
  } catch (err) {
    console.error('通义千问-VL调用失败:', err.response?.data || err.message)
    throw new Error(err.response?.data?.error?.message || err.message)
  }
}

/**
 * 调用通义千问（文本模型）
 * 生成结构化形象报告
 */
async function generateReport(visualFeatures, userTags = [], quantMetrics = {}) {
  const prompt = `你是一位拥有20年经验的高级形象顾问AI，请根据以下用户的视觉特征分析数据，生成一份专业、详细、可落地的形象诊断报告。

## 用户视觉特征数据
${JSON.stringify(visualFeatures, null, 2)}

## 用户自述标签
${userTags.length > 0 ? userTags.join('、') : '无'}

## 量化指标
${JSON.stringify(quantMetrics, null, 2)}

## 请严格按照以下JSON格式输出报告（每个字段都必须填写）：

{
  "basic": {
    "overallScore": 0-10分(面部35%+肤色30%+风格20%+身形15%加权),
    "tags": ["脸型标签", "肤色季型", "风格类型", "量感等级"],
    "advantages": "1-2句核心优势总结",
    "weaknesses": "1-2句短板提醒"
  },
  "faceShape": {
    "type": "脸型名称",
    "score": 0-10,
    "features": { "smoothness": 0-10, "boneStructure": 0-10, "proportion": 0-10 },
    "suitableHaircuts": [
      { "name": "发型名", "length": "短/中/长", "outline": "轮廓描述", "bangs": "刘海建议", "score": 0-10 }
    ],
    "avoidHaircuts": [
      { "name": "避雷发型", "reason": "原因" }
    ],
    "suitableCollars": [
      { "type": "领型", "score": 0-10 }
    ]
  },
  "skinColor": {
    "type": "冷皮/暖皮/中性皮",
    "brightness": 0-10,
    "purity": 0-10,
    "season": "四季色彩季型(如冷夏/暖秋)",
    "seasonDetail": "季型详细说明",
    "goodColors": [
      { "name": "颜色名", "hex": "#色值" }
    ],
    "badColors": [
      { "name": "避雷色名", "hex": "#色值", "reason": "原因" }
    ],
    "goodHairColors": [
      { "name": "适配发色", "detail": "深浅色调描述" }
    ],
    "badHairColors": [
      { "name": "避雷发色", "reason": "原因" }
    ]
  },
  "style": {
    "mainStyle": "主风格",
    "mainScore": 0-10,
    "subStyles": [
      { "name": "副风格", "score": 0-10 }
    ],
    "features": { "mass": "量感", "curve": "直曲", "movement": "动静" },
    "clothingAdvice": {
      "silhouette": "版型建议",
      "material": "材质建议",
      "pattern": "图案建议"
    },
    "sceneAdvice": [
      { "scene": "职场/日常/约会/休闲", "desc": "穿搭方案描述" }
    ]
  },
  "bodyShape": {
    "shoulderType": "肩型",
    "bodyRatio": "身形比例",
    "suitableTop": [
      { "type": "上衣版型", "score": 0-10 }
    ],
    "suitableBottom": [
      { "type": "下装版型", "score": 0-10 }
    ],
    "avoidStyles": [
      { "type": "避雷版型", "reason": "原因" }
    ],
    "tips": ["比例优化技巧1", "技巧2", "技巧3"]
  },
  "outfitItems": {
    "recommended": [
      { "name": "单品名", "type": "上衣/下装/外套/配饰", "color": "颜色", "material": "材质", "scene": "适配场景", "score": 0-10 }
    ],
    "avoidItems": [
      { "name": "避雷单品", "reason": "原因" }
    ]
  },
  "hairRecommend": {
    "top3": [
      { "name": "发型名", "length": "长度", "layers": "层次描述", "bangs": "刘海建议", "care": "打理要点", "score": 0-10 }
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
    "foundation": {
      "tone": "粉底色调建议",
      "shade": "色号选择建议",
      "concealer": "遮瑕重点"
    },
    "eyeBrow": {
      "shape": "眉形建议",
      "shadow": "眼影色调",
      "eyeliner": "眼线风格"
    },
    "lipRecommend": {
      "destiny": "本命口红色号",
      "daily": "日常口红色号"
    },
    "avoidMakeup": ["避雷妆容1", "避雷妆容2"]
  },
  "summary": {
    "coreConclusion": "形象定位+适配核心逻辑",
    "priorityAdvice": "发型/穿搭/妆容改造优先级建议",
    "dailyTips": ["日常技巧1", "技巧2", "技巧3"]
  }
}

要求：
1. suitableHaircuts至少5个，avoidHaircuts至少3个，suitableCollars至少4个
2. goodColors至少6个带真实hex色值，badColors至少3个
3. recommended单品至少10个，avoidItems至少5个
4. top3发型必须3个，alternatives至少5个
5. 所有评分必须是0-10的数字，保留一位小数
6. 报告内容必须专业、具体、可落地，不能有"建议咨询专业人士"等废话
7. 严格JSON格式，不要输出任何其他文字`

  try {
    const response = await axios.post(
      BASE_URL,
      {
        model: process.env.QWEN_TEXT_MODEL || 'qwen-max',
        messages: [
          { role: 'system', content: '你是一位专业的形象顾问AI，擅长根据面部特征进行精准的形象分析和穿搭建议。你总是输出严格的JSON格式数据。' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.3,
        top_p: 0.85,
        max_tokens: 8000
      },
      {
        headers: {
          'Authorization': `Bearer ${QWEN_API_KEY}`,
          'Content-Type': 'application/json'
        },
        timeout: 120000
      }
    )

    const content = response.data?.choices?.[0]?.message?.content
    if (!content) throw new Error('文本模型返回为空')

    console.log('[AI] 文本模型原始返回长度:', content.length)

    // 解析JSON
    const jsonMatch = content.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('文本模型输出格式异常')

    const report = JSON.parse(jsonMatch[0])
    return report
  } catch (err) {
    console.error('通义千问调用失败:', err.response?.data || err.message)
    throw new Error(err.response?.data?.error?.message || err.message)
  }
}

module.exports = { analyzeVision, generateReport }
