// 收藏路由
const express = require('express')
const router = express.Router()

// 内存存储
let favorites = []

/**
 * 收藏/取消收藏
 * POST /api/favorite/toggle
 */
router.post('/toggle', (req, res) => {
  const { id, type, name } = req.body
  const existIndex = favorites.findIndex(f => f.id === id)

  if (existIndex >= 0) {
    favorites.splice(existIndex, 1)
    res.json({ code: 0, data: { favorited: false } })
  } else {
    favorites.push({ id, type, name, createTime: new Date().toISOString() })
    res.json({ code: 0, data: { favorited: true } })
  }
})

/**
 * 获取收藏列表
 * GET /api/favorite/list
 */
router.get('/list', (req, res) => {
  const { type } = req.query
  let list = favorites
  if (type) list = list.filter(f => f.type === type)
  res.json({ code: 0, data: list })
})

module.exports = router
