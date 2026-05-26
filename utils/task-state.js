// 全局后台任务状态：诊断 / 穿搭决策 各占一个槽位
// 用户离开 loading 页后，分析仍在 Promise 中继续，结果通过 storage 写入；
// 此模块向首页 / 穿搭 Tab 暴露当前进度，用于顶部小进度条。

function ensure() {
  const app = getApp()
  if (!app.globalData) app.globalData = {}
  if (!app.globalData.__pendingTask) {
    app.globalData.__pendingTask = { diagnose: null, consult: null }
  }
  return app.globalData.__pendingTask
}

// patch === null  →  清空该槽位
function set(type, patch) {
  const s = ensure()
  if (patch === null) {
    s[type] = null
    return
  }
  s[type] = Object.assign({}, s[type] || {}, patch, { updateTime: Date.now() })
}

function get(type) {
  return ensure()[type]
}

function clear(type) {
  set(type, null)
}

module.exports = { set, get, clear }
