// 形象诊断 / 穿搭决策 全局任务进度条 · 共享逻辑
// 在 Page 内通过 mixinTaskBars(this) 即可获得 startTaskBars / stopTaskBars / onTapTaskBar
const taskState = require('./task-state')

const ROUTE = {
  diagnose: {
    analyzingPage: '/pages/diagnose/diagnose?view=1',
    failTitle: '诊断失败'
  },
  consult: {
    analyzingPage: '/pages/consult-analyzing/consult-analyzing?view=1',
    failTitle: '决策失败'
  }
}

function mixinTaskBars(page, opts = {}) {
  const onDone = opts.onDone || (() => {})

  page.startTaskBars = function () {
    page.stopTaskBars()
    const tick = () => {
      const d = taskState.get('diagnose')
      const c = taskState.get('consult')
      const patch = {}
      if (d !== page.data.diagnoseTask) patch.diagnoseTask = d
      if (c !== page.data.consultTask) patch.consultTask = c
      if (Object.keys(patch).length) page.setData(patch)

      ;['diagnose', 'consult'].forEach(type => {
        const t = type === 'diagnose' ? d : c
        const timerKey = '_doneClearTimer_' + type
        if (t && t.status === 'done' && !page[timerKey]) {
          try { onDone(type, t) } catch (e) {}
          page[timerKey] = setTimeout(() => {
            taskState.clear(type)
            page.setData({ [type + 'Task']: null })
            page[timerKey] = null
          }, 30000)
        }
      })
    }
    tick()
    page._taskBarsTimer = setInterval(tick, 600)
  }

  page.stopTaskBars = function () {
    if (page._taskBarsTimer) { clearInterval(page._taskBarsTimer); page._taskBarsTimer = null }
    if (page._doneClearTimer_diagnose) { clearTimeout(page._doneClearTimer_diagnose); page._doneClearTimer_diagnose = null }
    if (page._doneClearTimer_consult) { clearTimeout(page._doneClearTimer_consult); page._doneClearTimer_consult = null }
  }

  page.onTapTaskBar = page.onTapTaskBar || function (e) {
    const type = e.currentTarget.dataset.type
    if (!type) return
    const t = taskState.get(type)
    if (!t) return
    const conf = ROUTE[type]
    if (t.status === 'done' && t.resultUrl) {
      taskState.clear(type)
      page.setData({ [type + 'Task']: null })
      wx.navigateTo({
        url: t.resultUrl,
        fail() {
          if (type === 'diagnose') wx.switchTab({ url: '/pages/index/index' })
          else wx.switchTab({ url: '/pages/outfit/outfit' })
        }
      })
    } else if (t.status === 'error') {
      wx.showModal({ title: conf.failTitle, content: t.errorMsg || '请重新尝试', confirmText: '关闭', showCancel: false })
      taskState.clear(type)
      page.setData({ [type + 'Task']: null })
    } else if (t.status === 'running') {
      wx.navigateTo({ url: conf.analyzingPage })
    }
  }
}

module.exports = { mixinTaskBars }
