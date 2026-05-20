// 报告路由
const express = require('express')
const router = express.Router()
const { authRequired } = require('../middleware/auth')
const reportStore = require('../store/report-store')
const userStore = require('../store/user-store')

/**
 * 保存报告
 * POST /api/report/save
 */
router.post('/save', authRequired, async (req, res) => {
  try {
    const report = req.body
    const openid = req.user.openid
    const saved = await reportStore.saveReport(openid, report)
    await userStore.incrementReportCount(openid)
    res.json({ code: 0, data: { id: saved.id } })
  } catch (err) {
    console.error('[报告] 保存失败:', err.message)
    res.status(500).json({ code: -1, message: '保存失败' })
  }
})

/**
 * 获取报告列表
 * GET /api/report/list
 */
router.get('/list', authRequired, async (req, res) => {
  try {
    const list = await reportStore.getReportList(req.user.openid)
    res.json({ code: 0, data: list })
  } catch (err) {
    console.error('[报告] 获取列表失败:', err.message)
    res.status(500).json({ code: -1, message: '获取失败' })
  }
})

/**
 * 获取所有报告（兼容旧接口）
 * GET /api/report/list/all
 */
router.get('/list/all', authRequired, async (req, res) => {
  try {
    const list = await reportStore.getReportList(req.user.openid)
    res.json({ code: 0, data: list })
  } catch (err) {
    console.error('[报告] 获取列表失败:', err.message)
    res.status(500).json({ code: -1, message: '获取失败' })
  }
})

/**
 * 获取最新报告
 * GET /api/report/latest
 */
router.get('/latest', authRequired, async (req, res) => {
  try {
    const report = await reportStore.getLatestReport(req.user.openid)
    if (!report) {
      return res.json({ code: 0, data: null })
    }
    res.json({ code: 0, data: report })
  } catch (err) {
    console.error('[报告] 获取最新失败:', err.message)
    res.status(500).json({ code: -1, message: '获取失败' })
  }
})

/**
 * 获取报告详情
 * GET /api/report/:id
 */
router.get('/:id', authRequired, async (req, res) => {
  try {
    const report = await reportStore.getReport(req.user.openid, req.params.id)
    if (!report) {
      return res.status(404).json({ code: -1, message: '报告不存在' })
    }
    res.json({ code: 0, data: report })
  } catch (err) {
    console.error('[报告] 获取详情失败:', err.message)
    res.status(500).json({ code: -1, message: '获取失败' })
  }
})

/**
 * 删除报告
 * DELETE /api/report/:id
 */
router.delete('/:id', authRequired, async (req, res) => {
  try {
    const deleted = await reportStore.deleteReport(req.user.openid, req.params.id)
    if (!deleted) {
      return res.status(404).json({ code: -1, message: '报告不存在' })
    }
    res.json({ code: 0, message: '已删除' })
  } catch (err) {
    console.error('[报告] 删除失败:', err.message)
    res.status(500).json({ code: -1, message: '删除失败' })
  }
})

module.exports = router
