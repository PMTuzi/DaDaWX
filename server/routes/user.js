// 用户路由
const express = require('express')
const router = express.Router()
const axios = require('axios')
const jwt = require('jsonwebtoken')
const { authRequired } = require('../middleware/auth')
const userStore = require('../store/user-store')

const JWT_SECRET = process.env.JWT_SECRET || 'dada_jwt_secret_2026'
const WX_APPID = process.env.WX_APPID
const WX_SECRET = process.env.WX_SECRET

/**
 * 微信登录
 * POST /api/user/login
 */
router.post('/login', async (req, res) => {
  try {
    const { code } = req.body

    if (!code) {
      return res.status(400).json({ code: -1, message: '缺少登录code' })
    }

    if (!WX_APPID || WX_APPID === 'your_wx_appid' || !WX_SECRET || WX_SECRET === 'your_wx_secret') {
      // 开发模式：没有配置微信appid时，用 code 的 hash 作为模拟 openid
      const crypto = require('crypto')
      const mockOpenid = 'dev_' + crypto.createHash('md5').update(code).digest('hex').substring(0, 16)
      console.log('[登录] 开发模式，模拟openid:', mockOpenid)

      const user = userStore.findOrCreate(mockOpenid)
      const token = jwt.sign({ openid: mockOpenid }, JWT_SECRET, { expiresIn: '30d' })

      return res.json({
        code: 0,
        data: {
          token,
          userInfo: {
            openid: mockOpenid,
            nickName: user.nickName || '搭搭用户',
            avatarUrl: user.avatarUrl || ''
          }
        }
      })
    }

    // 正式模式：调用微信接口获取openid
    const wxRes = await axios.get('https://api.weixin.qq.com/sns/jscode2session', {
      params: {
        appid: WX_APPID,
        secret: WX_SECRET,
        js_code: code,
        grant_type: 'authorization_code'
      },
      timeout: 10000
    })

    const { openid, session_key, errcode, errmsg } = wxRes.data

    if (!openid || errcode) {
      console.error('[登录] 微信接口返回错误:', errcode, errmsg)
      return res.status(400).json({ code: -1, message: errmsg || '微信登录失败' })
    }

    // 查找或创建用户
    const user = userStore.findOrCreate(openid)

    // 生成JWT token
    const token = jwt.sign({ openid }, JWT_SECRET, { expiresIn: '30d' })

    res.json({
      code: 0,
      data: {
        token,
        userInfo: {
          openid,
          nickName: user.nickName || '搭搭用户',
          avatarUrl: user.avatarUrl || ''
        }
      }
    })
  } catch (err) {
    console.error('[登录] 失败:', err.message)
    res.status(500).json({ code: -1, message: '登录失败' })
  }
})

/**
 * 获取当前用户信息
 * GET /api/user/profile
 */
router.get('/profile', authRequired, (req, res) => {
  const user = userStore.getUser(req.user.openid)
  if (!user) {
    return res.status(404).json({ code: -1, message: '用户不存在' })
  }
  res.json({
    code: 0,
    data: {
      openid: user.openid,
      nickName: user.nickName,
      avatarUrl: user.avatarUrl,
      reportCount: user.reportCount || 0,
      consultCount: user.consultCount || 0,
      createTime: user.createTime,
      lastLoginTime: user.lastLoginTime
    }
  })
})

/**
 * 更新用户信息
 * PUT /api/user/profile
 */
router.put('/profile', authRequired, (req, res) => {
  const { nickName, avatarUrl } = req.body
  const updates = {}
  if (nickName) updates.nickName = nickName
  if (avatarUrl) updates.avatarUrl = avatarUrl

  const user = userStore.updateUser(req.user.openid, updates)
  if (!user) {
    return res.status(404).json({ code: -1, message: '用户不存在' })
  }
  res.json({ code: 0, data: user })
})

module.exports = router
