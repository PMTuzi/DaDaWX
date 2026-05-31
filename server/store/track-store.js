// 埋点数据存储（追加写入，按日期分文件）
const fs = require('fs')
const path = require('path')

const DATA_DIR = path.join(__dirname, '..', 'data', 'track')
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true })

function todayFile() {
  const d = new Date()
  const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  return path.join(DATA_DIR, `${date}.jsonl`)
}

function append(event) {
  const line = JSON.stringify(event) + '\n'
  fs.appendFileSync(todayFile(), line, 'utf-8')
}

function readAll() {
  const files = fs.readdirSync(DATA_DIR).filter(f => f.endsWith('.jsonl')).sort()
  const events = []
  for (const f of files) {
    const lines = fs.readFileSync(path.join(DATA_DIR, f), 'utf-8').split('\n').filter(Boolean)
    for (const l of lines) {
      try { events.push(JSON.parse(l)) } catch (_) {}
    }
  }
  return events
}

// 按 productId 汇总点击数和 openid 去重数
function stats() {
  const events = readAll()
  const map = {}
  for (const e of events) {
    const key = e.productId || 'unknown'
    if (!map[key]) map[key] = { productId: key, productName: e.productName || '', clicks: 0, uv: new Set() }
    map[key].clicks++
    if (e.openid) map[key].uv.add(e.openid)
  }
  return Object.values(map).map(m => ({
    productId: m.productId,
    productName: m.productName,
    clicks: m.clicks,
    uv: m.uv.size
  })).sort((a, b) => b.clicks - a.clicks)
}

// 按天汇总总点击量
function dailyStats() {
  const files = fs.readdirSync(DATA_DIR).filter(f => f.endsWith('.jsonl')).sort()
  return files.map(f => {
    const date = f.replace('.jsonl', '')
    const lines = fs.readFileSync(path.join(DATA_DIR, f), 'utf-8').split('\n').filter(Boolean)
    return { date, clicks: lines.length }
  })
}

module.exports = { append, stats, dailyStats }
