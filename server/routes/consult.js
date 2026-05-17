// 穿搭咨询路由
const express = require('express')
const router = express.Router()
const { analyzeClothingVision, generateSingleConsult, generateCompareConsult } = require('../services/qwen')
const { validateSingleResult, validateCompareResult, safeMergeSingleResult, safeMergeCompareResult } = require('../utils/consult-schema')

// 服饰视觉分析
router.post('/analyze-clothing-vision', async (req, res) => {
  try {
    const { images, consultType } = req.body
    if (!images || !Array.isArray(images) || images.length === 0) {
      return res.status(400).json({ code: -1, message: '请上传至少一张图片' })
    }

    const result = await analyzeClothingVision(images, consultType)
    res.json({ code: 0, data: { features: result } })
  } catch (err) {
    console.error('[穿搭咨询] 视觉分析失败:', err.message)
    res.status(500).json({ code: -1, message: err.message || '视觉分析失败' })
  }
})

// 单品决策 - 生成评分结论（买不买/留不留）
router.post('/generate-single-consult', async (req, res) => {
  try {
    const { visualFeatures, category, priceRange, bodyFeatures, wearScenes, trouble, consultScene } = req.body
    if (!visualFeatures) {
      return res.status(400).json({ code: -1, message: '缺少视觉分析数据' })
    }

    const result = await generateSingleConsult(visualFeatures, {
      category, priceRange, bodyFeatures, wearScenes, trouble, consultScene
    })

    if (!validateSingleResult(result)) {
      try {
        const retryResult = await generateSingleConsult(visualFeatures, {
          category, priceRange, bodyFeatures, wearScenes, trouble, consultScene
        }, true)
        if (validateSingleResult(retryResult)) {
          return res.json({ code: 0, data: retryResult })
        }
      } catch (e) {
        console.error('[穿搭咨询] 重试失败:', e.message)
      }
      const merged = safeMergeSingleResult(result)
      return res.json({ code: 0, data: merged })
    }

    res.json({ code: 0, data: result })
  } catch (err) {
    console.error('[穿搭咨询] 单品决策失败:', err.message)
    const merged = safeMergeSingleResult(null)
    res.json({ code: 0, data: merged })
  }
})

// 多选一决策 - 生成对比评分（选哪个）
router.post('/generate-compare-consult', async (req, res) => {
  try {
    const { visualFeatures, compareScene, priceList, styleDiff, reason } = req.body
    if (!visualFeatures) {
      return res.status(400).json({ code: -1, message: '缺少视觉分析数据' })
    }

    const result = await generateCompareConsult(visualFeatures, {
      compareScene, priceList, styleDiff, reason
    })

    if (!validateCompareResult(result)) {
      try {
        const retryResult = await generateCompareConsult(visualFeatures, {
          compareScene, priceList, styleDiff, reason
        }, true)
        if (validateCompareResult(retryResult)) {
          return res.json({ code: 0, data: retryResult })
        }
      } catch (e) {
        console.error('[穿搭咨询] 重试失败:', e.message)
      }
      const merged = safeMergeCompareResult(result)
      return res.json({ code: 0, data: merged })
    }

    res.json({ code: 0, data: result })
  } catch (err) {
    console.error('[穿搭咨询] 多选一决策失败:', err.message)
    const merged = safeMergeCompareResult(null)
    res.json({ code: 0, data: merged })
  }
})

module.exports = router
