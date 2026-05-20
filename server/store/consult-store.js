// 穿搭咨询记录持久化存储（基于 AsyncJsonStore）
const AsyncJsonStore = require('./async-json-store')

const DATA_DIR = require('path').join(__dirname, '..', 'data')
const store = new AsyncJsonStore(DATA_DIR, 'consults')

/**
 * 保存咨询记录
 */
async function saveConsultRecord(openid, record) {
  return store._withLock(openid, async () => {
    let records = (await store._load(openid)) || []
    record.id = record.id || store.generateId('C')
    record.openid = openid
    record.createTime = record.createTime || new Date().toISOString()
    records.unshift(record)
    if (records.length > 100) records.splice(100)
    store._cache.set(openid, records)
    store._markDirty(openid)
    return record
  })
}

/**
 * 获取咨询记录列表
 */
async function getConsultList(openid, limit = 20) {
  const records = (await store._load(openid)) || []
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
async function getConsult(openid, consultId) {
  const records = (await store._load(openid)) || []
  return records.find(r => r.id === consultId) || null
}

/**
 * 获取最近咨询记录
 */
async function getRecentConsults(openid, limit = 5) {
  const records = (await store._load(openid)) || []
  return records.slice(0, limit)
}

/**
 * 删除咨询记录
 */
async function deleteConsult(openid, consultId) {
  return store._withLock(openid, async () => {
    let records = (await store._load(openid)) || []
    const filtered = records.filter(r => r.id !== consultId)
    store._cache.set(openid, filtered)
    store._markDirty(openid)
    return filtered.length < records.length
  })
}

module.exports = { saveConsultRecord, getConsultList, getConsult, getRecentConsults, deleteConsult }
