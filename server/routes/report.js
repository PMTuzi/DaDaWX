// 报告路由
const express = require('express')
const router = express.Router()

// 内存存储（生产环境使用数据库）
let reports = []

/**
 * 获取报告详情
 * GET /api/report/:id
 */
router.get('/:id', (req, res) => {
  const report = reports.find(r => r.id === req.params.id)
  if (!report) {
    return res.status(404).json({ code: -1, message: '报告不存在' })
  }
  res.json({ code: 0, data: report })
})

/**
 * 获取报告列表
 * GET /api/report/list
 */
router.get('/list/all', (req, res) => {
  const list = reports.map(r => ({
    id: r.id,
    createTime: r.createTime,
    overallScore: r.basic?.overallScore,
    tags: r.basic?.tags
  }))
  res.json({ code: 0, data: list })
})

/**
 * 保存报告
 * POST /api/report/save
 */
router.post('/save', (req, res) => {
  const report = req.body
  report.id = report.id || 'R' + Date.now()
  report.createTime = report.createTime || new Date().toISOString()
  reports.unshift(report)
  // 最多保留50份
  if (reports.length > 50) reports = reports.slice(0, 50)
  res.json({ code: 0, data: { id: report.id } })
})

/**
 * 删除报告
 * DELETE /api/report/:id
 */
router.delete('/:id', (req, res) => {
  reports = reports.filter(r => r.id !== req.params.id)
  res.json({ code: 0, message: '已删除' })
})

module.exports = router
