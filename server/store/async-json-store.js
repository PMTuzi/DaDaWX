// 异步 JSON Store 基类
// 解决：1) 同步 I/O 阻塞事件循环  2) 并发读-改-写竞态条件  3) ID 碰撞
const fs = require('fs')
const path = require('path')
const { v4: uuidv4 } = require('uuid')

class AsyncJsonStore {
  constructor(dataDir, subdir) {
    this.dir = path.join(dataDir, subdir)
    // 每个用户的写入队列，防止并发读-改-写竞态
    this._writeQueues = new Map()
    // 内存缓存（按 openid 缓存）
    this._cache = new Map()
    // 脏标记（需要写盘）
    this._dirty = new Set()
    // 定时刷盘间隔
    this._flushInterval = null

    // 确保目录存在
    if (!fs.existsSync(this.dir)) fs.mkdirSync(this.dir, { recursive: true })

    // 每 2 秒刷盘一次，合并多次写操作
    this._flushInterval = setInterval(() => this._flushAll(), 2000)
    // 进程退出时刷盘
    process.on('beforeExit', () => this._flushAllSync())
  }

  _getUserFile(openid) {
    return path.join(this.dir, `${openid}.json`)
  }

  /**
   * 安全读取用户数据（异步 + 缓存）
   */
  async _load(openid) {
    if (this._cache.has(openid)) {
      return this._cache.get(openid)
    }
    const filePath = this._getUserFile(openid)
    try {
      await fs.promises.access(filePath)
      const raw = await fs.promises.readFile(filePath, 'utf-8')
      const data = JSON.parse(raw)
      this._cache.set(openid, data)
      return data
    } catch (e) {
      // 文件不存在或解析失败
      return null
    }
  }

  /**
   * 标记脏数据（延迟刷盘，合并多次写入）
   */
  _markDirty(openid) {
    this._dirty.add(openid)
  }

  /**
   * 定时刷盘（将内存缓存写入磁盘）
   */
  async _flushAll() {
    if (this._dirty.size === 0) return
    const ids = [...this._dirty]
    this._dirty.clear()
    for (const openid of ids) {
      const data = this._cache.get(openid)
      if (!data) continue
      try {
        const filePath = this._getUserFile(openid)
        await fs.promises.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8')
      } catch (e) {
        console.error(`[AsyncJsonStore] 刷盘失败 ${openid}:`, e.message)
        // 刷盘失败，重新标记脏
        this._dirty.add(openid)
      }
    }
  }

  /**
   * 同步刷盘（进程退出前调用）
   */
  _flushAllSync() {
    for (const openid of this._dirty) {
      const data = this._cache.get(openid)
      if (!data) continue
      try {
        const filePath = this._getUserFile(openid)
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8')
      } catch (e) {
        console.error(`[AsyncJsonStore] 同步刷盘失败 ${openid}:`, e.message)
      }
    }
    this._dirty.clear()
  }

  /**
   * 带写入队列的操作（解决竞态条件）
   * 同一用户的操作串行化，不同用户并行执行
   */
  async _withLock(openid, fn) {
    // 等待前一个操作完成
    const prev = this._writeQueues.get(openid) || Promise.resolve()
    const next = prev.then(() => fn()).catch(err => {
      console.error(`[AsyncJsonStore] 操作失败 ${openid}:`, err.message)
      throw err
    })
    this._writeQueues.set(openid, next)
    // 清理已完成的队列
    next.finally(() => {
      if (this._writeQueues.get(openid) === next) {
        this._writeQueues.delete(openid)
      }
    })
    return next
  }

  /**
   * 生成唯一 ID
   */
  generateId(prefix) {
    return `${prefix}${Date.now()}_${uuidv4().substr(0, 8)}`
  }

  /**
   * 销毁（停止定时器）
   */
  destroy() {
    if (this._flushInterval) {
      clearInterval(this._flushInterval)
      this._flushInterval = null
    }
    this._flushAllSync()
  }
}

module.exports = AsyncJsonStore
