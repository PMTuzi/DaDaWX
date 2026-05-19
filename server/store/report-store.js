// 报告数据持久化存储（JSON文件，按用户隔离）
const fs = require('fs')
const path = require('path')

const DATA_DIR = path.join(__dirname, '..', 'data')
const REPORTS_DIR = path.join(DATA_DIR, 'reports')

// 确保目录存在
if (!fs.existsSync(REPORTS_DIR)) fs.mkdirSync(REPORTS_DIR, { recursive: true })

/**
 * 获取用户报告文件路径
 */
function getUserReportFile(openid) {
  return path.join(REPORTS_DIR, `${openid}.json`)
}

/**
 * 加载用户的报告列表
 */
function loadUserReports(openid) {
  const filePath = getUserReportFile(openid)
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf-8'))
    }
  } catch (e) {
    console.error(`[ReportStore] 加载用户 ${openid} 报告失败:`, e.message)
  }
  return []
}

/**
 * 保存用户的报告列表
 */
function saveUserReports(openid, reports) {
  const filePath = getUserReportFile(openid)
  try {
    fs.writeFileSync(filePath, JSON.stringify(reports, null, 2), 'utf-8')
  } catch (e) {
    console.error(`[ReportStore] 保存用户 ${openid} 报告失败:`, e.message)
  }
}

/**
 * 保存报告（自动绑定 openid）
 */
function saveReport(openid, report) {
  const reports = loadUserReports(openid)
  report.id = report.id || 'R' + Date.now()
  report.openid = openid
  report.createTime = report.createTime || new Date().toISOString()
  reports.unshift(report)
  // 最多保留 50 份
  if (reports.length > 50) reports.splice(50)
  saveUserReports(openid, reports)
  return report
}

/**
 * 获取用户报告列表（摘要）
 */
function getReportList(openid) {
  const reports = loadUserReports(openid)
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
function getReport(openid, reportId) {
  const reports = loadUserReports(openid)
  return reports.find(r => r.id === reportId) || null
}

/**
 * 获取最新一份报告
 */
function getLatestReport(openid) {
  const reports = loadUserReports(openid)
  return reports.length > 0 ? reports[0] : null
}

/**
 * 删除报告
 */
function deleteReport(openid, reportId) {
  const reports = loadUserReports(openid)
  const filtered = reports.filter(r => r.id !== reportId)
  saveUserReports(openid, filtered)
  return filtered.length < reports.length
}

module.exports = { saveReport, getReportList, getReport, getLatestReport, deleteReport }
