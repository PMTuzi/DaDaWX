// server.js - 搭搭后端服务
// 优先加载 .env.production（云托管打包），开发本地可用 .env 覆盖
require('dotenv').config({ path: require('path').resolve(__dirname, '.env.production') })
require('dotenv').config()  // 本地 .env 若存在则补充/覆盖（生产环境无该文件）
const express = require('express')
const cors = require('cors')
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
// validate:false 关闭所有内置校验，避免 trust proxy 误报抛 500
// 全局限流：每IP每分钟200次
const globalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  validate: false,
  message: { code: 429, message: '请求过于频繁，请稍后再试' },
  skip: (req) => req.path === '/api/health' // 健康检查不限流
})

// AI 接口限流：每IP每分钟20次（保护外部 API 额度）
const aiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  validate: false,
  message: { code: 429, message: 'AI分析请求过于频繁，请稍后再试' }
})

// 上传接口限流：保留给 /api/oss/token（前端取凭证时限流）
const uploadLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  validate: false,
  message: { code: 429, message: '上传请求过于频繁，请稍后再试' }
})

app.use(globalLimiter)

// ===== 全局请求超时 =====
// 普通接口 30s，AI 接口由路由自行设置更长超时
app.use((req, res, next) => {
  // AI / 咨询 全部用 5 分钟，避免 30s 网关超时返回 -606001
  const longTimeoutPaths = ['/api/ai/', '/api/consult/']
  const isLong = longTimeoutPaths.some(p => req.path.startsWith(p))
  const timeout = isLong ? 300000 : 30000
  req.setTimeout(timeout)
  res.setTimeout(timeout)
  next()
})

// 数据目录
const DATA_DIR = path.join(__dirname, 'data')
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true })

// OSS 工具
const oss = require('./utils/oss')

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
const ossRoutes = require('./routes/oss')

app.use('/api/ai', aiLimiter, aiRoutes)
app.use('/api/report', reportRoutes)
app.use('/api/favorite', favoriteRoutes)
app.use('/api/consult', aiLimiter, consultRoutes)
app.use('/api/oss', uploadLimiter, ossRoutes)

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
      'OSS 直传凭证': 'GET /api/oss/token (无需鉴权)',
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
  console.error('Server Error:', err)
  res.status(500).json({ code: -1, message: '服务器内部错误' })
})

app.listen(PORT, '0.0.0.0', () => {
  console.log(`搭搭服务已启动: http://localhost:${PORT}`)
  console.log(`鉴权模式: JWT Bearer Token`)
  console.log(`限流: 全局200/min, AI 20/min, OSS凭证30/min`)
  console.log(`数据存储: ${DATA_DIR}`)
  console.log(`OSS 配置: ${oss.isConfigured() ? '已启用 ' + (process.env.OSS_BUCKET) + '@' + (process.env.OSS_REGION) : '未配置（请在环境变量中配置）'}`)
})
