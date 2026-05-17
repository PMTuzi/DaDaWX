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
app.use(express.json({ limit: '10mb' }))

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

// 路由
const ossRoutes = require('./routes/oss')
const aiRoutes = require('./routes/ai')
const reportRoutes = require('./routes/report')
const userRoutes = require('./routes/user')
const favoriteRoutes = require('./routes/favorite')

app.use('/api/oss', ossRoutes)
app.use('/api/ai', aiRoutes)
app.use('/api/report', reportRoutes)
app.use('/api/user', userRoutes)
app.use('/api/favorite', favoriteRoutes)

// 首页
app.get('/', (req, res) => {
  res.json({
    name: '搭搭 - AI形象决策平台',
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
  console.log(`🚀 搭搭服务已启动: http://localhost:${PORT}`)
})
