// AI 诊断路由
const express = require('express')
const router = express.Router()
const { analyzeVision, generateReport } = require('../services/qwen')
const { validateReport, safeMergeReport, FALLBACK_REPORT } = require('../utils/report-schema')

/**
 * 步骤1: 通义千问-VL 提取视觉特征
 * POST /api/ai/analyze-vision
 */
router.post('/analyze-vision', async (req, res) => {
  const t0 = Date.now()
  try {
    const { imageUrl, imageBase64, photoType } = req.body

    // 优先使用 base64
    let imageInput = imageBase64

    // 如果是本地服务器URL（localhost 或局域网IP），读取文件转base64
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

    // 最后fallback到URL
    if (!imageInput) {
      imageInput = imageUrl
    }

    if (!imageInput) {
      return res.status(400).json({ code: -1, message: '缺少图片数据' })
    }

    console.log(`[AI] 开始视觉分析, 类型: ${photoType}, 方式: ${imageInput.startsWith('data:') ? 'base64' : 'url'}`)

    const features = await analyzeVision(imageInput, photoType)

    console.log(`[AI] 视觉分析完成, 耗时: ${Date.now() - t0}ms`)

    res.json({
      code: 0,
      data: {
        features,
        metrics: features.metrics || {}
      }
    })
  } catch (err) {
    console.error('[AI] 视觉分析失败:', err.message)
    res.status(500).json({ code: -1, message: '视觉分析失败: ' + err.message })
  }
})

/**
 * 步骤2: 通义千问4.0 生成结构化报告
 * POST /api/ai/generate-report
 */
router.post('/generate-report', async (req, res) => {
  const t0 = Date.now()
  try {
    const { imageUrl, visualFeatures, userTags, gender, quantMetrics, isRetry } = req.body

    console.log(`[AI] 开始生成报告${isRetry ? '(重试)' : ''}, 性别: ${gender || '未指定'}`)

    const report = await generateReport(visualFeatures, userTags || [], quantMetrics || {}, gender)

    // 校验输出格式
    if (!validateReport(report)) {
      console.warn('[AI] 报告格式校验不通过, report keys:', report ? Object.keys(report) : 'null')
      // 校验不通过时用兜底数据补全，而不是拒绝
      const merged = safeMergeReport(report)
      console.log(`[AI] 报告生成完成(补全), 耗时: ${Date.now() - t0}ms`)
      return res.json({
        code: 0,
        data: merged,
        warning: '部分数据使用兜底值'
      })
    }

    console.log(`[AI] 报告生成完成, 耗时: ${Date.now() - t0}ms`)

    res.json({
      code: 0,
      data: report
    })
  } catch (err) {
    console.error('[AI] 报告生成失败:', err.message)
    res.status(500).json({ code: -1, message: '报告生成失败: ' + err.message })
  }
})

module.exports = router
