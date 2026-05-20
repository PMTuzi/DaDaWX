// 收藏数据持久化存储（基于 AsyncJsonStore）
const AsyncJsonStore = require('./async-json-store')

const DATA_DIR = require('path').join(__dirname, '..', 'data')
const store = new AsyncJsonStore(DATA_DIR, 'favorites')

/**
 * 收藏/取消收藏
 */
async function toggleFavorite(openid, { id, type, name }) {
  return store._withLock(openid, async () => {
    let favorites = (await store._load(openid)) || []
    const existIndex = favorites.findIndex(f => f.id === id)

    if (existIndex >= 0) {
      favorites.splice(existIndex, 1)
      store._cache.set(openid, favorites)
      store._markDirty(openid)
      return { favorited: false }
    } else {
      // 输入校验
      const safeName = typeof name === 'string' ? name.slice(0, 100) : ''
      const safeType = typeof type === 'string' ? type.slice(0, 50) : ''
      favorites.push({ id, type: safeType, name: safeName, createTime: new Date().toISOString() })
      store._cache.set(openid, favorites)
      store._markDirty(openid)
      return { favorited: true }
    }
  })
}

/**
 * 获取收藏列表
 */
async function getFavoriteList(openid, type) {
  let favorites = (await store._load(openid)) || []
  if (type) favorites = favorites.filter(f => f.type === type)
  return favorites
}

/**
 * 检查是否已收藏
 */
async function isFavorited(openid, id) {
  const favorites = (await store._load(openid)) || []
  return favorites.some(f => f.id === id)
}

module.exports = { toggleFavorite, getFavoriteList, isFavorited }
