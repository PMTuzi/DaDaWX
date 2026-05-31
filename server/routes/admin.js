// 管理后台路由 - 埋点数据可视化（无需 JWT，使用 ADMIN_KEY 保护）
const express = require('express')
const router = express.Router()
const trackStore = require('../store/track-store')

const ADMIN_KEY = process.env.ADMIN_KEY || 'dada-admin-2024'

function checkKey(req, res, next) {
  const key = req.query.key || req.headers['x-admin-key']
  if (key !== ADMIN_KEY) {
    return res.status(401).send(`
      <html><head><meta charset="utf-8"><title>搭搭后台</title>
      <style>body{font-family:sans-serif;display:flex;justify-content:center;align-items:center;height:100vh;margin:0;background:#f5f5f5;}
      .box{background:#fff;padding:40px;border-radius:12px;box-shadow:0 4px 20px rgba(0,0,0,.1);text-align:center;min-width:320px;}
      input{width:100%;padding:10px 14px;border:1px solid #ddd;border-radius:8px;font-size:16px;box-sizing:border-box;margin:12px 0;}
      button{width:100%;padding:12px;background:#333;color:#fff;border:none;border-radius:8px;font-size:16px;cursor:pointer;}
      button:hover{background:#555;}</style></head>
      <body><div class="box"><h2>🔑 搭搭管理后台</h2>
      <form method="get"><input type="password" name="key" placeholder="输入管理密钥" autofocus>
      <button type="submit">进入</button></form></div></body></html>
    `)
  }
  next()
}

// 统计数据 JSON 接口
router.get('/stats', checkKey, (req, res) => {
  const products = trackStore.stats()
  const daily = trackStore.dailyStats()
  const total = products.reduce((s, p) => s + p.clicks, 0)
  res.json({ total, products, daily })
})

// 管理后台首页
router.get('/', checkKey, (req, res) => {
  const key = req.query.key
  res.send(`<!DOCTYPE html>
<html lang="zh">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>搭搭 · 埋点数据</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'PingFang SC', sans-serif;
         background: #f0f2f5; color: #1a1a1a; }
  .header { background: #fff; padding: 20px 32px; border-bottom: 1px solid #eee;
            display: flex; align-items: center; gap: 12px; }
  .header h1 { font-size: 20px; font-weight: 700; }
  .header .sub { font-size: 13px; color: #999; }
  .container { max-width: 900px; margin: 32px auto; padding: 0 20px; }
  .stats-row { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-bottom: 24px; }
  .stat-card { background: #fff; border-radius: 12px; padding: 24px;
               box-shadow: 0 2px 8px rgba(0,0,0,.06); text-align: center; }
  .stat-card .num { font-size: 36px; font-weight: 700; color: #333; }
  .stat-card .label { font-size: 13px; color: #999; margin-top: 4px; }
  .card { background: #fff; border-radius: 12px; padding: 24px;
          box-shadow: 0 2px 8px rgba(0,0,0,.06); margin-bottom: 24px; }
  .card h2 { font-size: 16px; font-weight: 600; margin-bottom: 16px; color: #333; }
  table { width: 100%; border-collapse: collapse; }
  th { text-align: left; font-size: 12px; color: #999; font-weight: 500;
       padding: 8px 12px; border-bottom: 1px solid #f0f0f0; }
  td { padding: 12px; border-bottom: 1px solid #f7f7f7; font-size: 14px; }
  tr:last-child td { border-bottom: none; }
  tr:hover td { background: #fafafa; }
  .rank { display: inline-flex; align-items: center; justify-content: center;
          width: 24px; height: 24px; border-radius: 50%; font-size: 12px;
          font-weight: 700; background: #f0f0f0; color: #666; }
  .rank.top1 { background: #FFD700; color: #7a5c00; }
  .rank.top2 { background: #C0C0C0; color: #555; }
  .rank.top3 { background: #CD7F32; color: #5a3010; }
  .bar-wrap { display: flex; align-items: center; gap: 8px; }
  .bar { height: 8px; border-radius: 4px; background: #333; min-width: 2px; transition: width .3s; }
  .uv-badge { display: inline-block; padding: 2px 8px; background: #f0f7ff;
              color: #3578e5; border-radius: 20px; font-size: 12px; }
  .chart-wrap { overflow-x: auto; }
  .chart { display: flex; align-items: flex-end; gap: 8px; height: 140px;
           padding-bottom: 24px; position: relative; min-width: 400px; }
  .bar-col { flex: 1; display: flex; flex-direction: column; align-items: center;
             justify-content: flex-end; gap: 4px; min-width: 28px; }
  .bar-col .b { background: #333; border-radius: 4px 4px 0 0; width: 100%;
                transition: height .3s; }
  .bar-col .b:hover { background: #555; }
  .bar-col .dl { font-size: 10px; color: #999; writing-mode: vertical-rl;
                 transform: rotate(180deg); white-space: nowrap; }
  .bar-col .dv { font-size: 11px; color: #555; font-weight: 600; }
  .empty { text-align: center; color: #bbb; padding: 48px 0; font-size: 14px; }
  .refresh { float: right; font-size: 13px; color: #999; cursor: pointer;
             padding: 4px 10px; border: 1px solid #eee; border-radius: 6px; }
  .refresh:hover { background: #f5f5f5; }
</style>
</head>
<body>
<div class="header">
  <div>
    <h1>搭搭 · 埋点数据</h1>
    <div class="sub" id="updateTime">加载中…</div>
  </div>
  <button class="refresh" onclick="load()">↻ 刷新</button>
</div>
<div class="container">
  <div class="stats-row">
    <div class="stat-card"><div class="num" id="totalClicks">—</div><div class="label">总点击次数</div></div>
    <div class="stat-card"><div class="num" id="totalProducts">—</div><div class="label">有点击商品数</div></div>
    <div class="stat-card"><div class="num" id="totalDays">—</div><div class="label">累计活跃天数</div></div>
  </div>

  <div class="card">
    <h2>📦 商品点击排行</h2>
    <div id="productTable"><div class="empty">暂无数据</div></div>
  </div>

  <div class="card">
    <h2>📅 每日点击趋势</h2>
    <div class="chart-wrap"><div class="chart" id="dailyChart"><div class="empty" style="flex:1">暂无数据</div></div></div>
  </div>
</div>

<script>
const KEY = '${key}'

async function load() {
  document.getElementById('updateTime').textContent = '更新中…'
  try {
    const r = await fetch('/admin/stats?key=' + KEY)
    const d = await r.json()
    renderStats(d)
    document.getElementById('updateTime').textContent = '最后更新：' + new Date().toLocaleTimeString('zh')
  } catch(e) {
    document.getElementById('updateTime').textContent = '加载失败，请刷新'
  }
}

function renderStats(d) {
  document.getElementById('totalClicks').textContent = d.total || 0
  document.getElementById('totalProducts').textContent = (d.products || []).length
  document.getElementById('totalDays').textContent = (d.daily || []).filter(x => x.clicks > 0).length

  // 商品表格
  const products = d.products || []
  if (!products.length) {
    document.getElementById('productTable').innerHTML = '<div class="empty">暂无点击数据</div>'
  } else {
    const maxClicks = products[0].clicks
    const rows = products.map((p, i) => {
      const rankClass = i === 0 ? 'top1' : i === 1 ? 'top2' : i === 2 ? 'top3' : ''
      const barW = Math.max(4, Math.round((p.clicks / maxClicks) * 120))
      return \`<tr>
        <td><span class="rank \${rankClass}">\${i+1}</span></td>
        <td>\${p.productName || p.productId}</td>
        <td><div class="bar-wrap"><div class="bar" style="width:\${barW}px"></div><span>\${p.clicks}</span></div></td>
        <td><span class="uv-badge">\${p.uv} 人</span></td>
      </tr>\`
    }).join('')
    document.getElementById('productTable').innerHTML = \`
      <table><thead><tr>
        <th width="40">#</th><th>商品</th><th>点击次数</th><th>独立用户(UV)</th>
      </tr></thead><tbody>\${rows}</tbody></table>\`
  }

  // 每日趋势柱状图
  const daily = (d.daily || []).slice(-14)  // 最近14天
  const chartEl = document.getElementById('dailyChart')
  if (!daily.length) {
    chartEl.innerHTML = '<div class="empty" style="flex:1">暂无数据</div>'
    return
  }
  const maxD = Math.max(...daily.map(x => x.clicks), 1)
  chartEl.innerHTML = daily.map(x => {
    const h = Math.max(4, Math.round((x.clicks / maxD) * 110))
    const dateShort = x.date.slice(5)  // MM-DD
    return \`<div class="bar-col">
      <div class="dv">\${x.clicks || ''}</div>
      <div class="b" style="height:\${h}px" title="\${x.date}: \${x.clicks}次"></div>
      <div class="dl">\${dateShort}</div>
    </div>\`
  }).join('')
}

load()
setInterval(load, 30000)  // 30秒自动刷新
</script>
</body>
</html>`)
})

module.exports = router
