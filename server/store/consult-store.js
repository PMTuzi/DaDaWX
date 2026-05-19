// 穿搭咨询记录持久化存储（JSON文件，按用户隔离）
const fs = require('fs')
const path = require('path')

const DATA_DIR = path.join(__dirname, '..', 'data')
const CONSULTS_DIR = path.join(DATA_DIR, 'consults')

// 确保目录存在
if (!fs.existsSync(CONSULTS_DIR)) fs.mkdirSync(CONSULTS_DIR, { recursive: true })

function getUserConsultFile(openid) {
  return path.join(CONSULTS_DIR, `${openid}.json`)
}

function loadUserConsults(openid) {
  const filePath = getUserConsultFile(openid)
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf-8'))
    }
  } catch (e) {
    console.error(`[ConsultStore] 加载用户 ${openid} 咨询记录失败:`, e.message)
  }
  return []
}

function saveUserConsults(openid, records) {
  const filePath = getUserConsultFile(openid)
  try {
    fs.writeFileSync(filePath, JSON.stringify(records, null, 2), 'utf-8')
  } catch (e) {
    console.error(`[ConsultStore] 保存用户 ${openid} 咨询记录失败:`, e.message)
  }
}

/**
 * 保存咨询记录
 */
function saveConsultRecord(openid, record) {
  const records = loadUserConsults(openid)
  record.id = record.id || 'C' + Date.now()
  record.openid = openid
  record.createTime = record.createTime || new Date().toISOString()
  records.unshift(record)
  if (records.length > 100) records.splice(100)
  saveUserConsults(openid, records)
  return record
}

/**
 * 获取咨询记录列表
 */
function getConsultList(openid, limit = 20) {
  const records = loadUserConsults(openid)
  return records.slice(0, limit).map(r => ({
    id: r.id,
    type: r.type,
    verdict: r.verdict || r.finalChoiceLabel || '',
    totalScore: r.totalScore,
    createTime: r.createTime,
    images: r.images || [],
    category: r.category || ''
  }))
}

/**
 * 获取咨询记录详情
 */
function getConsult(openid, consultId) {
  const records = loadUserConsults(openid)
  return records.find(r => r.id === consultId) || null
}

/**
 * 获取最近咨询记录（首页展示用）
 */
function getRecentConsults(openid, limit = 5) {
  const records = loadUserConsults(openid)
  return records.slice(0, limit)
}

/**
 * 删除咨询记录
 */
function deleteConsult(openid, consultId) {
  const records = loadUserConsults(openid)
  const filtered = records.filter(r => r.id !== consultId)
  saveUserConsults(openid, filtered)
  return filtered.length < records.length
}

module.exports = { saveConsultRecord, getConsultList, getConsult, getRecentConsults, deleteConsult }
