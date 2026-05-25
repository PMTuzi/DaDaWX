// 明星头像抓取服务（Wikidata + Wikimedia Commons → OSS 缓存）
// - 查询 Wikidata 实体 → 取 P18 (image) 文件名 → 下载 Commons 缩略图 → 上传 OSS
// - 持久化 JSON 缓存：server/data/celeb-images.json （{ name: { url, ts } }）
const axios = require('axios')
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const oss = require('../utils/oss')

const CACHE_FILE = path.join(__dirname, '..', 'data', 'celeb-images.json')
const REQ_TIMEOUT = 4000 // 单次外部请求超时
const NEG_CACHE_TTL = 24 * 60 * 60 * 1000 // 失败缓存 24h，避免反复打 Wikidata

let memCache = null

function loadCache() {
  if (memCache) return memCache
  try {
    if (fs.existsSync(CACHE_FILE)) {
      memCache = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf-8')) || {}
    } else {
      memCache = {}
    }
  } catch (e) {
    console.warn('[celeb-image] 读取缓存失败:', e.message)
    memCache = {}
  }
  return memCache
}

function saveCache() {
  try {
    fs.writeFileSync(CACHE_FILE, JSON.stringify(memCache || {}, null, 2))
  } catch (e) {
    console.warn('[celeb-image] 写入缓存失败:', e.message)
  }
}

// Wikidata 实体搜索：返回 Q-id（zh 优先，回退 en）
async function searchEntity(name) {
  const tryLang = async (lang) => {
    const { data } = await axios.get('https://www.wikidata.org/w/api.php', {
      params: {
        action: 'wbsearchentities',
        search: name,
        language: lang,
        uselang: lang,
        type: 'item',
        format: 'json',
        limit: 3
      },
      timeout: REQ_TIMEOUT
    })
    const items = data && data.search ? data.search : []
    // 优先选描述里有"演员/歌手/艺人/人物"的
    const preferred = items.find(it =>
      it.description && /(actor|actress|singer|演员|歌手|艺人|偶像|主持|模特|人物|演艺)/i.test(it.description)
    )
    return (preferred || items[0])?.id || null
  }
  return (await tryLang('zh')) || (await tryLang('en'))
}

// 取实体的 P18 文件名
async function getImageFilename(qid) {
  const { data } = await axios.get('https://www.wikidata.org/w/api.php', {
    params: {
      action: 'wbgetclaims',
      entity: qid,
      property: 'P18',
      format: 'json'
    },
    timeout: REQ_TIMEOUT
  })
  const claims = data && data.claims && data.claims.P18
  if (!claims || !claims.length) return null
  const filename = claims[0]?.mainsnak?.datavalue?.value
  return filename || null
}

// 下载 Commons 缩略图为 Buffer
async function downloadImage(filename) {
  // 经过 URL 编码（Commons 文件名空格用下划线）
  const encoded = encodeURIComponent(filename.replace(/\s/g, '_'))
  const url = `https://commons.wikimedia.org/wiki/Special:FilePath/${encoded}?width=400`
  const { data } = await axios.get(url, {
    responseType: 'arraybuffer',
    timeout: REQ_TIMEOUT * 2,
    maxContentLength: 5 * 1024 * 1024,
    headers: { 'User-Agent': 'Meeta-App/1.0 (celeb-avatar-fetcher)' }
  })
  return Buffer.from(data)
}

// 上传到 OSS，返回 https URL
async function uploadToOSS(name, buffer, originalFilename) {
  if (!oss.isConfigured()) {
    console.warn('[celeb-image] OSS 未配置，无法上传')
    return null
  }
  const ext = (originalFilename.match(/\.([a-z0-9]+)$/i) || [])[1] || 'jpg'
  const hash = crypto.createHash('md5').update(name).digest('hex').slice(0, 12)
  const filename = `celeb/${hash}.${ext.toLowerCase()}`
  try {
    const { url } = await oss.uploadBuffer(filename, buffer)
    return url
  } catch (e) {
    console.warn('[celeb-image] OSS 上传失败:', e.message)
    return null
  }
}

/**
 * 取明星头像 URL（含缓存）
 * @param {string} name 明星姓名
 * @returns {Promise<string|null>} https URL or null
 */
async function getCelebImageUrl(name) {
  if (!name || typeof name !== 'string') return null
  const key = name.trim()
  if (!key) return null

  const cache = loadCache()
  const hit = cache[key]
  const now = Date.now()
  if (hit) {
    if (hit.url) return hit.url
    // 失败缓存未过期：直接返回 null，跳过外部请求
    if (hit.failedAt && now - hit.failedAt < NEG_CACHE_TTL) return null
  }

  try {
    const qid = await searchEntity(key)
    if (!qid) {
      cache[key] = { url: null, failedAt: now, reason: 'no-entity' }
      saveCache()
      return null
    }
    const filename = await getImageFilename(qid)
    if (!filename) {
      cache[key] = { url: null, failedAt: now, reason: 'no-image', qid }
      saveCache()
      return null
    }
    const buffer = await downloadImage(filename)
    const url = await uploadToOSS(key, buffer, filename)
    if (url) {
      cache[key] = { url, qid, filename, ts: now }
      saveCache()
      return url
    }
    cache[key] = { url: null, failedAt: now, reason: 'upload-fail', qid }
    saveCache()
    return null
  } catch (e) {
    console.warn(`[celeb-image] ${key} 抓取失败:`, e.message)
    cache[key] = { url: null, failedAt: now, reason: 'error: ' + e.message }
    saveCache()
    return null
  }
}

/**
 * 批量取头像（并行 + 每个独立超时）
 * @param {string[]} names
 * @param {number} totalTimeoutMs 总体超时（默认 6s）
 * @returns {Promise<Object<string, string|null>>}
 */
async function getCelebImagesBatch(names, totalTimeoutMs = 6000) {
  const result = {}
  if (!Array.isArray(names) || !names.length) return result
  const tasks = names.map(name =>
    Promise.race([
      getCelebImageUrl(name).then(url => { result[name] = url }),
      new Promise(resolve => setTimeout(() => { result[name] = result[name] || null; resolve() }, totalTimeoutMs))
    ]).catch(() => { result[name] = null })
  )
  await Promise.all(tasks)
  return result
}

module.exports = { getCelebImageUrl, getCelebImagesBatch }
