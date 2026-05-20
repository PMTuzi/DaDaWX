// 用户数据持久化存储（基于 AsyncJsonStore + HashMap 索引）
const AsyncJsonStore = require('./async-json-store')

const DATA_DIR = require('path').join(__dirname, '..', 'data')
const store = new AsyncJsonStore(DATA_DIR, 'users')

// 用户数据是全局单文件，用 openid 做 key 存入缓存
// _withLock 使用固定 key '__global__' 保证全局串行
const LOCK_KEY = '__global_users__'

async function _loadAll() {
  let data = await store._load(LOCK_KEY)
  if (!data) {
    data = { users: [] }
    store._cache.set(LOCK_KEY, data)
  }
  return data
}

/**
 * 根据 openid 查找或创建用户
 */
async function findOrCreate(openid) {
  return store._withLock(LOCK_KEY, async () => {
    const data = await _loadAll()
    let user = data.users.find(u => u.openid === openid)
    if (!user) {
      user = {
        openid,
        nickName: '搭搭用户',
        avatarUrl: '',
        createTime: new Date().toISOString(),
        lastLoginTime: new Date().toISOString(),
        reportCount: 0,
        consultCount: 0
      }
      data.users.push(user)
    } else {
      user.lastLoginTime = new Date().toISOString()
    }
    store._markDirty(LOCK_KEY)
    return user
  })
}

/**
 * 获取用户信息
 */
async function getUser(openid) {
  const data = await _loadAll()
  return data.users.find(u => u.openid === openid) || null
}

/**
 * 更新用户信息
 */
async function updateUser(openid, updates) {
  return store._withLock(LOCK_KEY, async () => {
    const data = await _loadAll()
    const user = data.users.find(u => u.openid === openid)
    if (!user) return null
    // 白名单更新字段
    const allowedFields = ['nickName', 'avatarUrl', 'gender', 'age', 'height', 'weight']
    for (const key of allowedFields) {
      if (updates[key] !== undefined) {
        // 长度限制
        if (typeof updates[key] === 'string') {
          user[key] = updates[key].slice(0, 200)
        } else {
          user[key] = updates[key]
        }
      }
    }
    user.openid = openid // 不允许修改 openid
    store._markDirty(LOCK_KEY)
    return user
  })
}

/**
 * 增加报告计数
 */
async function incrementReportCount(openid) {
  return store._withLock(LOCK_KEY, async () => {
    const data = await _loadAll()
    const user = data.users.find(u => u.openid === openid)
    if (user) {
      user.reportCount = (user.reportCount || 0) + 1
      store._markDirty(LOCK_KEY)
    }
  })
}

/**
 * 增加咨询计数
 */
async function incrementConsultCount(openid) {
  return store._withLock(LOCK_KEY, async () => {
    const data = await _loadAll()
    const user = data.users.find(u => u.openid === openid)
    if (user) {
      user.consultCount = (user.consultCount || 0) + 1
      store._markDirty(LOCK_KEY)
    }
  })
}

module.exports = { findOrCreate, getUser, updateUser, incrementReportCount, incrementConsultCount }
