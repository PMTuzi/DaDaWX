// 用户数据持久化存储（JSON文件，生产环境建议换数据库）
const fs = require('fs')
const path = require('path')

const DATA_DIR = path.join(__dirname, '..', 'data')
const USER_FILE = path.join(DATA_DIR, 'users.json')

// 确保数据目录存在
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true })

// 内存缓存
let users = []

function loadUsers() {
  try {
    if (fs.existsSync(USER_FILE)) {
      users = JSON.parse(fs.readFileSync(USER_FILE, 'utf-8'))
    }
  } catch (e) {
    console.error('[UserStore] 加载用户数据失败:', e.message)
    users = []
  }
}

function saveUsers() {
  try {
    fs.writeFileSync(USER_FILE, JSON.stringify(users, null, 2), 'utf-8')
  } catch (e) {
    console.error('[UserStore] 保存用户数据失败:', e.message)
  }
}

// 启动时加载
loadUsers()

/**
 * 根据 openid 查找或创建用户
 */
function findOrCreate(openid) {
  let user = users.find(u => u.openid === openid)
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
    users.push(user)
    saveUsers()
  } else {
    user.lastLoginTime = new Date().toISOString()
    saveUsers()
  }
  return user
}

/**
 * 获取用户信息
 */
function getUser(openid) {
  return users.find(u => u.openid === openid) || null
}

/**
 * 更新用户信息
 */
function updateUser(openid, updates) {
  const user = users.find(u => u.openid === openid)
  if (!user) return null
  Object.assign(user, updates, { openid }) // 不允许修改 openid
  saveUsers()
  return user
}

/**
 * 增加报告计数
 */
function incrementReportCount(openid) {
  const user = users.find(u => u.openid === openid)
  if (user) {
    user.reportCount = (user.reportCount || 0) + 1
    saveUsers()
  }
}

/**
 * 增加咨询计数
 */
function incrementConsultCount(openid) {
  const user = users.find(u => u.openid === openid)
  if (user) {
    user.consultCount = (user.consultCount || 0) + 1
    saveUsers()
  }
}

module.exports = { findOrCreate, getUser, updateUser, incrementReportCount, incrementConsultCount }
