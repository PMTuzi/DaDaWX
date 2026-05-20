// 穿搭咨询路由
const express = require('express')
const router = express.Router()
const { authRequired } = require('../middleware/auth')
const crypto = require('crypto')
const { analyzeClothingVision, generateSingleConsult, generateCompareConsult, detectCategory } = require('../services/qwen')
const { validateSingleResult, validateCompareResult, safeMergeSingleResult, safeMergeCompareResult } = require('../utils/consult-schema')
const consultStore = require('../store/consult-store')
const userStore = require('../store/user-store')

// === Vision features 内存缓存：避免 compare/single 请求体超 callContainer 1MB 限制 ===
const visionCache = new Map()  // sessionId -> { features, expireAt }
const VISION_TTL = 30 * 60 * 1000  // 30 分钟
function putVisionCache(features) {
  const id = crypto.randomBytes(8).toString('hex')
  visionCache.set(id, { features, expireAt: Date.now() + VISION_TTL })
  return id
}
function getVisionCache(id) {
  const item = visionCache.get(id)
  if (!item) return null
  if (item.expireAt < Date.now()) { visionCache.delete(id); return null }
  return item.features
}
// 周期清理过期缓存
setInterval(() => {
  const now = Date.now()
  for (const [k, v] of visionCache.entries()) if (v.expireAt < now) visionCache.delete(k)
}, 5 * 60 * 1000).unref?.()

// 仅 OSS 直传 → 必须是 http(s) URL（前端已统一）
async function resolveLocalImage(img) {
  if (!img || !img.imageUrl || !/^https?:\/\//.test(img.imageUrl)) {
    throw new Error('图片必须是 OSS 直传后的 HTTP(S) URL')
  }
  return { imageUrl: img.imageUrl }
}

// 服饰视觉分析
router.post('/analyze-clothing-vision', authRequired, async (req, res) => {
  try {
    const { images, consultType } = req.body
    if (!images || !Array.isArray(images) || images.length === 0) {
      return res.status(400).json({ code: -1, message: '请上传至少一张图片' })
    }
    if (images.length > 4) {
      return res.status(400).json({ code: -1, message: '最多支持4张图片' })
    }

    const resolvedImages = await Promise.all(images.map(resolveLocalImage))
    const result = await analyzeClothingVision(resolvedImages, consultType)
    const visionSessionId = putVisionCache(result)
    const featuresSize = JSON.stringify(result).length
    console.log(`[穿搭咨询] 视觉分析成功 sessionId=${visionSessionId} 特征大小=${featuresSize}B`)
    res.json({ code: 0, data: { features: result, visionSessionId } })
  } catch (err) {
    console.error('[穿搭咨询] 视觉分析失败:', err.message)
    res.status(500).json({ code: -1, message: err.message || '视觉分析失败' })
  }
})

// 单品决策
router.post('/generate-single-consult', authRequired, async (req, res) => {
  console.log(`[穿搭咨询] 收到单品请求 user=${req.user?.openid?.slice(0,8)} body大小=${JSON.stringify(req.body).length}B`)
  try {
    let { visualFeatures, visionSessionId, category, priceRange, bodyFeatures, wearScenes, trouble, consultScene, images, reportSummary } = req.body
    if (!visualFeatures && visionSessionId) {
      visualFeatures = getVisionCache(visionSessionId)
    }
    if (!visualFeatures) {
      return res.status(400).json({ code: -1, message: '缺少视觉分析数据（sessionId 已过期请重新上传图片）' })
    }

    const result = await generateSingleConsult(visualFeatures, {
      category, priceRange, bodyFeatures, wearScenes, trouble, consultScene
    }, false, reportSummary || null)

    let finalResult
    if (!validateSingleResult(result)) {
      // 验证失败不再服务端重试（callContainer 网关 60s 硬超时，重试会触发 102002）
      console.warn('[穿搭咨询] 单品 AI 输出验证失败，直接返回错误')
      return res.status(502).json({ code: -1, message: 'AI 分析格式异常，请重试', aiError: true })
    } else {
      finalResult = result
    }

    // 服务端保存咨询记录（不阻塞响应）
    const record = {
      type: 'single',
      ...finalResult,
      images: images || [],
      category: category || ''
    }
    consultStore.saveConsultRecord(req.user.openid, record).catch(e =>
      console.error('[穿搭咨询] 保存记录失败:', e.message)
    )
    userStore.incrementConsultCount(req.user.openid).catch(e =>
      console.error('[穿搭咨询] 更新计数失败:', e.message)
    )

    res.json({ code: 0, data: finalResult })
  } catch (err) {
    console.error('[穿搭咨询] 单品决策失败:', err.message)
    res.status(502).json({ code: -1, message: 'AI 分析失败：' + (err.message || '未知错误'), aiError: true })
  }
})

// 多选一决策
router.post('/generate-compare-consult', authRequired, async (req, res) => {
  console.log(`[穿搭咨询] 收到多选一请求 user=${req.user?.openid?.slice(0,8)} body大小=${JSON.stringify(req.body).length}B`)
  try {
    let { visualFeatures, visionSessionId, compareScene, priceList, styleDiff, reason, images, reportSummary } = req.body
    if (!visualFeatures && visionSessionId) {
      visualFeatures = getVisionCache(visionSessionId)
    }
    if (!visualFeatures) {
      return res.status(400).json({ code: -1, message: '缺少视觉分析数据（sessionId 已过期请重新上传图片）' })
    }

    const result = await generateCompareConsult(visualFeatures, {
      compareScene, priceList, styleDiff, reason
    }, false, reportSummary || null)

    let finalResult
    if (!validateCompareResult(result)) {
      console.warn('[穿搭咨询] 多选一 AI 输出验证失败，直接返回错误')
      return res.status(502).json({ code: -1, message: 'AI 分析格式异常，请重试', aiError: true })
    } else {
      finalResult = result
    }

    // 服务端保存咨询记录（不阻塞响应）
    const record = {
      type: 'compare',
      ...finalResult,
      images: images || []
    }
    consultStore.saveConsultRecord(req.user.openid, record).catch(e =>
      console.error('[穿搭咨询] 保存记录失败:', e.message)
    )
    userStore.incrementConsultCount(req.user.openid).catch(e =>
      console.error('[穿搭咨询] 更新计数失败:', e.message)
    )

    res.json({ code: 0, data: finalResult })
  } catch (err) {
    console.error('[穿搭咨询] 多选一决策失败:', err.message)
    res.status(502).json({ code: -1, message: 'AI 分析失败：' + (err.message || '未知错误'), aiError: true })
  }
})

// 服饰类别快速识别
router.post('/detect-category', authRequired, async (req, res) => {
  try {
    const { images } = req.body
    if (!images || !Array.isArray(images) || images.length === 0) {
      return res.status(400).json({ code: -1, message: '请上传至少一张图片' })
    }

    const resolvedImages = await Promise.all(images.map(resolveLocalImage))
    const category = await detectCategory(resolvedImages)
    res.json({ code: 0, data: { category } })
  } catch (err) {
    console.error('[穿搭咨询] 类别识别失败:', err.message)
    res.status(500).json({ code: -1, message: err.message || '类别识别失败' })
  }
})

/**
 * 获取咨询记录列表
 * GET /api/consult/list
 */
router.get('/list', authRequired, async (req, res) => {
  try {
    const list = await consultStore.getConsultList(req.user.openid)
    res.json({ code: 0, data: list })
  } catch (err) {
    console.error('[穿搭咨询] 获取列表失败:', err.message)
    res.status(500).json({ code: -1, message: '获取失败' })
  }
})

/**
 * 获取咨询记录详情
 * GET /api/consult/:id
 */
router.get('/:id', authRequired, async (req, res) => {
  try {
    const record = await consultStore.getConsult(req.user.openid, req.params.id)
    if (!record) {
      return res.status(404).json({ code: -1, message: '记录不存在' })
    }
    res.json({ code: 0, data: record })
  } catch (err) {
    console.error('[穿搭咨询] 获取详情失败:', err.message)
    res.status(500).json({ code: -1, message: '获取失败' })
  }
})

module.exports = router
