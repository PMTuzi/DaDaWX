// AI 诊断路由（异步任务模式：避免 callContainer 超时）
const express = require('express')
const router = express.Router()
const { authRequired } = require('../middleware/auth')
const { analyzePart1, analyzePart2 } = require('../services/qwen')
const { analyzeClothingVision, generateSingleConsult, generateCompareConsult, detectCategory } = require('../services/qwen')
const reportStore = require('../store/report-store')
const userStore = require('../store/user-store')
const consultStore = require('../store/consult-store')

// ============ 异步任务存储（内存） ============
const tasks = new Map()

// 清理超过30分钟的已完成任务
setInterval(() => {
  const now = Date.now()
  for (const [id, task] of tasks) {
    if (task.status === 'done' || task.status === 'failed') {
      if (now - task.createdAt > 30 * 60 * 1000) tasks.delete(id)
    }
  }
}, 5 * 60 * 1000)

/**
 * 异步启动完整分析
 * POST /api/ai/start-analysis
 * 立即返回 taskId，后台执行分析
 */
router.post('/start-analysis', authRequired, async (req, res) => {
  const { imageUrl, photoType, gender, age, height, weight, photoUrl } = req.body
  const openid = req.user.openid

  if (!imageUrl || !/^https?:\/\//.test(imageUrl)) {
    return res.status(400).json({ code: -1, message: '缺少图片 URL（仅支持 OSS 直传后的 HTTP(S) URL）' })
  }

  const taskId = 'T' + Date.now() + '_' + Math.random().toString(36).substr(2, 8)

  // 初始化任务
  tasks.set(taskId, {
    status: 'processing',
    progress: 0,
    step: '初始化',
    result: null,
    error: null,
    openid,
    createdAt: Date.now()
  })

  // 立即返回 taskId
  res.json({ code: 0, data: { taskId } })

  // 后台执行分析
  ;(async () => {
    try {
      const task = tasks.get(taskId)
      const imageInput = imageUrl

      // Part1 分析
      task.step = '深度面部骨相分析'; task.progress = 10
      console.log(`[AI] 任务${taskId} 开始Part1, 用户${openid.substring(0, 8)}...`)

      const part1Data = await analyzePart1(imageInput, photoType, gender, { age, height, weight }).catch(err => {
        console.warn('[AI] VL Part1失败:', err.message)
        return null
      })

      if (!part1Data) {
        task.status = 'failed'
        task.error = '视觉分析返回为空'
        return
      }

      // Part2 分析
      task.step = '色彩形象风格分析'; task.progress = 40
      console.log(`[AI] 任务${taskId} 开始Part2`)

      const part2Data = await analyzePart2(imageInput, part1Data, gender, { age, height, weight }).catch(err => {
        console.warn('[AI] VL Part2失败:', err.message)
        return {
          module3_hairmakeup: { title: '发型&妆容', hairRecommend: { top3: [], alternatives: [], hairColors: [], avoidHair: [] }, makeup: { style: '待分析' }, keyInsight: '' },
          module4_optimize: { title: '颜值优化诊断', optimizablePoints: [], priorityOrder: '', roadmap3m: {}, coreConclusion: '', keyInsight: '' }
        }
      })

      // 计算评分
      task.step = '生成报告'; task.progress = 80
      const faceScore = part1Data.module1_dna?.faceScore || 7
      const skinScore = ((part1Data.module2_style?.brightness || 7) + (part1Data.module2_style?.purity || 7)) / 2
      const styleScore = part1Data.module2_style?.mainScore || 7
      const overallScore = Math.round((faceScore * 0.35 + skinScore * 0.3 + styleScore * 0.2 + 7 * 0.15) * 10) / 10

      const result = {
        basic: {
          overallScore,
          tags: [
            part1Data.module1_dna?.faceType || '待分析',
            part1Data.module2_style?.season || '待分析',
            part1Data.module2_style?.mainStyle || '待分析'
          ]
        },
        modules: {
          dna: part1Data.module1_dna,
          style: part1Data.module2_style,
          hairmakeup: part2Data.module3_hairmakeup,
          optimize: part2Data.module4_optimize
        },
        images: {},
        photoUrl: photoUrl || '',
        imageComplete: false
      }

      task.status = 'done'
      task.progress = 100
      task.step = '分析完成'
      task.result = result
      console.log(`[AI] 任务${taskId} 完成, 评分: ${overallScore}`)
    } catch (err) {
      console.error(`[AI] 任务${taskId} 失败:`, err.message)
      const task = tasks.get(taskId)
      if (task) {
        task.status = 'failed'
        task.error = err.message || '分析失败'
      }
    }
  })()
})

/**
 * 查询任务状态
 * GET /api/ai/task/:taskId
 */
router.get('/task/:taskId', authRequired, (req, res) => {
  const { taskId } = req.params
  const task = tasks.get(taskId)
  if (!task) {
    return res.status(404).json({ code: -1, message: '任务不存在' })
  }
  if (task.openid !== req.user.openid) {
    return res.status(403).json({ code: -1, message: '无权访问' })
  }
  res.json({
    code: 0,
    data: {
      taskId,
      status: task.status,
      progress: task.progress,
      step: task.step,
      result: task.result,
      error: task.error
    }
  })
})

/**
 * 保留旧接口兼容（同步模式，可能会超时）
 * POST /api/ai/full-analysis
 */
router.post('/full-analysis', authRequired, async (req, res) => {
  const t0 = Date.now()
  try {
    const { imageUrl, photoType, gender, age, height, weight, photoUrl } = req.body
    const openid = req.user.openid

    if (!imageUrl || !/^https?:\/\//.test(imageUrl)) {
      return res.status(400).json({ code: -1, message: '缺少图片 URL（仅支持 OSS 直传后的 HTTP(S) URL）' })
    }
    const imageInput = imageUrl

    const part1Data = await analyzePart1(imageInput, photoType, gender, { age, height, weight }).catch(err => {
      console.warn('[AI] VL Part1失败:', err.message)
      return null
    })
    if (!part1Data) throw new Error('视觉分析返回为空')

    const part2Data = await analyzePart2(imageInput, part1Data, gender, { age, height, weight }).catch(err => {
      console.warn('[AI] VL Part2失败:', err.message)
      return {
        module3_hairmakeup: { title: '发型&妆容', hairRecommend: { top3: [], alternatives: [], hairColors: [], avoidHair: [] }, makeup: { style: '待分析' }, keyInsight: '' },
        module4_optimize: { title: '颜值优化诊断', optimizablePoints: [], priorityOrder: '', roadmap3m: {}, coreConclusion: '', keyInsight: '' }
      }
    })

    const faceScore = part1Data.module1_dna?.faceScore || 7
    const skinScore = ((part1Data.module2_style?.brightness || 7) + (part1Data.module2_style?.purity || 7)) / 2
    const styleScore = part1Data.module2_style?.mainScore || 7
    const overallScore = Math.round((faceScore * 0.35 + skinScore * 0.3 + styleScore * 0.2 + 7 * 0.15) * 10) / 10

    const result = {
      basic: { overallScore, tags: [part1Data.module1_dna?.faceType || '待分析', part1Data.module2_style?.season || '待分析', part1Data.module2_style?.mainStyle || '待分析'] },
      modules: { dna: part1Data.module1_dna, style: part1Data.module2_style, hairmakeup: part2Data.module3_hairmakeup, optimize: part2Data.module4_optimize },
      images: {}, photoUrl: photoUrl || '', imageComplete: false
    }

    res.json({ code: 0, data: result })
  } catch (err) {
    console.error('[AI] 完整分析失败:', err.message)
    res.status(500).json({ code: -1, message: '分析失败: ' + err.message })
  }
})

/**
 * 按需生成定向图片（已废弃）
 */
router.post('/generate-images', authRequired, async (req, res) => {
  res.json({ code: 0, data: { images: {} } })
})

// ============ 穿搭咨询路由 ============

router.post('/consult/analyze-clothing-vision', authRequired, async (req, res) => {
  try {
    const { images, consultType } = req.body
    if (!images || !images.length) return res.status(400).json({ code: -1, message: '缺少图片' })
    const items = await analyzeClothingVision(images, consultType)
    res.json({ code: 0, data: items })
  } catch (err) {
    res.status(500).json({ code: -1, message: err.message })
  }
})

router.post('/consult/generate-single-consult', authRequired, async (req, res) => {
  try {
    const { visualFeatures, userInfo, isRetry, reportSummary } = req.body
    const data = await generateSingleConsult(visualFeatures, userInfo, isRetry, reportSummary)
    res.json({ code: 0, data })
  } catch (err) {
    res.status(500).json({ code: -1, message: err.message })
  }
})

router.post('/consult/generate-compare-consult', authRequired, async (req, res) => {
  try {
    const { visualFeatures, userInfo, isRetry, reportSummary } = req.body
    const items = Array.isArray(visualFeatures) ? visualFeatures : [visualFeatures]
    const category = items[0]?.category || (userInfo && userInfo.category) || ''
    const enrichedUserInfo = { ...(userInfo || {}), category }
    const data = await generateCompareConsult(visualFeatures, enrichedUserInfo, isRetry, reportSummary)
    res.json({ code: 0, data })
  } catch (err) {
    res.status(500).json({ code: -1, message: err.message })
  }
})

router.post('/consult/detect-category', authRequired, async (req, res) => {
  try {
    const { images } = req.body
    if (!images || !images.length) return res.status(400).json({ code: -1, message: '缺少图片' })
    const category = await detectCategory(images)
    res.json({ code: 0, data: category })
  } catch (err) {
    res.status(500).json({ code: -1, message: err.message })
  }
})

module.exports = router
