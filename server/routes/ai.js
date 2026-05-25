// AI 诊断路由（异步任务模式：避免 callContainer 超时）
const express = require('express')
const router = express.Router()
const { authRequired } = require('../middleware/auth')
const { analyzePart1, analyzePart2 } = require('../services/qwen')
const { analyzeClothingVision, generateSingleConsult, generateCompareConsult, detectCategory, generateBeautyPlan } = require('../services/qwen')
const { getCelebImagesBatch } = require('../services/celeb-image')
const reportStore = require('../store/report-store')
const userStore = require('../store/user-store')
const consultStore = require('../store/consult-store')
const fs = require('fs')
const path = require('path')

// 读取明星映射表（每次诊断重新读，量小可接受；亦可加缓存）
function loadCelebMap() {
  try {
    const file = path.join(__dirname, '..', 'data', 'celeb-images.json')
    return JSON.parse(fs.readFileSync(file, 'utf-8')) || {}
  } catch (_) {
    return {}
  }
}

// 颜值百分位映射（与前端 utils/format.js 保持一致）
function calcPercentile(score) {
  if (score == null || isNaN(score)) return null
  const s = Math.max(0, Math.min(10, Number(score)))
  const anchors = [
    [0, 1], [3, 10], [4, 25], [5, 50], [6, 70],
    [7, 85], [7.5, 90], [8, 94], [8.5, 96.5],
    [9, 98], [9.5, 99], [10, 99.5]
  ]
  let prev = anchors[0]
  for (let i = 1; i < anchors.length; i++) {
    const cur = anchors[i]
    if (s <= cur[0]) {
      const t = (s - prev[0]) / (cur[0] - prev[0])
      const p = prev[1] + t * (cur[1] - prev[1])
      return Math.round(p * 10) / 10
    }
    prev = cur
  }
  return 99
}

// 给 celebrity.top5 注入 imageUrl，并对名单外明星做兜底替换
async function enrichCelebrityImages(celebrity) {
  if (!celebrity || !Array.isArray(celebrity.top5) || !celebrity.top5.length) return celebrity

  const celebMap = loadCelebMap()
  const whitelist = Object.keys(celebMap).filter(k => celebMap[k] && celebMap[k].url)
  const whiteSet = new Set(whitelist)

  // 兜底：把名单外的 name 替换为名单中"未被使用"的明星，相似度沿用 AI 原值
  // 这样保证 5 个都有头像可显示。被替换的项打 _replaced 标记便于排查。
  const used = new Set()
  const top5 = celebrity.top5.map(it => {
    if (!it || !it.name) return it
    const name = String(it.name).trim()
    if (whiteSet.has(name) && !used.has(name)) {
      used.add(name)
      return { ...it, name }
    }
    // 名单外或重复 → 找一个未被使用的白名单明星顶替
    const fallback = whitelist.find(n => !used.has(n))
    if (fallback) {
      used.add(fallback)
      console.warn(`[AI] celeb 兜底替换: "${name}" → "${fallback}"`)
      return { ...it, name: fallback, _replaced: true, _origName: name }
    }
    return { ...it, name }
  })

  // 批量取头像（命中本地映射时秒回）；最终只保留 top3
  const top3 = top5.slice(0, 3)
  const names = top3.map(it => it && it.name).filter(Boolean)
  try {
    const urls = await getCelebImagesBatch(names, 6000)
    celebrity.top5 = top3.map(it => ({
      ...it,
      imageUrl: (it && it.name && urls[it.name]) || (celebMap[it.name] && celebMap[it.name].url) || null
    }))
  } catch (e) {
    console.warn('[AI] 明星头像注入失败:', e.message)
    celebrity.top5 = top3
  }
  return celebrity
}

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

      // 计算评分（与 prompt【评分标准】对齐：face 主导 50%，去掉 +7*15% 的安全分基线）
      task.step = '生成报告'; task.progress = 80
      const faceScore = part1Data.module1_dna?.faceScore || 5
      const skinScore = ((part1Data.module2_style?.brightness || 5) + (part1Data.module2_style?.purity || 5)) / 2
      const styleScore = part1Data.module2_style?.mainScore || 5
      let overallScore = Math.round((faceScore * 0.5 + skinScore * 0.3 + styleScore * 0.2) * 10) / 10
      // 反诋纪律：face 是核心，skin/style 不得把总分拉高超过 face+1，避免"脸4分总分6"的假象
      if (overallScore > faceScore + 1) {
        overallScore = Math.round((faceScore + 1) * 10) / 10
      }
      const percentile = calcPercentile(overallScore)

      const result = {
        basic: {
          overallScore,
          percentile,
          tags: [
            part1Data.module1_dna?.faceType || '待分析',
            part1Data.module1_dna?.colorIntensity || '待分析',
            part1Data.module2_style?.season || '待分析',
            part1Data.module2_style?.mainStyle || '待分析',
            (function(v){
              if (!v) return '视龄·待分析'
              const s = String(v).trim()
              // 提取数字（可能是 "26" / "25-27" / "26岁" / "看起来26岁" 等）
              const m = s.match(/(\d+(?:\s*[-~到至]\s*\d+)?)/)
              if (m) {
                const num = m[1].replace(/\s|到|至|~/g, '-')
                return num.includes('-') ? `视龄${num}` : `视龄${num}岁`
              }
              return `视龄·${s}`
            })(part1Data.module1_dna?.visualAge)
          ]
        },
        modules: {
          dna: part1Data.module1_dna,
          style: part1Data.module2_style,
          hairmakeup: part2Data.module3_hairmakeup,
          optimize: part2Data.module4_optimize,
          celebrity: part1Data.module5_celebrity || null
        },
        images: {},
        photoUrl: photoUrl || '',
        imageComplete: false
      }

      // 抓取明星头像（同步，最多等 6s）
      task.step = '抓取明星头像'; task.progress = 90
      if (result.modules.celebrity) {
        await enrichCelebrityImages(result.modules.celebrity)
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

    const faceScore = part1Data.module1_dna?.faceScore || 5
    const skinScore = ((part1Data.module2_style?.brightness || 5) + (part1Data.module2_style?.purity || 5)) / 2
    const styleScore = part1Data.module2_style?.mainScore || 5
    let overallScore = Math.round((faceScore * 0.5 + skinScore * 0.3 + styleScore * 0.2) * 10) / 10
    // 反诋纪律：face 是核心，skin/style 不得把总分拉高超过 face+1
    if (overallScore > faceScore + 1) {
      overallScore = Math.round((faceScore + 1) * 10) / 10
    }
    const percentile = calcPercentile(overallScore)

    const result = {
      basic: { overallScore, percentile, tags: [part1Data.module1_dna?.faceType || '待分析', part1Data.module2_style?.season || '待分析', part1Data.module2_style?.mainStyle || '待分析'] },
      modules: { dna: part1Data.module1_dna, style: part1Data.module2_style, hairmakeup: part2Data.module3_hairmakeup, optimize: part2Data.module4_optimize, celebrity: part1Data.module5_celebrity || null },
      images: {}, photoUrl: photoUrl || '', imageComplete: false
    }

    if (result.modules.celebrity) {
      await enrichCelebrityImages(result.modules.celebrity)
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

/**
 * 28天蜕变计划生成
 * POST /api/ai/generate-beauty-plan
 * body: { reportId, summary: { faceShape, skinSeason, skinType, mainStyle, shoulderType, bodyRatio, weaknesses, gender } }
 * resp: { code:0, data: { days: [...] } }
 */
router.post('/generate-beauty-plan', authRequired, async (req, res) => {
  try {
    const { summary } = req.body || {}
    const data = await generateBeautyPlan(summary || {})
    res.json({ code: 0, data })
  } catch (err) {
    console.error('[generate-beauty-plan] 失败:', err.message)
    res.status(500).json({ code: -1, message: err.message })
  }
})

module.exports = router
