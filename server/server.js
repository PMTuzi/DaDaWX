// server.js - 搭搭后端服务
require('dotenv').config()
const express = require('express')
const cors = require('cors')
const multer = require('multer')
const path = require('path')
const fs = require('fs')
const jwt = require('jsonwebtoken')

const app = express()
const PORT = process.env.PORT || 3000
const JWT_SECRET = process.env.JWT_SECRET || 'dada_jwt_secret_2026'

// 中间件
app.use(cors())
app.use(express.json({ limit: '20mb' }))

// 静态文件服务（开发模式图片访问）
const UPLOAD_DIR = path.join(__dirname, 'uploads')
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true })
app.use('/uploads', express.static(UPLOAD_DIR))

// 确保数据目录存在
const DATA_DIR = path.join(__dirname, 'data')
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true })

// 开发模式：直接上传图片到服务器（无需鉴权）
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

app.post('/api/upload-base64', (req, res) => {
  try {
    const { imageBase64, ext } = req.body
    if (!imageBase64) {
      return res.status(400).json({ code: -1, message: '缺少 imageBase64' })
    }

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

// 路由（无需鉴权）
const ossRoutes = require('./routes/oss')
const userRoutes = require('./routes/user')

app.use('/api/oss', ossRoutes)
app.use('/api/user', userRoutes)

// 路由（需要鉴权）
const aiRoutes = require('./routes/ai')
const reportRoutes = require('./routes/report')
const favoriteRoutes = require('./routes/favorite')
const consultRoutes = require('./routes/consult')

app.use('/api/ai', aiRoutes)
app.use('/api/report', reportRoutes)
app.use('/api/favorite', favoriteRoutes)
app.use('/api/consult', consultRoutes)

// 首页
app.get('/', (req, res) => {
  res.json({
    name: '搭搭 - AI形象诊断平台',
    version: '2.0.0',
    auth: 'JWT Bearer Token',
    apiDocs: {
      '微信登录': 'POST /api/user/login (无需鉴权)',
      '用户信息': 'GET /api/user/profile (需鉴权)',
      '更新用户': 'PUT /api/user/profile (需鉴权)',
      '完整分析(VL+Seedream)': 'POST /api/ai/full-analysis (需鉴权)',
      '图片上传': 'POST /api/upload (无需鉴权)',
      'Base64上传': 'POST /api/upload-base64 (无需鉴权)',
      '报告列表': 'GET /api/report/list (需鉴权)',
      '报告详情': 'GET /api/report/:id (需鉴权)',
      '最新报告': 'GET /api/report/latest (需鉴权)',
      '保存报告': 'POST /api/report/save (需鉴权)',
      '删除报告': 'DELETE /api/report/:id (需鉴权)',
      '收藏切换': 'POST /api/favorite/toggle (需鉴权)',
      '收藏列表': 'GET /api/favorite/list (需鉴权)',
      '穿搭视觉分析': 'POST /api/consult/analyze-clothing-vision (需鉴权)',
      '单品决策': 'POST /api/consult/generate-single-consult (需鉴权)',
      '多选一决策': 'POST /api/consult/generate-compare-consult (需鉴权)',
      '类别识别': 'POST /api/consult/detect-category (需鉴权)',
      '咨询记录列表': 'GET /api/consult/list (需鉴权)',
      '咨询记录详情': 'GET /api/consult/:id (需鉴权)',
      '健康检查': 'GET /api/health (无需鉴权)'
    }
  })
})

// 健康检查
app.get('/api/health', (req, res) => {
  res.json({ code: 0, message: 'ok', timestamp: Date.now() })
})

// 401 统一响应（供客户端判断登录态）
app.use((err, req, res, next) => {
  if (err.name === 'UnauthorizedError') {
    return res.status(401).json({ code: 401, message: '请先登录' })
  }
  console.error('Server Error:', err)
  res.status(500).json({ code: -1, message: err.message || '服务器内部错误' })
})

app.listen(PORT, '0.0.0.0', () => {
  console.log(`搭搭服务已启动: http://localhost:${PORT}`)
  console.log(`局域网访问: http://172.21.242.182:${PORT}`)
  console.log(`鉴权模式: JWT Bearer Token`)
  console.log(`数据存储: ${DATA_DIR}`)
})
