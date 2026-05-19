// JWT 鉴权中间件
const jwt = require('jsonwebtoken')
const JWT_SECRET = process.env.JWT_SECRET || 'dada_jwt_secret_2026'

/**
 * 验证 JWT Token，将 { openid } 挂载到 req.user
 * 用法: router.get('/xxx', authRequired, handler)
 */
function authRequired(req, res, next) {
  const authHeader = req.headers.authorization
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ code: 401, message: '请先登录' })
  }

  const token = authHeader.substring(7)
  try {
    const decoded = jwt.verify(token, JWT_SECRET)
    req.user = { openid: decoded.openid }
    next()
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ code: 401, message: '登录已过期，请重新登录' })
    }
    return res.status(401).json({ code: 401, message: '无效的登录凭证' })
  }
}

/**
 * 可选鉴权 — 有 token 则解析，没有也不拦截
 * 用法: router.get('/xxx', authOptional, handler)
 */
function authOptional(req, res, next) {
  const authHeader = req.headers.authorization
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7)
    try {
      const decoded = jwt.verify(token, JWT_SECRET)
      req.user = { openid: decoded.openid }
    } catch (e) {
      // token 无效，但不拦截
    }
  }
  next()
}

module.exports = { authRequired, authOptional }
