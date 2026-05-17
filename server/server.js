// server.js - 搭搭后端服务
require('dotenv').config()
const express = require('express')
const cors = require('cors')
const multer = require('multer')
const path = require('path')
const fs = require('fs')

const app = express()
const PORT = process.env.PORT || 3000

// 中间件
app.use(cors())
app.use(express.json({ limit: '20mb' }))

// 静态文件服务（开发模式图片访问）
const UPLOAD_DIR = path.join(__dirname, 'uploads')
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true })
app.use('/uploads', express.static(UPLOAD_DIR))

// 开发模式：直接上传图片到服务器
const storage = multer.diskStorage({
  destination: UPLOAD_DIR,
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.jpg'
    cb(null, `${Date.now()}_${Math.random().toString(36).substr(2, 8)}${ext}`)
  }
})
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } })

app.post('/api/upload', upload.single('image'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ code: -1, message: '未收到文件' })
  }
  const fileUrl = `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`
  res.json({ code: 0, data: { url: fileUrl, filename: req.file.filename } })
})

// base64 图片上传（wx.uploadFile 不稳定时的可靠替代方案）
app.post('/api/upload-base64', (req, res) => {
  try {
    const { imageBase64, ext } = req.body
    if (!imageBase64) {
      return res.status(400).json({ code: -1, message: '缺少 imageBase64' })
    }

    // 去掉 data:image/xxx;base64, 前缀
    const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '')
    const buffer = Buffer.from(base64Data, 'base64')

    const fileExt = ext || '.jpg'
    const filename = `${Date.now()}_${Math.random().toString(36).substr(2, 8)}${fileExt}`
    const filePath = path.join(UPLOAD_DIR, filename)

    fs.writeFileSync(filePath, buffer)
    const fileUrl = `${req.protocol}://${req.get('host')}/uploads/${filename}`
    res.json({ code: 0, data: { url: fileUrl, filename } })
  } catch (err) {
    console.error('[upload-base64] 失败:', err.message)
    res.status(500).json({ code: -1, message: 'base64上传失败' })
  }
})

// 路由
const ossRoutes = require('./routes/oss')
const aiRoutes = require('./routes/ai')
const reportRoutes = require('./routes/report')
const userRoutes = require('./routes/user')
const favoriteRoutes = require('./routes/favorite')
const consultRoutes = require('./routes/consult')

app.use('/api/oss', ossRoutes)
app.use('/api/ai', aiRoutes)
app.use('/api/report', reportRoutes)
app.use('/api/user', userRoutes)
app.use('/api/favorite', favoriteRoutes)
app.use('/api/consult', consultRoutes)

// 首页
app.get('/', (req, res) => {
  res.json({
    name: '搭搭 - AI形象诊断平台',
    version: '1.0.0',
    apiDocs: {
      '视觉分析': 'POST /api/ai/analyze-vision',
      '生成报告': 'POST /api/ai/generate-report',
      'OSS凭证': 'GET /api/oss/token',
      '微信登录': 'POST /api/user/login',
      '报告详情': 'GET /api/report/:id',
      '报告列表': 'GET /api/report/list/all',
      '收藏切换': 'POST /api/favorite/toggle',
      '收藏列表': 'GET /api/favorite/list',
      '穿搭视觉分析': 'POST /api/consult/analyze-clothing-vision',
      '单品决策': 'POST /api/consult/generate-single-consult',
      '多选一决策': 'POST /api/consult/generate-compare-consult',
      '健康检查': 'GET /api/health'
    }
  })
})

// 健康检查
app.get('/api/health', (req, res) => {
  res.json({ code: 0, message: 'ok', timestamp: Date.now() })
})

// 错误处理
app.use((err, req, res, next) => {
  console.error('Server Error:', err)
  res.status(500).json({ code: -1, message: err.message || '服务器内部错误' })
})

app.listen(PORT, () => {
  console.log(`搭搭服务已启动: http://localhost:${PORT}`)
})
