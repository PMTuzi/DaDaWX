// 收藏数据持久化存储（JSON文件，按用户隔离）
const fs = require('fs')
const path = require('path')

const DATA_DIR = path.join(__dirname, '..', 'data')
const FAVORITES_DIR = path.join(DATA_DIR, 'favorites')

if (!fs.existsSync(FAVORITES_DIR)) fs.mkdirSync(FAVORITES_DIR, { recursive: true })

function getUserFavoriteFile(openid) {
  return path.join(FAVORITES_DIR, `${openid}.json`)
}

function loadUserFavorites(openid) {
  const filePath = getUserFavoriteFile(openid)
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf-8'))
    }
  } catch (e) {
    console.error(`[FavoriteStore] 加载用户 ${openid} 收藏失败:`, e.message)
  }
  return []
}

function saveUserFavorites(openid, favorites) {
  const filePath = getUserFavoriteFile(openid)
  try {
    fs.writeFileSync(filePath, JSON.stringify(favorites, null, 2), 'utf-8')
  } catch (e) {
    console.error(`[FavoriteStore] 保存用户 ${openid} 收藏失败:`, e.message)
  }
}

/**
 * 收藏/取消收藏
 */
function toggleFavorite(openid, { id, type, name }) {
  const favorites = loadUserFavorites(openid)
  const existIndex = favorites.findIndex(f => f.id === id)

  if (existIndex >= 0) {
    favorites.splice(existIndex, 1)
    saveUserFavorites(openid, favorites)
    return { favorited: false }
  } else {
    favorites.push({ id, type, name, createTime: new Date().toISOString() })
    saveUserFavorites(openid, favorites)
    return { favorited: true }
  }
}

/**
 * 获取收藏列表
 */
function getFavoriteList(openid, type) {
  let favorites = loadUserFavorites(openid)
  if (type) favorites = favorites.filter(f => f.type === type)
  return favorites
}

/**
 * 检查是否已收藏
 */
function isFavorited(openid, id) {
  const favorites = loadUserFavorites(openid)
  return favorites.some(f => f.id === id)
}

module.exports = { toggleFavorite, getFavoriteList, isFavorited }
