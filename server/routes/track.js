// 埋点路由
const express = require('express')
const router = express.Router()
const { authRequired } = require('../middleware/auth')
const trackStore = require('../store/track-store')

/**
 * 上报点击事件
 * POST /api/track
 * body: { event, productId, productName, page, extra }
 */
router.post('/', authRequired, (req, res) => {
  try {
    const { event = 'click', productId, productName, page, extra } = req.body
    if (!event) return res.status(400).json({ code: -1, message: 'event 不能为空' })
    trackStore.append({
      event,
      productId: productId || '',
      productName: productName || '',
      page: page || '',
      openid: req.user.openid,
      ts: Date.now(),
      extra: extra || {}
    })
    res.json({ code: 0 })
  } catch (err) {
    console.error('[Track] 上报失败:', err.message)
    res.status(500).json({ code: -1, message: '上报失败' })
  }
})

/**
 * 查询商品点击统计
 * GET /api/track/stats
 */
router.get('/stats', authRequired, (req, res) => {
  try {
    const productStats = trackStore.stats()
    const daily = trackStore.dailyStats()
    const total = productStats.reduce((s, p) => s + p.clicks, 0)
    res.json({ code: 0, data: { total, products: productStats, daily } })
  } catch (err) {
    console.error('[Track] 查询失败:', err.message)
    res.status(500).json({ code: -1, message: '查询失败' })
  }
})

module.exports = router
