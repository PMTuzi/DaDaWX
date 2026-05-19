// AI 诊断路由（新架构：2次VL + 4次Seedream）
const express = require('express')
const router = express.Router()
const { authRequired } = require('../middleware/auth')
const { analyzePart1, analyzePart2, generateAllImages } = require('../services/qwen')
const { detectFaceLandmarks } = require('../services/face-detect')
const { analyzeFaceVisual } = require('../services/face-visual')
const reportStore = require('../store/report-store')
const userStore = require('../store/user-store')

/**
 * 完整分析流程
 * POST /api/ai/full-analysis
 * body: { imageUrl, imageBase64, photoType, gender, age, height, weight }
 * 
 * 流程：
 * 1. 2次VL分析（并行调用人脸检测）
 * 2. 4次Seedream图片生成（并行）
 * 3. 返回全部数据+图片URL
 */
router.post('/full-analysis', authRequired, async (req, res) => {
  const t0 = Date.now()
  try {
    const { imageUrl, imageBase64, photoType, gender, age, height, weight, photoUrl } = req.body
    const openid = req.user.openid
    let imageInput = imageBase64 || null

    // 准备图片数据
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

    if (!imageInput) return res.status(400).json({ code: -1, message: '缺少图片数据' })

    console.log(`[AI] 用户${openid.substring(0, 8)}... 开始完整分析, 类型: ${photoType}, 性别: ${gender}`)

    // ==================== 阶段1: VL分析 ====================
    const [part1Data, faceData, visualData] = await Promise.all([
      analyzePart1(imageInput, photoType, gender, { age, height, weight }).catch(err => {
        console.warn('[AI] VL Part1失败:', err.message)
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

    if (!part1Data) throw new Error('视觉分析返回为空')

    // 合并人脸检测精确数据
    if (faceData) {
      part1Data.module1_dna.landmarks = faceData.landmarks
      part1Data.module1_dna.detailPoints = faceData.detailPoints
      part1Data.module1_dna.faceType = faceData.faceType
      part1Data.module1_dna.threeCourtsMeasure = faceData.threeCourts
      part1Data.module1_dna.fiveEyesMeasure = faceData.fiveEyes
      console.log(`[AI] 人脸检测成功, 脸型: ${faceData.faceType || '未知'}`)
    }
    if (visualData) {
      part1Data.visualImages = visualData
    }

    // Part2（依赖Part1数据）
    console.log('[AI] 阶段1: VL Part2分析...')
    const part2Data = await analyzePart2(imageInput, part1Data, gender, { age, height, weight }).catch(err => {
      console.warn('[AI] VL Part2失败:', err.message)
      return {
        module3_hairmakeup: { title: '发型&妆容', hairRecommend: { top3: [], alternatives: [], hairColors: [], avoidHair: [] }, makeup: { style: '待分析' }, keyInsight: '' },
        module4_optimize: { title: '颜值优化诊断', optimizablePoints: [], priorityOrder: '', roadmap3m: {}, coreConclusion: '', keyInsight: '' }
      }
    })

    // 合并分析数据
    const analysisData = { ...part1Data, ...part2Data }

    // 计算综合评分
    const faceScore = part1Data.module1_dna?.faceScore || 7
    const skinScore = ((part1Data.module2_style?.brightness || 7) + (part1Data.module2_style?.purity || 7)) / 2
    const styleScore = part1Data.module2_style?.mainScore || 7
    const overallScore = Math.round((faceScore * 0.35 + skinScore * 0.3 + styleScore * 0.2 + 7 * 0.15) * 10) / 10

    console.log(`[AI] 阶段1完成, 耗时: ${Date.now() - t0}ms, 综合评分: ${overallScore}`)

    // ==================== 阶段2: Seedream图片生成 ====================
    console.log('[AI] 阶段2: 生成4张模块图片...')
    const images = await generateAllImages(analysisData)

    const imageCount = Object.values(images).filter(v => v).length
    console.log(`[AI] 阶段2完成, 成功${imageCount}/4张, 总耗时: ${Date.now() - t0}ms`)

    // 检查是否全部图片生成成功
    if (imageCount < 4) {
      console.warn('[AI] 部分图片生成失败，返回降级结果')
    }

    // 构建返回数据
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
      images,
      photoUrl: photoUrl || '',
      faceData: faceData ? {
        faceType: faceData.faceType,
        landmarks: faceData.landmarks,
        threeCourts: faceData.threeCourts,
        fiveEyes: faceData.fiveEyes
      } : null,
      visualImages: visualData || null,
      imageComplete: imageCount === 4
    }

    res.json({ code: 0, data: result })
  } catch (err) {
    console.error('[AI] 完整分析失败:', err.message)
    res.status(500).json({ code: -1, message: '分析失败: ' + err.message })
  }
})

// ============ 穿搭咨询路由 ============

const { analyzeClothingVision, generateSingleConsult, generateCompareConsult, detectCategory } = require('../services/qwen')
const consultStore = require('../store/consult-store')

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
    const { visualFeatures, userInfo, isRetry } = req.body
    const data = await generateSingleConsult(visualFeatures, userInfo, isRetry)
    res.json({ code: 0, data })
  } catch (err) {
    res.status(500).json({ code: -1, message: err.message })
  }
})

router.post('/consult/generate-compare-consult', authRequired, async (req, res) => {
  try {
    const { visualFeatures, userInfo, isRetry } = req.body
    const data = await generateCompareConsult(visualFeatures, userInfo, isRetry)
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

// 图片上传（不需要鉴权，但会记录用户）
const multer = require('multer')
const path = require('path')
const fs = require('fs')
const UPLOAD_DIR = path.join(__dirname, '..', 'uploads')
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true })

const storage = multer.diskStorage({
  destination: UPLOAD_DIR,
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.jpg'
    cb(null, `${Date.now()}_${Math.random().toString(36).substr(2, 8)}${ext}`)
  }
})
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } })

router.post('/upload', upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ code: -1, message: '未收到文件' })
  const url = `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`
  res.json({ code: 0, data: { url } })
})

router.post('/upload-base64', (req, res) => {
  try {
    const { imageBase64, ext } = req.body
    if (!imageBase64) return res.status(400).json({ code: -1, message: '缺少图片数据' })
    const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '')
    const filename = `${Date.now()}_${Math.random().toString(36).substr(2, 8)}${ext || '.jpg'}`
    const filePath = path.join(UPLOAD_DIR, filename)
    fs.writeFileSync(filePath, Buffer.from(base64Data, 'base64'))
    const url = `${req.protocol}://${req.get('host')}/uploads/${filename}`
    res.json({ code: 0, data: { url } })
  } catch (err) {
    res.status(500).json({ code: -1, message: '上传失败' })
  }
})

module.exports = router
