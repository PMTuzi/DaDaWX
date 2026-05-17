// 用户路由
const express = require('express')
const router = express.Router()
const axios = require('axios')
const jwt = require('jsonwebtoken')

const JWT_SECRET = process.env.JWT_SECRET || 'dada_secret_key'
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

    // 调用微信接口获取openid
    const wxRes = await axios.get('https://api.weixin.qq.com/sns/jscode2session', {
      params: {
        appid: WX_APPID,
        secret: WX_SECRET,
        js_code: code,
        grant_type: 'authorization_code'
      }
    })

    const { openid, session_key } = wxRes.data

    if (!openid) {
      return res.status(400).json({ code: -1, message: '微信登录失败' })
    }

    // 生成JWT token
    const token = jwt.sign({ openid }, JWT_SECRET, { expiresIn: '30d' })

    res.json({
      code: 0,
      data: {
        token,
        userInfo: {
          openid,
          nickName: '搭搭用户',
          avatarUrl: ''
        }
      }
    })
  } catch (err) {
    console.error('登录失败:', err)
    res.status(500).json({ code: -1, message: '登录失败' })
  }
})

module.exports = router
