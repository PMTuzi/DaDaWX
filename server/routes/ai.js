// AI 诊断路由
const express = require('express')
const router = express.Router()
const { analyzeVision, generateReport, generateBoneAnalysis, generateSkinAnalysis, generateColorStyle, generateOutfitStyle } = require('../services/qwen')
const { validateReport, safeMergeReport, FALLBACK_REPORT } = require('../utils/report-schema')
const { detectFaceLandmarks } = require('../services/face-detect')

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

    // 并行：VL视觉分析 + 人脸检测（精确关键点）
    const [features, faceData] = await Promise.all([
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
      console.log(`[AI] 人脸检测成功, 三庭: ${faceData.threeCourts.balance}, 五眼: ${faceData.fiveEyes.balance}, 密集点: ${faceData.meshData?.meshPoints?.length || 0}`)
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
    const { imageUrl, visualFeatures, userTags, gender, quantMetrics, isRetry } = req.body

    console.log(`[AI] 开始生成报告${isRetry ? '(重试)' : ''}, 性别: ${gender || '未指定'}`)

    const report = await generateReport(visualFeatures, userTags || [], quantMetrics || {}, gender)

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
    const { module, visualFeatures, gender } = req.body
    if (!module || !visualFeatures) return res.status(400).json({ code: -1, message: '缺少参数' })

    const moduleMap = { bone: generateBoneAnalysis, skin: generateSkinAnalysis, colorStyle: generateColorStyle, outfit: generateOutfitStyle }
    const fn = moduleMap[module]
    if (!fn) return res.status(400).json({ code: -1, message: '未知模块: ' + module })

    console.log(`[AI] 开始生成模块: ${module}`)
    const data = await fn(visualFeatures, gender || 'female')
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

    // 海报prompt模板
    const posterPrompts = {
      cover: `专业形象诊断报告封面，竖版构图，米白色背景，优雅轻奢排版，标题"AI形象诊断报告"，金色装饰线条，细腻纸张质感，商业海报质感`,
      bone: `骨相分析诊断卡海报，竖版构图，米白色背景，优雅轻奢排版，展示脸型分析和三庭五眼比例，色卡排列整齐，中文文字清晰，细腻纸张质感，专业形象顾问报告风格`,
      skin: `皮肤状态诊断卡海报，竖版构图，米白色背景，优雅轻奢排版，展示肤色诊断和四季色彩，色卡排列整齐色彩和谐，中文文字清晰，细腻纸张质感，专业形象顾问报告风格`,
      colorStyle: `色彩风格诊断卡海报，竖版构图，米白色背景，优雅轻奢排版，展示穿搭风格和色彩搭配，色卡排列整齐，中文文字清晰，细腻纸张质感，专业形象顾问报告风格`,
      outfit: `穿搭风格诊断卡海报，竖版构图，米白色背景，优雅轻奢排版，展示发型推荐和妆容建议，中文文字清晰，细腻纸张质感，专业形象顾问报告风格`
    }

    const prompt = posterPrompts[module] || posterPrompts.cover

    // 使用火山引擎 Seedream（如果可用）或返回prompt供前端使用
    const VOLCENGINE_API_KEY = process.env.VOLCENGINE_API_KEY
    if (VOLCENGINE_API_KEY) {
      try {
        const axios = require('axios')
        const response = await axios.post('https://visual.volcengineapi.com/', {
          req_key: 'high_aes',
          prompt,
          model_version: 'v2.0',
          width: 768,
          height: 1344
        }, {
          headers: {
            'Authorization': `Bearer ${VOLCENGINE_API_KEY}`,
            'Content-Type': 'application/json'
          },
          timeout: 60000
        })
        const imageUrl = response.data?.data?.image_urls?.[0]
        if (imageUrl) {
          console.log(`[AI] 海报生成完成(${module}), 耗时: ${Date.now() - t0}ms`)
          return res.json({ code: 0, data: { imageUrl, module } })
        }
      } catch (err) {
        console.warn('[AI] 火山引擎海报生成失败，使用prompt降级:', err.message)
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
