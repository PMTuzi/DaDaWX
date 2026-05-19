// AI 诊断路由
const express = require('express')
const router = express.Router()
const { analyzeVision, generateReport, generateBoneAnalysis, generateSkinAnalysis, generateColorStyle, generateOutfitStyle } = require('../services/qwen')
const { validateReport, safeMergeReport, FALLBACK_REPORT } = require('../utils/report-schema')
const { detectFaceLandmarks } = require('../services/face-detect')
const { analyzeFaceVisual } = require('../services/face-visual')

/**
 * 步骤1: 视觉大模型 - 深度面部特征提取
 * POST /api/ai/analyze-vision
 */
router.post('/analyze-vision', async (req, res) => {
  const t0 = Date.now()
  try {
    const { imageUrl, imageBase64, photoType } = req.body

    let imageInput = imageBase64

    if (!imageInput && imageUrl) {
      const localMatch = imageUrl.match(/\/uploads\/(.+)$/)
      if (localMatch) {
        const fs = require('fs')
        const path = require('path')
        const filePath = path.join(__dirname, '..', 'uploads', localMatch[1])
        if (fs.existsSync(filePath)) {
          const fileBuffer = fs.readFileSync(filePath)
          const ext = path.extname(filePath).toLowerCase()
          const mimeMap = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' }
          const mime = mimeMap[ext] || 'image/jpeg'
          imageInput = `data:${mime};base64,${fileBuffer.toString('base64')}`
          console.log(`[AI] 本地图片转base64: ${localMatch[1]}, 大小: ${(fileBuffer.length / 1024).toFixed(1)}KB`)
        }
      }
    }

    if (!imageInput) imageInput = imageUrl
    if (!imageInput) return res.status(400).json({ code: -1, message: '缺少图片数据' })

    console.log(`[AI] 开始视觉分析, 类型: ${photoType}, 方式: ${imageInput.startsWith('data:') ? 'base64' : 'url'}`)

    // 并行：VL视觉分析 + 人脸检测（精确关键点）+ 可视化图片
    const [features, faceData, visualData] = await Promise.all([
      analyzeVision(imageInput, photoType).catch(err => {
        console.warn('[AI] VL分析失败:', err.message)
        return null
      }),
      detectFaceLandmarks(
        imageInput.startsWith('data:') ? null : imageUrl,
        imageInput.startsWith('data:') ? imageInput : null
      ).catch(err => {
        console.warn('[AI] 人脸检测失败:', err.message)
        return null
      }),
      analyzeFaceVisual(
        imageInput.startsWith('data:') ? null : imageUrl,
        imageInput.startsWith('data:') ? imageInput : null
      ).catch(err => {
        console.warn('[AI] 可视化API失败:', err.message)
        return null
      })
    ])

    if (!features) throw new Error('视觉分析返回为空')

    // 将人脸检测的精确landmarks合并到features中（覆盖VL模型的估算值）
    if (faceData) {
      features.landmarks = faceData.landmarks
      features.detailPoints = faceData.detailPoints
      // 加密点云数据（2000+点）
      features.densifiedPoints = faceData.densifiedPoints
      // 面网格数据
      features.meshData = faceData.meshData
      // 三庭五眼比例数据（精确测量）
      features.threeCourtsMeasure = faceData.threeCourts
      features.fiveEyesMeasure = faceData.fiveEyes
      // iCREDIT API 额外信息
      features.faceType = faceData.faceType
      features.pupilDistance = faceData.pupilDistance
      features.faceWidth = faceData.faceWidth
      console.log(`[AI] 人脸检测成功, 脸型: ${faceData.faceType || '未知'}, 三庭: ${faceData.threeCourts.balance}, 五眼: ${faceData.fiveEyes.balance}, 密集点: ${faceData.meshData?.meshPoints?.length || 0}`)
    }

    // 合并可视化图片数据
    if (visualData) {
      features.visualImages = visualData
      const imgKeys = Object.keys(visualData).filter(k => k.endsWith('Img'))
      console.log(`[AI] 可视化图片获取成功: ${imgKeys.join(', ')}`)
    }

    console.log(`[AI] 视觉分析完成, 耗时: ${Date.now() - t0}ms`)

    res.json({
      code: 0,
      data: { features, metrics: features.metrics || {} }
    })
  } catch (err) {
    console.error('[AI] 视觉分析失败:', err.message)
    res.status(500).json({ code: -1, message: '视觉分析失败: ' + err.message })
  }
})

/**
 * 步骤2: 生成完整报告（4模块并行）
 * POST /api/ai/generate-report
 */
router.post('/generate-report', async (req, res) => {
  const t0 = Date.now()
  try {
    const { imageUrl, imageBase64, visualFeatures, userTags, gender, quantMetrics, isRetry } = req.body

    console.log(`[AI] 开始生成报告${isRetry ? '(重试)' : ''}, 性别: ${gender || '未指定'}`)

    // 准备图片输入：优先base64，其次URL
    let imageInput = imageBase64 || null
    if (!imageInput && imageUrl) {
      // 尝试从本地文件读取base64
      const localMatch = imageUrl.match(/\/uploads\/(.+)$/)
      if (localMatch) {
        const fs = require('fs')
        const path = require('path')
        const filePath = path.join(__dirname, '..', 'uploads', localMatch[1])
        if (fs.existsSync(filePath)) {
          const fileBuffer = fs.readFileSync(filePath)
          const ext = path.extname(filePath).toLowerCase()
          const mimeMap = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' }
          const mime = mimeMap[ext] || 'image/jpeg'
          imageInput = `data:${mime};base64,${fileBuffer.toString('base64')}`
          console.log(`[AI] 报告生成-本地图片转base64: ${localMatch[1]}`)
        }
      }
      if (!imageInput) imageInput = imageUrl
    }

    if (imageInput) {
      console.log(`[AI] 传递图片给报告生成模块(VL看图分析), 方式: ${imageInput.startsWith('data:') ? 'base64' : 'url'}`)
    }

    const report = await generateReport(visualFeatures, userTags || [], quantMetrics || {}, gender, imageInput)

    if (!validateReport(report)) {
      console.warn('[AI] 报告格式校验不通过, report keys:', report ? Object.keys(report) : 'null')
      const merged = safeMergeReport(report)
      console.log(`[AI] 报告生成完成(补全), 耗时: ${Date.now() - t0}ms`)
      return res.json({ code: 0, data: merged, warning: '部分数据使用兜底值' })
    }

    console.log(`[AI] 报告生成完成, 耗时: ${Date.now() - t0}ms`)
    res.json({ code: 0, data: report })
  } catch (err) {
    console.error('[AI] 报告生成失败:', err.message)
    res.status(500).json({ code: -1, message: '报告生成失败: ' + err.message })
  }
})

/**
 * 步骤2a: 单独生成某个模块（可选，用于渐进式加载）
 * POST /api/ai/generate-module
 * body: { module: 'bone'|'skin'|'colorStyle'|'outfit', visualFeatures, gender }
 */
router.post('/generate-module', async (req, res) => {
  const t0 = Date.now()
  try {
    const { module, visualFeatures, gender, imageBase64, imageUrl } = req.body
    if (!module || !visualFeatures) return res.status(400).json({ code: -1, message: '缺少参数' })

    const moduleMap = { bone: generateBoneAnalysis, skin: generateSkinAnalysis, colorStyle: generateColorStyle, outfit: generateOutfitStyle }
    const fn = moduleMap[module]
    if (!fn) return res.status(400).json({ code: -1, message: '未知模块: ' + module })

    // 准备图片输入
    let imageInput = imageBase64 || null
    if (!imageInput && imageUrl) {
      const localMatch = imageUrl.match(/\/uploads\/(.+)$/)
      if (localMatch) {
        const fs = require('fs')
        const path = require('path')
        const filePath = path.join(__dirname, '..', 'uploads', localMatch[1])
        if (fs.existsSync(filePath)) {
          const fileBuffer = fs.readFileSync(filePath)
          const ext = path.extname(filePath).toLowerCase()
          const mimeMap = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' }
          const mime = mimeMap[ext] || 'image/jpeg'
          imageInput = `data:${mime};base64,${fileBuffer.toString('base64')}`
        }
      }
      if (!imageInput) imageInput = imageUrl
    }

    console.log(`[AI] 开始生成模块: ${module}${imageInput ? ' (VL看图)' : ' (纯文本)'}`)
    const data = await fn(visualFeatures, gender || 'female', imageInput)
    console.log(`[AI] 模块${module}生成完成, 耗时: ${Date.now() - t0}ms`)

    res.json({ code: 0, data, module })
  } catch (err) {
    console.error(`[AI] 模块生成失败:`, err.message)
    res.status(500).json({ code: -1, message: '模块生成失败: ' + err.message })
  }
})

/**
 * 海报生成（文生图）
 * POST /api/ai/generate-poster
 * body: { module: 'bone'|'skin'|'colorStyle'|'outfit'|'cover', reportData, style? }
 */
router.post('/generate-poster', async (req, res) => {
  const t0 = Date.now()
  try {
    const { module, reportData, style } = req.body
    if (!module) return res.status(400).json({ code: -1, message: '缺少module参数' })

    // 从报告数据中提取关键信息，注入到prompt中生成个性化海报
    const bone = reportData?.modules?.bone || reportData?.faceShape || {}
    const skin = reportData?.modules?.skin || reportData?.skinColor || {}
    const colorStyle = reportData?.modules?.colorStyle || reportData?.style || {}
    const outfit = reportData?.modules?.outfit || {}
    const basic = reportData?.basic || {}

    // 提取关键标签，用于构建个性化prompt
    const faceType = bone.faceType || bone.type || '未知脸型'
    const skinSeason = skin.season || '未知季型'
    const mainStyle = colorStyle.mainStyle || '未知风格'
    const boneType = bone.boneType || '未知'
    const skinType = skin.skinType || '未知'
    const tags = basic.tags || []
    const tagStr = tags.length > 0 ? tags.join('、') : ''

    // 高端时尚杂志风的个性化prompt
    const posterPrompts = {
      cover: `高端时尚杂志封面，竖版构图，纯白底色，极简主义排版，大标题"AI形象诊断"用优雅衬线字体，副标题"${tagStr}"，金色细线装饰，精致的纸张纹理质感，时尚大片级构图，奢侈品牌画册风格，干净高级`,

      bone: `高端时尚杂志内页排版，竖版构图，米白色高级纸张质感背景，骨相分析诊断卡，标题"骨相分析·${faceType}"用衬线字体，下方展示脸型名称"${faceType}"和骨相类型"${boneType}"，三庭五眼比例数据用精致线条图示，5个面部特征评分条用渐变金色，整体排版借鉴VOGUE杂志内页风格，极简留白，高级感配色`,

      skin: `高端时尚杂志内页排版，竖版构图，米白色高级纸张质感背景，皮肤状态诊断卡，标题"肤色诊断·${skinSeason}"用衬线字体，四季色彩季型"${skinSeason}"居中突出显示，8个适配色块整齐排列带hex色值标注，4个避雷色块灰色排列，皮肤冷暖类型"${skinType}"标签，整体排版借鉴ELLE杂志内页风格，高级时尚感`,

      colorStyle: `高端时尚杂志内页排版，竖版构图，米白色高级纸张质感背景，色彩风格诊断卡，标题"风格定位·${mainStyle}"用衬线字体，主风格"${mainStyle}"大字居中，4个场景穿搭方案用小图排版，色彩搭配色卡精致排列，整体排版借鉴Harper's Bazaar杂志风格，时尚大片质感`,

      outfit: `高端时尚杂志内页排版，竖版构图，米白色高级纸张质感背景，穿搭风格诊断卡，标题"穿搭改造方案"用衬线字体，3个推荐发型用精致图示排列，妆容建议用色块标注，整体排版借鉴COSMOPOLITAN杂志内页风格，实用与美感兼具`
    }

    const prompt = posterPrompts[module] || posterPrompts.cover

    // 使用火山方舟 Seedream（如果可用）或返回prompt供前端使用
    const VOLCENGINE_API_KEY = process.env.VOLCENGINE_API_KEY
    const SEEDREAM_MODEL = process.env.VOLCENGINE_SEEDREAM_MODEL || 'doubao-seedream-5-0-260128'
    if (VOLCENGINE_API_KEY) {
      try {
        const axios = require('axios')
        const response = await axios.post('https://ark.cn-beijing.volces.com/api/v3/images/generations', {
          model: SEEDREAM_MODEL,
          prompt,
          size: '2K',
          response_format: 'url',
          sequential_image_generation: 'disabled',
          stream: false,
          watermark: true
        }, {
          headers: {
            'Authorization': `Bearer ${VOLCENGINE_API_KEY}`,
            'Content-Type': 'application/json'
          },
          timeout: 120000
        })
        const imageUrl = response.data?.data?.[0]?.url
        if (imageUrl) {
          console.log(`[AI] Seedream海报生成完成(${module}), 耗时: ${Date.now() - t0}ms`)
          return res.json({ code: 0, data: { imageUrl, module } })
        }
      } catch (err) {
        const errDetail = err.response?.data || err.message
        console.warn('[AI] 火山方舟海报生成失败:', JSON.stringify(errDetail))
      }
    }

    // 降级：返回prompt，前端可用CSS渲染替代
    console.log(`[AI] 海报prompt生成完成(${module}), 耗时: ${Date.now() - t0}ms`)
    res.json({ code: 0, data: { prompt, module, fallback: true } })
  } catch (err) {
    console.error('[AI] 海报生成失败:', err.message)
    res.status(500).json({ code: -1, message: '海报生成失败: ' + err.message })
  }
})

module.exports = router
