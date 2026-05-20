// server.js - 搭搭后端服务
require('dotenv').config()
const express = require('express')
const cors = require('cors')
const multer = require('multer')
const path = require('path')
const fs = require('fs')
const jwt = require('jsonwebtoken')
const rateLimit = require('express-rate-limit')
const helmet = require('helmet')
const { v4: uuidv4 } = require('uuid')

const app = express()
const PORT = process.env.PORT || 3000
const JWT_SECRET = process.env.JWT_SECRET || 'dada_jwt_secret_2026'
const isProd = process.env.NODE_ENV === 'production'

// 云托管位于反向代理之后，信任 1 跳代理（云托管网关），让 X-Forwarded-Proto 生效
// 用 1 而非 true，避免 express-rate-limit v8 因"过度信任"抛 ValidationError 导致 500
app.set('trust proxy', 1)

// ===== 安全中间件 =====
// 开发环境禁用 helmet（微信开发者工具模拟器不兼容某些安全头）
if (isProd) {
  app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false
  }))
}

// CORS：生产环境限制来源
if (isProd) {
  app.use(cors({
    origin: ['https://api.cyberpm.tech', 'https://servicewechat.com'],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'HEAD'],
    credentials: true
  }))
} else {
  app.use(cors())
}

app.use(express.json({ limit: '20mb' }))

// ===== 限流配置 =====
// 全局限流：每IP每分钟200次
const globalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { code: 429, message: '请求过于频繁，请稍后再试' },
  skip: (req) => req.path === '/api/health' // 健康检查不限流
})

// AI 接口限流：每IP每分钟20次（保护外部 API 额度）
const aiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { code: 429, message: 'AI分析请求过于频繁，请稍后再试' }
})

// 上传接口限流：每IP每分钟30次
const uploadLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { code: 429, message: '上传请求过于频繁，请稍后再试' }
})

app.use(globalLimiter)

// ===== 全局请求超时 =====
// 普通接口 30s，AI 接口由路由自行设置更长超时
app.use((req, res, next) => {
  const isAI = req.path.startsWith('/api/ai/') || req.path.startsWith('/api/consult/analyze')
  const timeout = isAI ? 300000 : 30000  // AI接口5分钟，其他30秒
  req.setTimeout(timeout)
  res.setTimeout(timeout)
  next()
})

// 确保数据目录和上传目录存在
const UPLOAD_DIR = path.join(__dirname, 'uploads')
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true })
const DATA_DIR = path.join(__dirname, 'data')
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true })

// 上传目录静态托管：返回的图片 URL 直接走云托管公网域名供前端/AI 访问
// 注意：云托管容器为临时文件系统，重启后图片会丢失（够展示即可）
app.use('/uploads', express.static(UPLOAD_DIR, { maxAge: '7d' }))

// 文件上传（multer 错误处理）
const storage = multer.diskStorage({
  destination: UPLOAD_DIR,
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.jpg'
    cb(null, `${Date.now()}_${uuidv4().substr(0, 8)}${ext}`)
  }
})
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['.jpg', '.jpeg', '.png', '.webp', '.avif']
    const ext = path.extname(file.originalname).toLowerCase()
    if (allowed.includes(ext)) cb(null, true)
    else cb(new Error('不支持的图片格式'))
  }
})

// 上传路由（带限流，仅写本地，返回 HTTPS 公网 URL）
app.post('/api/upload', uploadLimiter, (req, res, next) => {
  upload.single('image')(req, res, (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ code: -1, message: '图片不能超过10MB' })
      }
      return res.status(400).json({ code: -1, message: err.message || '上传失败' })
    }
    if (!req.file) {
      return res.status(400).json({ code: -1, message: '未收到文件' })
    }
    const fileUrl = `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`
    res.json({ code: 0, data: { url: fileUrl, filename: req.file.filename } })
  })
})

// Base64 上传（带限流 + 大小校验，仅写本地）
app.post('/api/upload-base64', uploadLimiter, (req, res) => {
  try {
    const { imageBase64, ext } = req.body
    if (!imageBase64) {
      return res.status(400).json({ code: -1, message: '缺少 imageBase64' })
    }

    const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '')
    const buffer = Buffer.from(base64Data, 'base64')
    if (buffer.length > 10 * 1024 * 1024) {
      return res.status(400).json({ code: -1, message: '图片不能超过10MB' })
    }

    const fileExt = ext && ['.jpg', '.jpeg', '.png', '.webp', '.avif'].includes(ext.toLowerCase()) ? ext : '.jpg'
    const filename = `${Date.now()}_${uuidv4().substr(0, 8)}${fileExt}`
    const filePath = path.join(UPLOAD_DIR, filename)
    fs.writeFileSync(filePath, buffer)
    const fileUrl = `${req.protocol}://${req.get('host')}/uploads/${filename}`
    res.json({ code: 0, data: { url: fileUrl, filename } })
  } catch (err) {
    console.error('[upload-base64] 失败:', err.message)
    res.status(500).json({ code: -1, message: 'base64上传失败' })
  }
})

// 健康检查端点（客户端连通性探测用，不限流）
app.head('/api/health', (req, res) => res.status(200).end())
app.get('/api/health', (req, res) => res.json({ code: 0, message: 'ok', timestamp: Date.now() }))

// ===== 路由 =====
// 无需鉴权
const userRoutes = require('./routes/user')

app.use('/api/user', userRoutes)

// 需要鉴权（AI 接口加限流）
const aiRoutes = require('./routes/ai')
const reportRoutes = require('./routes/report')
const favoriteRoutes = require('./routes/favorite')
const consultRoutes = require('./routes/consult')

app.use('/api/ai', aiLimiter, aiRoutes)
app.use('/api/report', reportRoutes)
app.use('/api/favorite', favoriteRoutes)
app.use('/api/consult', aiLimiter, consultRoutes)

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
      '完整分析(VL)': 'POST /api/ai/full-analysis (需鉴权)',
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

// 全局错误处理中间件
app.use((err, req, res, next) => {
  if (err.name === 'UnauthorizedError') {
    return res.status(401).json({ code: 401, message: '请先登录' })
  }
  if (err.name === 'MulterError') {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ code: -1, message: '文件大小超过限制' })
    }
    return res.status(400).json({ code: -1, message: '文件上传失败' })
  }
  console.error('Server Error:', err)
  res.status(500).json({ code: -1, message: '服务器内部错误' })
})

app.listen(PORT, '0.0.0.0', () => {
  console.log(`搭搭服务已启动: http://localhost:${PORT}`)
  console.log(`鉴权模式: JWT Bearer Token`)
  console.log(`限流: 全局200/min, AI 20/min, 上传30/min`)
  console.log(`数据存储: ${DATA_DIR}`)
})
