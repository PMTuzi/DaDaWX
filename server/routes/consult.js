// 穿搭咨询路由
const express = require('express')
const router = express.Router()
const { authRequired } = require('../middleware/auth')
const fs = require('fs')
const path = require('path')
const { analyzeClothingVision, generateSingleConsult, generateCompareConsult, detectCategory } = require('../services/qwen')
const { validateSingleResult, validateCompareResult, safeMergeSingleResult, safeMergeCompareResult } = require('../utils/consult-schema')
const consultStore = require('../store/consult-store')
const userStore = require('../store/user-store')

// 将本地服务器URL转为base64（兼容局域网IP）- 异步版
async function resolveLocalImage(img) {
  if (img.imageBase64) return img
  if (!img.imageUrl) return img

  const localMatch = img.imageUrl.match(/\/uploads\/(.+)$/)
  if (localMatch) {
    const filePath = path.join(__dirname, '..', 'uploads', localMatch[1])
    try {
      await fs.promises.access(filePath)
      const fileBuffer = await fs.promises.readFile(filePath)
      const ext = path.extname(filePath).toLowerCase()
      const mimeMap = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' }
      const mime = mimeMap[ext] || 'image/jpeg'
      return { imageBase64: `data:${mime};base64,${fileBuffer.toString('base64')}` }
    } catch (e) {
      // 文件不存在，使用原始 URL
    }
  }
  return img
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
    res.json({ code: 0, data: { features: result } })
  } catch (err) {
    console.error('[穿搭咨询] 视觉分析失败:', err.message)
    res.status(500).json({ code: -1, message: err.message || '视觉分析失败' })
  }
})

// 单品决策
router.post('/generate-single-consult', authRequired, async (req, res) => {
  try {
    const { visualFeatures, category, priceRange, bodyFeatures, wearScenes, trouble, consultScene, images, reportSummary } = req.body
    if (!visualFeatures) {
      return res.status(400).json({ code: -1, message: '缺少视觉分析数据' })
    }

    const result = await generateSingleConsult(visualFeatures, {
      category, priceRange, bodyFeatures, wearScenes, trouble, consultScene
    }, false, reportSummary || null)

    let finalResult
    if (!validateSingleResult(result)) {
      try {
        const retryResult = await generateSingleConsult(visualFeatures, {
          category, priceRange, bodyFeatures, wearScenes, trouble, consultScene
        }, true, reportSummary || null)
        if (validateSingleResult(retryResult)) {
          finalResult = retryResult
        }
      } catch (e) {
        console.error('[穿搭咨询] 重试失败:', e.message)
      }
      if (!finalResult) finalResult = safeMergeSingleResult(result)
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
    const merged = safeMergeSingleResult(null)
    res.json({ code: 0, data: merged })
  }
})

// 多选一决策
router.post('/generate-compare-consult', authRequired, async (req, res) => {
  try {
    const { visualFeatures, compareScene, priceList, styleDiff, reason, images, reportSummary } = req.body
    if (!visualFeatures) {
      return res.status(400).json({ code: -1, message: '缺少视觉分析数据' })
    }

    const result = await generateCompareConsult(visualFeatures, {
      compareScene, priceList, styleDiff, reason
    }, false, reportSummary || null)

    let finalResult
    if (!validateCompareResult(result)) {
      try {
        const retryResult = await generateCompareConsult(visualFeatures, {
          compareScene, priceList, styleDiff, reason
        }, true, reportSummary || null)
        if (validateCompareResult(retryResult)) {
          finalResult = retryResult
        }
      } catch (e) {
        console.error('[穿搭咨询] 重试失败:', e.message)
      }
      if (!finalResult) finalResult = safeMergeCompareResult(result)
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
    const merged = safeMergeCompareResult(null)
    res.json({ code: 0, data: merged })
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
