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
async function generateReport(visualFeatures, userTags = [], quantMetrics = {}, gender = 'female') {
  const genderLabel = gender === 'male' ? '男性' : '女性'
  const prompt = `你是一位拥有20年经验的高级形象顾问AI，请根据以下用户的视觉特征分析数据，生成一份专业、详细、可落地的形象诊断报告。

## 用户性别
${genderLabel}

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
        max_tokens: 8192
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

/**
 * 穿搭咨询 - 服饰视觉分析
 * images: [{ imageBase64?: string, imageUrl?: string }]
 * consultType: 'single' | 'compare'
 */
async function analyzeClothingVision(images, consultType = 'single') {
  const isCompare = consultType === 'compare'
  const labelPrefix = isCompare
    ? images.map((_, i) => `款式${String.fromCharCode(65 + i)}`).join('、')
    : '该服饰'

  const prompt = `你是一位专业的时尚买手和穿搭顾问AI，请仔细观察${isCompare ? '以下多件' : '这'}服饰图片，提取每件衣物的视觉特征信息。

${isCompare ? `图片中有${images.length}件不同服饰，分别标记为${labelPrefix}。请对每件分别分析。` : '请对该服饰进行全面分析。'}

以JSON格式输出：
{
  "items": [
    {
      "label": "${isCompare ? '款式A/B/C/D' : '该服饰'}",
      "category": "服饰类别(上衣/裤子/裙子/外套/连衣裙/半裙/衬衫/T恤等)",
      "subCategory": "细分类型(如:西装外套/针织开衫/阔腿裤等)",
      "color": {
        "main": "主色调",
        "secondary": "副色调",
        "tone": "冷暖调性(冷调/暖调/中性)",
        "saturation": "饱和度(高/中/低)"
      },
      "fabric": {
        "type": "面料类型(棉/麻/丝/毛/涤纶/混纺等)",
        "texture": "质感描述(光滑/粗糙/柔软/硬挺等)",
        "thickness": "厚薄(薄/中/厚)",
        "drape": "垂坠感(好/中/差)"
      },
      "fit": {
        "silhouette": "版型(修身/合身/宽松/oversized)",
        "shoulder": "肩型(正肩/落肩/插肩/无肩)",
        "length": "衣长(短款/常规/中长/长款)",
        "detail": "剪裁细节描述"
      },
      "style": {
        "overall": "整体风格(简约/甜美/知性/休闲/街头/复古/法式等)",
        "occasion": "适合场景(通勤/日常/约会/休闲/正式)",
        "season": "适合季节(春/夏/秋/冬/四季)"
      },
      "craftsmanship": {
        "stitching": "缝线工艺(精细/一般/粗糙)",
        "details": "细节设计描述(纽扣/拉链/口袋/装饰等)",
        "lining": "是否有内衬",
        "overall": "做工整体评价(优/良/中/差)"
      }
    }
  ]
}

请严格按照JSON格式输出，不要包含任何其他文字说明。`

  // 构建多图消息内容
  const content = []
  for (const img of images) {
    if (img.imageBase64) {
      content.push({
        type: 'image_url',
        image_url: { url: img.imageBase64.startsWith('data:') ? img.imageBase64 : `data:image/jpeg;base64,${img.imageBase64}` }
      })
    } else if (img.imageUrl) {
      content.push({
        type: 'image_url',
        image_url: { url: img.imageUrl }
      })
    }
  }
  content.push({ type: 'text', text: prompt })

  try {
    const response = await axios.post(
      BASE_URL,
      {
        model: process.env.QWEN_VL_MODEL || 'qwen-vl-max',
        messages: [{ role: 'user', content }],
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

    const result = response.data?.choices?.[0]?.message?.content
    if (!result) throw new Error('VL模型返回为空')

    console.log('[穿搭咨询] VL模型原始返回:', result.substring(0, 200))

    const jsonMatch = result.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('VL模型输出格式异常')

    const parsed = JSON.parse(jsonMatch[0])
    return parsed.items || parsed
  } catch (err) {
    console.error('穿搭视觉分析失败:', err.response?.data || err.message)
    throw new Error(err.response?.data?.error?.message || err.message)
  }
}

/**
 * 单品决策 - 生成4维度评分与结论（买不买/留不留）
 * 含搭搭评论 + 5类穿搭建议
 */
async function generateSingleConsult(visualFeatures, userInfo = {}, isRetry = false) {
  const sceneLabel = userInfo.consultScene === 'buy' ? '购买决策' : '留存决策'
  const verdictOptions = userInfo.consultScene === 'buy'
    ? '建议购买 / 建议不买'
    : '建议自留 / 建议退货'

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
  "scores": {
    "fitScore": 0-10整数(版型适合度：身材适配性、剪裁优劣、修身/宽松合理性),
    "colorScore": 0-10整数(颜色匹配度：日常百搭程度、配色质感、肤色适配),
    "qualityScore": 0-10整数(质感做工：面料档次、细节做工、实物质感表现),
    "valueScore": 0-10整数(性价比：价格与品质匹配度、实穿频率、耐用价值)
  },
  "verdict": "${verdictOptions}二者选一，禁止模棱两可",
  "details": {
    "fitScore": { "pros": "版型优点(1-2句)", "cons": "版型不足(1-2句)" },
    "colorScore": { "pros": "颜色优点(1-2句)", "cons": "颜色不足(1-2句)" },
    "qualityScore": { "pros": "质感优点(1-2句)", "cons": "质感不足(1-2句)" },
    "valueScore": { "pros": "性价比优点(1-2句)", "cons": "性价比不足(1-2句)" }
  },
  "tips": ["穿搭优化建议1", "建议2", "建议3"],
  "dadaComment": "以'搭搭'（一个拟人化的AI时尚猫咪形象）的口吻，对这件衣服和评分结果做1-2句幽默、犀利又可爱的点评，风格要像闺蜜聊天，不要用敬语。例如：'这件衬衫虽然显瘦但颜色有点老气，姐妹你确定要穿它去约会？喵~'",
  "outfitAdvice": [
    {
      "type": "accessory",
      "icon": "ring",
      "title": "饰品搭配",
      "description": "具体饰品搭配建议描述(1-2句)",
      "reason": "搭配理由(1句)"
    },
    {
      "type": "hairstyle",
      "icon": "hair",
      "title": "发型搭配",
      "description": "具体发型搭配建议描述(1-2句)",
      "reason": "搭配理由(1句)"
    },
    {
      "type": "makeup",
      "icon": "makeup",
      "title": "妆容搭配",
      "description": "具体妆容搭配建议描述(1-2句)",
      "reason": "搭配理由(1句)"
    },
    {
      "type": "shoes",
      "icon": "heel",
      "title": "鞋履搭配",
      "description": "具体鞋履搭配建议描述(1-2句)",
      "reason": "搭配理由(1句)"
    },
    {
      "type": "bag",
      "icon": "bag",
      "title": "包包搭配",
      "description": "具体包包搭配建议描述(1-2句)",
      "reason": "搭配理由(1句)"
    }
  ]
}

## 强制规则：
1. 所有评分必须是0-10的整数，禁止小数、禁止模糊评价
2. verdict必须二选一，禁止"因人而异""看个人喜好""都可以"等无效话术
3. 评价维度固定为4个，禁止自由发挥新增维度
4. details中每个维度必须同时有pros和cons
5. tips给出1-3条具体可落地的穿搭优化建议
6. dadaComment必须拟人化、有态度、像闺蜜聊天，不能是官方语气
7. outfitAdvice必须5个类别齐全(饰品/发型/妆容/鞋履/包包)，每类都有具体建议
8. 如果用户填写了身型特点，版型适合度评分必须针对性参考
9. 如果用户填写了穿搭困扰，tips必须针对性回应
10. 严格JSON格式输出`

  try {
    const response = await axios.post(
      BASE_URL,
      {
        model: process.env.QWEN_TEXT_MODEL || 'qwen-max',
        messages: [
          { role: 'system', content: '你是一位专业的时尚买手AI，擅长服饰单品决策分析。你必须给出明确的买/不买、留/不留结论，禁止模棱两可。总是输出严格的JSON格式数据。' },
          { role: 'user', content: prompt }
        ],
        temperature: isRetry ? 0.5 : 0.3,
        top_p: 0.85,
        max_tokens: 6000
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

    console.log('[穿搭咨询] 单品决策原始返回长度:', content.length)

    const jsonMatch = content.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('文本模型输出格式异常')

    return JSON.parse(jsonMatch[0])
  } catch (err) {
    console.error('单品决策生成失败:', err.response?.data || err.message)
    throw new Error(err.response?.data?.error?.message || err.message)
  }
}

/**
 * 多选一决策 - 生成6维度横向对比评分（选哪个）
 * 含搭搭评论 + 5类穿搭建议
 */
async function generateCompareConsult(visualFeatures, userInfo = {}, isRetry = false) {
  const items = Array.isArray(visualFeatures) ? visualFeatures : [visualFeatures]
  const itemLabels = items.map((_, i) => `款式${String.fromCharCode(65 + i)}`).join('、')

  const prompt = `你是一位拥有15年经验的资深时尚买手和穿搭顾问AI，请根据以下${items.length}件服饰的视觉特征，进行横向对比分析，给出明确的优选结论。

## 服饰视觉特征（${itemLabels}）
${JSON.stringify(visualFeatures, null, 2)}

## 用户补充信息
- 对比场景：${userInfo.compareScene || '未指定'}
${userInfo.priceList && userInfo.priceList.length > 0 ? `- 各款式价格：${userInfo.priceList.map((p, i) => `${String.fromCharCode(65 + i)}款${p}`).join('、')}` : '- 价格：未提供'}
${userInfo.styleDiff && userInfo.styleDiff.length > 0 ? `- 风格差异：${userInfo.styleDiff.join('、')}` : '- 风格差异：未标注'}
${userInfo.reason ? `- 纠结原因：${userInfo.reason}` : ''}

## 请严格按照以下JSON格式输出（禁止输出任何其他文字）：

{
  "rankings": [
    { "index": 0, "label": "款式A", "totalScore": 各维度总分 },
    ...按总分从高到低排列
  ],
  "scores": [
    {
      "index": 0,
      "label": "款式A",
      "slimScore": 0-10整数(显瘦修饰效果),
      "versatileScore": 0-10整数(日常百搭程度),
      "occasionScore": 0-10整数(场合适配性：通勤/休闲/约会),
      "qualityScore": 0-10整数(质感高级度),
      "valueScore": 0-10整数(性价比高低),
      "durableScore": 0-10整数(耐看实用度：是否易过时)
    },
    ...每款一个评分对象
  ],
  "comparisons": [
    { "index": 0, "label": "款式A", "pros": "该款核心优势(1-2句)", "cons": "该款主要不足(1-2句)" },
    ...每款一个对比对象
  ],
  "finalChoice": {
    "index": 最优选的索引,
    "label": "款式X",
    "reason": "选择该款的核心理由(1-2句明确结论)"
  },
  "bestScenarios": [
    { "index": 0, "label": "款式A", "scenario": "最佳使用场景描述" },
    ...每款的最佳场景
  ],
  "dadaComment": "以'搭搭'（一个拟人化的AI时尚猫咪形象）的口吻，对这几件衣服的对比结果做1-2句幽默、犀利又可爱的点评，风格要像闺蜜聊天，不要用敬语。例如：'A款虽然显瘦但B款更百搭，纠结的话就都别买了喵~'",
  "outfitAdvice": [
    {
      "type": "accessory",
      "icon": "ring",
      "title": "饰品搭配",
      "description": "针对推荐款的具体饰品搭配建议(1-2句)",
      "reason": "搭配理由(1句)"
    },
    {
      "type": "hairstyle",
      "icon": "hair",
      "title": "发型搭配",
      "description": "针对推荐款的具体发型搭配建议(1-2句)",
      "reason": "搭配理由(1句)"
    },
    {
      "type": "makeup",
      "icon": "makeup",
      "title": "妆容搭配",
      "description": "针对推荐款的具体妆容搭配建议(1-2句)",
      "reason": "搭配理由(1句)"
    },
    {
      "type": "shoes",
      "icon": "heel",
      "title": "鞋履搭配",
      "description": "针对推荐款的具体鞋履搭配建议(1-2句)",
      "reason": "搭配理由(1句)"
    },
    {
      "type": "bag",
      "icon": "bag",
      "title": "包包搭配",
      "description": "针对推荐款的具体包包搭配建议(1-2句)",
      "reason": "搭配理由(1句)"
    }
  ]
}

## 强制规则：
1. 所有评分必须是0-10的整数，禁止小数、禁止模糊评价
2. 必须给出明确的排名，rankings按总分从高到低排列
3. finalChoice必须选出一个最优款式，禁止"看需求""各有优劣"等无效结论
4. 评价维度固定为6个，禁止自由发挥新增维度
5. comparisons中每款必须同时有pros和cons
6. bestScenarios为每款给出最佳使用场景
7. dadaComment必须拟人化、有态度、像闺蜜聊天
8. outfitAdvice必须5个类别齐全，针对最终推荐款给建议
9. 如果用户指定了对比场景，场合适配性评分必须重点参考
10. 严格JSON格式输出`

  try {
    const response = await axios.post(
      BASE_URL,
      {
        model: process.env.QWEN_TEXT_MODEL || 'qwen-max',
        messages: [
          { role: 'system', content: '你是一位专业的时尚买手AI，擅长多款式横向对比分析。你必须给出明确的排名和最优选择，禁止模棱两可。总是输出严格的JSON格式数据。' },
          { role: 'user', content: prompt }
        ],
        temperature: isRetry ? 0.5 : 0.3,
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

    console.log('[穿搭咨询] 多选一决策原始返回长度:', content.length)

    const jsonMatch = content.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('文本模型输出格式异常')

    return JSON.parse(jsonMatch[0])
  } catch (err) {
    console.error('多选一决策生成失败:', err.response?.data || err.message)
    throw new Error(err.response?.data?.error?.message || err.message)
  }
}

/**
 * 服装类别快速识别（轻量级，只返回类别）
 * images: [{ imageBase64?: string, imageUrl?: string }]
 */
async function detectCategory(images) {
  const prompt = `请识别这件服饰的类别，只能从以下选项中选择一个返回：上衣、裤子、半裙、连衣裙、外套、衬衫、T恤、针织衫、卫衣、风衣、大衣、羽绒服、牛仔、其他

直接返回类别名称，不要输出任何其他文字。`

  const content = []
  for (const img of images) {
    if (img.imageBase64) {
      content.push({
        type: 'image_url',
        image_url: { url: img.imageBase64.startsWith('data:') ? img.imageBase64 : `data:image/jpeg;base64,${img.imageBase64}` }
      })
    } else if (img.imageUrl) {
      content.push({
        type: 'image_url',
        image_url: { url: img.imageUrl }
      })
    }
  }
  content.push({ type: 'text', text: prompt })

  try {
    const response = await axios.post(
      BASE_URL,
      {
        model: process.env.QWEN_VL_MODEL || 'qwen-vl-max',
        messages: [{ role: 'user', content }],
        temperature: 0.1,
        top_p: 0.8,
        max_tokens: 20
      },
      {
        headers: {
          'Authorization': `Bearer ${QWEN_API_KEY}`,
          'Content-Type': 'application/json'
        },
        timeout: 30000
      }
    )

    const result = response.data?.choices?.[0]?.message?.content?.trim()
    if (!result) throw new Error('VL模型返回为空')
    console.log('[穿搭咨询] 类别识别结果:', result)
    return result
  } catch (err) {
    console.error('服装类别识别失败:', err.response?.data || err.message)
    throw new Error(err.response?.data?.error?.message || err.message)
  }
}

module.exports = { analyzeVision, generateReport, analyzeClothingVision, generateSingleConsult, generateCompareConsult, detectCategory }
