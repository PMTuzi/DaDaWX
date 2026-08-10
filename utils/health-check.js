// utils/health-check.js
// 真机网络自检：分别测试「云托管 callContainer」和「HTTP 直连」两条链路到 /api/health，
// 用于快速定位真机接口不通的原因（是云托管网关问题，还是域名白名单/直连问题）。
const ENV_ID = 'dada0810-d6g6aowp1aeffc3ce'
const SERVICE = 'dada-server'
// 与 utils/api.js 的 CLOUDRUN_BASE_URL 保持一致
const CLOUDRUN_BASE_URL = 'https://dada-server-294520-7-1435078506.sh.run.tcloudbase.com'

// 链路一：云托管 callContainer（无需配置合法域名）
function testCallContainer() {
  const t = Date.now()
  return new Promise((resolve) => {
    try {
      wx.cloud.callContainer({
        config: { env: ENV_ID },
        path: '/api/health',
        method: 'GET',
        service: SERVICE,
        timeout: 8000,
        success(res) {
          resolve({ ok: res.statusCode === 200, ms: Date.now() - t, detail: 'HTTP ' + res.statusCode })
        },
        fail(err) {
          resolve({ ok: false, ms: Date.now() - t, detail: (err && err.errMsg) || '调用失败' })
        }
      })
    } catch (e) {
      resolve({ ok: false, ms: Date.now() - t, detail: (e && e.message) || 'wx.cloud 未初始化' })
    }
  })
}

// 链路二：HTTP 直连公网地址（真机需把该域名加入 request 合法域名）
function testHttpDirect() {
  const t = Date.now()
  return new Promise((resolve) => {
    wx.request({
      url: CLOUDRUN_BASE_URL + '/api/health',
      method: 'GET',
      timeout: 8000,
      success(res) {
        resolve({ ok: res.statusCode === 200, ms: Date.now() - t, detail: 'HTTP ' + res.statusCode })
      },
      fail(err) {
        resolve({ ok: false, ms: Date.now() - t, detail: (err && err.errMsg) || '请求失败' })
      }
    })
  })
}

// 运行自检并弹窗展示结果（真机可直接看）
async function runHealthCheck() {
  wx.showLoading({ title: '网络自检中…', mask: true })
  const [cc, direct] = await Promise.all([testCallContainer(), testHttpDirect()])
  wx.hideLoading()

  console.log('[健康自检] callContainer=', cc, ' httpDirect=', direct)

  const content =
    `云托管 callContainer\n${cc.ok ? '✅ 通' : '❌ 不通'} · ${cc.ms}ms\n${cc.detail}\n\n` +
    `HTTP 直连\n${direct.ok ? '✅ 通' : '❌ 不通'} · ${direct.ms}ms\n${direct.detail}`

  wx.showModal({
    title: '网络自检结果',
    content,
    showCancel: false,
    confirmText: '知道了'
  })
  return { cc, direct }
}

module.exports = { runHealthCheck }
