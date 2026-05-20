// 报告数据持久化存储（基于 AsyncJsonStore，异步+写入队列+缓存）
const AsyncJsonStore = require('./async-json-store')

const DATA_DIR = require('path').join(__dirname, '..', 'data')
const store = new AsyncJsonStore(DATA_DIR, 'reports')

/**
 * 保存报告（自动绑定 openid，写入队列保护并发）
 */
async function saveReport(openid, report) {
  return store._withLock(openid, async () => {
    let reports = (await store._load(openid)) || []
    report.id = report.id || store.generateId('R')
    report.openid = openid
    report.createTime = report.createTime || new Date().toISOString()
    reports.unshift(report)
    if (reports.length > 50) reports.splice(50)
    store._cache.set(openid, reports)
    store._markDirty(openid)
    return report
  })
}

/**
 * 获取用户报告列表（摘要）
 */
async function getReportList(openid) {
  const reports = (await store._load(openid)) || []
  return reports.map(r => ({
    id: r.id,
    createTime: r.createTime,
    overallScore: r.basic?.overallScore,
    tags: r.basic?.tags,
    photoUrl: r.photoUrl || '',
    summary: r.summary?.coreConclusion || r.basic?.advantages || ''
  }))
}

/**
 * 获取报告详情
 */
async function getReport(openid, reportId) {
  const reports = (await store._load(openid)) || []
  return reports.find(r => r.id === reportId) || null
}

/**
 * 获取最新一份报告
 */
async function getLatestReport(openid) {
  const reports = (await store._load(openid)) || []
  return reports.length > 0 ? reports[0] : null
}

/**
 * 删除报告
 */
async function deleteReport(openid, reportId) {
  return store._withLock(openid, async () => {
    let reports = (await store._load(openid)) || []
    const filtered = reports.filter(r => r.id !== reportId)
    store._cache.set(openid, filtered)
    store._markDirty(openid)
    return filtered.length < reports.length
  })
}

module.exports = { saveReport, getReportList, getReport, getLatestReport, deleteReport }
