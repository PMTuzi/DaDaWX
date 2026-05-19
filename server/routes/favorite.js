// 收藏路由
const express = require('express')
const router = express.Router()
const { authRequired } = require('../middleware/auth')
const favoriteStore = require('../store/favorite-store')

/**
 * 收藏/取消收藏
 * POST /api/favorite/toggle
 */
router.post('/toggle', authRequired, (req, res) => {
  try {
    const { id, type, name } = req.body
    if (!id) {
      return res.status(400).json({ code: -1, message: '缺少收藏目标id' })
    }
    const result = favoriteStore.toggleFavorite(req.user.openid, { id, type, name })
    res.json({ code: 0, data: result })
  } catch (err) {
    console.error('[收藏] 操作失败:', err.message)
    res.status(500).json({ code: -1, message: '操作失败' })
  }
})

/**
 * 获取收藏列表
 * GET /api/favorite/list
 */
router.get('/list', authRequired, (req, res) => {
  try {
    const { type } = req.query
    const list = favoriteStore.getFavoriteList(req.user.openid, type)
    res.json({ code: 0, data: list })
  } catch (err) {
    console.error('[收藏] 获取列表失败:', err.message)
    res.status(500).json({ code: -1, message: '获取失败' })
  }
})

module.exports = router
