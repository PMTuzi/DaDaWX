// API 基础配置 - 使用云托管 callContainer，无需配置服务器域名
const currentConfig = {
  envId: 'dada-d9gw8x8fb426caba5',
  serviceName: 'dada-server',
}

// API 路径
const API = {
  // 异步分析（推荐，不超时）
  startAnalysis: '/api/ai/start-analysis',
  // 同步分析（旧接口，可能超时）
  fullAnalysis: '/api/ai/full-analysis',
  // 报告
  getReportList: '/api/report/list',
  getReportLatest: '/api/report/latest',
  saveReport: '/api/report/save',
  deleteReport: '/api/report/:id',
  // 收藏
  toggleFavorite: '/api/favorite/toggle',
  getFavorites: '/api/favorite/list',
  // 用户
  login: '/api/user/login',
  getProfile: '/api/user/profile',
  updateProfile: '/api/user/profile',
  // 穿搭咨询
  analyzeClothingVision: '/api/consult/analyze-clothing-vision',
  generateSingleConsult: '/api/consult/generate-single-consult',
  generateCompareConsult: '/api/consult/generate-compare-consult',
  detectCategory: '/api/consult/detect-category',
  getConsultList: '/api/consult/list',
  // OSS 直传凭证
  ossToken: '/api/oss/token',
}

// 服务器连通性缓存
let _serverReachable = null
let _serverCheckTime = 0
const SERVER_CHECK_TTL = 30000

/**
 * 检测云托管服务是否可达
 */
function checkServerReachable() {
  const now = Date.now()
  if (_serverReachable !== null && (now - _serverCheckTime) < SERVER_CHECK_TTL) {
    return Promise.resolve(_serverReachable)
  }
  return callContainer({
    path: '/api/health',
    method: 'GET',
  }).then(() => {
    _serverReachable = true
    _serverCheckTime = Date.now()
    return true
  }).catch(() => {
    _serverReachable = false
    _serverCheckTime = Date.now()
    return false
  })
}

function markServerUnreachable() {
  _serverReachable = false
  _serverCheckTime = Date.now()
}

// 登录重试锁
let _loginPromise = null

async function ensureLogin() {
  const token = wx.getStorageSync('token')
  if (token) return token

  if (_loginPromise) return _loginPromise

  _loginPromise = wxLogin().finally(() => {
    _loginPromise = null
  })
  return _loginPromise
}

/**
 * 调用云托管服务（核心请求方法）
 * 使用 wx.cloud.callContainer，无需配置服务器域名
 */
function callContainer(options) {
  // 冷启动 / 102002 / system fail 自动重试：最多 3 次，递增等待
  const maxRetry = options._retry != null ? options._retry : 2
  const attempt = options._attempt || 0

  return new Promise((resolve, reject) => {
    wx.cloud.callContainer({
      config: { env: currentConfig.envId },
      path: options.path || options.url,
      method: options.method || 'GET',
      service: currentConfig.serviceName,
      data: options.data || {},
      header: options.header || {},
      timeout: options.timeout || 300000,
      dataType: options.dataType || 'json',
      success(res) {
        resolve(res)
      },
      fail(err) {
        const msg = (err && (err.errMsg || err.message)) || ''
        // 命中冷启动/网络层错误：102002 / system fail / -606001 / timeout / fail
        const retriable = /102002|system\s*fail|-606001|timeout|fail/i.test(msg)
        console.error('[API] callContainer 失败:', options.path, msg, 'attempt=', attempt)
        if (retriable && attempt < maxRetry) {
          const delay = 800 * (attempt + 1)  // 800ms, 1600ms
          setTimeout(() => {
            callContainer({ ...options, _attempt: attempt + 1, _retry: maxRetry })
              .then(resolve, reject)
          }, delay)
        } else {
          reject(err)
        }
      }
    })
  })
}

/**
 * HTTP 请求封装（基于 callContainer，带401自动重登）
 */
function request(url, options = {}) {
  const token = wx.getStorageSync('token')
  const header = {
    'Content-Type': 'application/json',
    ...(options.header || {}),
  }
  if (token) header['Authorization'] = `Bearer ${token}`

  return callContainer({
    path: url,
    method: options.method || 'GET',
    data: options.data || {},
    header,
    timeout: options.timeout || 300000,
  }).then(res => {
    // callContainer 返回 { data, statusCode, header }
    const data = res.data
    const statusCode = res.statusCode

    if (statusCode === 200) {
      return data
    } else if (statusCode === 401) {
      wx.removeStorageSync('token')
      if (options._retried) {
        return Promise.reject({ code: 401, message: '请重新登录' })
      }
      return ensureLogin().then(() => {
        return request(url, { ...options, _retried: true })
      }).catch(() => {
        return Promise.reject({ code: 401, message: '登录失败，请重试' })
      })
    } else {
      return Promise.reject(data || { code: statusCode, message: `请求失败(${statusCode})` })
    }
  }).catch(err => {
    // callContainer 网络层失败
    if (err && err.statusCode === undefined) {
      markServerUnreachable()
      return Promise.reject({ code: -1, message: err.errMsg || err.message || '网络异常，请稍后重试' })
    }
    throw err
  })
}

// 上传图片：先压缩到长边 1024 + JPEG 80%，再 OSS 直传
async function uploadImage(filePath) {
  try {
    const compressed = await compressImageForUpload(filePath)
    return await uploadImageViaOSS(compressed)
  } catch (err) {
    _ossTokenCache = null  // 失败清缓存，下次重新取凭证
    throw err
  }
}

// 压缩图片：长边 ≤ 1024px，JPEG quality 80
// 失败时回退原图，保证主流程不被卡住
async function compressImageForUpload(filePath) {
  if (!filePath || /^https?:\/\//.test(filePath) || /^cloud:\/\//.test(filePath)) {
    return filePath
  }
  const MAX_SIDE = 1024
  const QUALITY = 80
  const t0 = Date.now()
  try {
    const info = await new Promise((resolve, reject) => {
      wx.getImageInfo({ src: filePath, success: resolve, fail: reject })
    })
    const w = info.width || 0
    const h = info.height || 0
    const longSide = Math.max(w, h)

    // 已小于阈值：仅做 JPEG 质量压缩
    if (!longSide || longSide <= MAX_SIDE) {
      try {
        const r = await new Promise((resolve, reject) => {
          wx.compressImage({ src: filePath, quality: QUALITY, success: resolve, fail: reject })
        })
        const out = r && r.tempFilePath ? r.tempFilePath : filePath
        console.log(`[compress] keep size ${w}x${h} q${QUALITY} ${Date.now()-t0}ms`)
        return out
      } catch (e) {
        return filePath
      }
    }

    // 计算目标尺寸（保持长宽比）
    const ratio = MAX_SIDE / longSide
    const targetW = Math.round(w * ratio)
    const targetH = Math.round(h * ratio)

    // 优先用 compressImage 的 compressedWidth/Height（基础库 2.26.0+）
    try {
      const r = await new Promise((resolve, reject) => {
        wx.compressImage({
          src: filePath,
          quality: QUALITY,
          compressedWidth: targetW,
          compressHeight: targetH,
          success: resolve,
          fail: reject
        })
      })
      if (r && r.tempFilePath) {
        console.log(`[compress] ${w}x${h} -> ${targetW}x${targetH} q${QUALITY} ${Date.now()-t0}ms`)
        return r.tempFilePath
      }
    } catch (e) {
      console.warn('[compress] 尺寸压缩失败，仅做质量压缩:', e && e.errMsg)
    }

    // 回退：仅做 JPEG 质量压缩（不缩放）
    try {
      const r = await new Promise((resolve, reject) => {
        wx.compressImage({ src: filePath, quality: QUALITY, success: resolve, fail: reject })
      })
      return (r && r.tempFilePath) || filePath
    } catch (e) {
      return filePath
    }
  } catch (e) {
    console.warn('[compress] 跳过压缩:', e && e.errMsg)
    return filePath
  }
}

// OSS 缓存凭证
let _ossTokenCache = null  // { accessKeyId, host, policy, signature, dir, expire }

async function getOssToken() {
  const now = Math.floor(Date.now() / 1000)
  if (_ossTokenCache && _ossTokenCache.expire - now > 60) return _ossTokenCache
  const result = await callContainer({
    path: '/api/oss/token',
    method: 'GET',
    timeout: 10000
  })
  if (!(result.statusCode === 200 && result.data && result.data.code === 0)) {
    throw new Error((result.data && result.data.message) || '获取OSS凭证失败')
  }
  _ossTokenCache = result.data.data
  return _ossTokenCache
}

function genOssKey(filePath, dir) {
  const ext = (filePath.toLowerCase().match(/\.(jpg|jpeg|png|webp)$/) || ['', 'jpg'])[1]
  const ts = Date.now()
  const rand = Math.random().toString(36).slice(2, 10)
  return `${dir}${ts}_${rand}.${ext}`
}

// 直传 OSS：wx.uploadFile + PostObject
async function uploadImageViaOSS(filePath) {
  const tk = await getOssToken()
  const key = genOssKey(filePath, tk.dir)
  return new Promise((resolve, reject) => {
    wx.uploadFile({
      url: tk.host,
      filePath,
      name: 'file',
      formData: {
        key,
        OSSAccessKeyId: tk.accessKeyId,
        policy: tk.policy,
        signature: tk.signature,
        success_action_status: '200'
      },
      timeout: 60000,
      success(res) {
        if (res.statusCode === 200 || res.statusCode === 204) {
          resolve(`${tk.host}/${key}`)
        } else {
          reject(new Error(`OSS上传失败 status=${res.statusCode} ${(res.data || '').slice(0, 200)}`))
        }
      },
      fail(err) { reject(new Error(err.errMsg || 'OSS上传网络错误')) }
    })
  })
}

// 把小程序 tempFilePath 持久化到本地存储（跨 App 重启可用，约 10MB 配额）
// 用于解决云托管容器重启后服务器端图片丢失的问题：本机历史报告优先读本地图
function saveLocalPhoto(tempFilePath) {
  return new Promise((resolve) => {
    if (!tempFilePath) return resolve('')
    // 已经是持久化路径（wxfile://store_xxx 或 http://store/xxx）就直接返回
    if (/^(wxfile:\/\/store|http:\/\/store|http:\/\/usr|wxfile:\/\/usr)/.test(tempFilePath)) {
      return resolve(tempFilePath)
    }
    wx.saveFile({
      tempFilePath,
      success(res) { resolve(res.savedFilePath || tempFilePath) },
      fail(err) {
        console.warn('[API] saveFile 失败，回退临时路径:', err.errMsg)
        resolve(tempFilePath)
      }
    })
  })
}

// 轮询咨询任务（single/compare 异步模式，避开 callContainer 60s 网关超时）
function pollConsultTask(taskId, options = {}) {
  const maxWaitMs = options.maxWaitMs || 180000  // 3 分钟兜底
  const intervalMs = options.intervalMs || 2000
  const startedAt = Date.now()
  return new Promise((resolve, reject) => {
    const poll = () => {
      if (Date.now() - startedAt > maxWaitMs) {
        return reject(new Error('分析超时，请稍后重试'))
      }
      request(`/api/consult/task/${taskId}`, { method: 'GET', timeout: 10000 }).then(data => {
        if (!data || data.code !== 0) {
          // 接口异常，继续轮询，直到超时
          return setTimeout(poll, intervalMs)
        }
        const t = data.data
        if (t.status === 'done') return resolve(t.result)
        if (t.status === 'failed') return reject(new Error(t.error || '分析失败'))
        setTimeout(poll, intervalMs)
      }).catch(() => {
        // 网络抖动，继续轮询
        setTimeout(poll, intervalMs)
      })
    }
    setTimeout(poll, 1500)
  })
}

// 微信登录
function wxLogin() {
  return new Promise((resolve, reject) => {
    wx.login({
      success(res) {
        if (res.code) {
          request(API.login, {
            method: 'POST',
            data: { code: res.code },
            timeout: 10000,
            _skipAuth: true
          }).then(data => {
            if (data.code === 0) {
              wx.setStorageSync('token', data.data.token)
              wx.setStorageSync('userInfo', data.data.userInfo)
              resolve(data.data)
            } else {
              reject({ code: -1, message: data.message || '登录失败' })
            }
          }).catch(err => {
            reject({ code: -1, message: err.message || '登录请求失败' })
          })
        } else { reject(new Error('微信登录失败')) }
      },
      fail: reject
    })
  })
}

// 运行诊断（异步任务模式，解决 callContainer 超时问题）
async function runDiagnosis(imageUrl, photoType, gender, options = {}) {
  // 确保已登录
  const token = await ensureLogin()

  // 1. 提交分析任务
  const startResult = await request(API.startAnalysis, {
    method: 'POST',
    data: {
      imageUrl,
      photoType,
      gender,
      age: options.age,
      height: options.height,
      weight: options.weight,
      photoUrl: options.photoUrl || imageUrl
    },
    timeout: 15000
  })

  if (!startResult || startResult.code !== 0 || !startResult.data || !startResult.data.taskId) {
    throw new Error(startResult?.message || '提交分析任务失败')
  }

  const taskId = startResult.data.taskId

  // 2. 轮询任务状态
  return pollTaskResult(taskId, options.onProgress)
}

// 轮询任务结果
function pollTaskResult(taskId, onProgress) {
  return new Promise((resolve, reject) => {
    const poll = () => {
      request(`/api/ai/task/${taskId}`, {
        method: 'GET',
        timeout: 10000
      }).then(data => {
        if (!data || data.code !== 0) {
          reject(new Error((data && data.message) || '查询任务状态失败'))
          return
        }

        const task = data.data
        // 回调进度
        if (onProgress && task.progress !== undefined) {
          try { onProgress(task.progress, task.step) } catch (e) {}
        }

        if (task.status === 'done') {
          resolve({ code: 0, data: task.result })
        } else if (task.status === 'failed') {
          reject(new Error(task.error || '分析失败'))
        } else {
          // 继续轮询，3秒后重试
          setTimeout(poll, 3000)
        }
      }).catch(err => {
        // 网络错误，3秒后重试
        setTimeout(poll, 3000)
      })
    }
    // 首次延迟2秒再开始轮询（给任务启动时间）
    setTimeout(poll, 2000)
  })
}

module.exports = {
  CONFIG: currentConfig,
  API,
  request,
  uploadImage,
  saveLocalPhoto,
  wxLogin,
  ensureLogin,
  runDiagnosis,
  pollConsultTask,
  checkServerReachable,
  markServerUnreachable
}
