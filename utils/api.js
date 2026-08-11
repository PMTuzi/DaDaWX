// API 基础配置 - 使用云托管 callContainer，无需配置服务器域名
const currentConfig = {
  envId: 'dada0810-d6g6aowp1aeffc3ce',
  serviceName: 'dada-server',
}

// 云托管公网地址（用于大请求 fallback，绕过 callContainer 1MB 限制）
// 从云托管控制台「基本信息」或「访问设置」获取实际地址
const CLOUDRUN_BASE_URL = 'https://dada-server-294520-7-1435078506.sh.run.tcloudbase.com'

// callContainer 请求体大小阈值（字节），超过此值改用 HTTP 直连
const LARGE_REQUEST_THRESHOLD = 512 * 1024  // 512KB 留余量

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
  clearUserData: '/api/user/data',
  // 穿搭咨询
  analyzeClothingVision: '/api/consult/analyze-clothing-vision',
  generateSingleConsult: '/api/consult/generate-single-consult',
  generateCompareConsult: '/api/consult/generate-compare-consult',
  consultTask: '/api/consult/task',  // 查询咨询任务状态
  detectCategory: '/api/consult/detect-category',
  getConsultList: '/api/consult/list',
  // OSS 直传凭证
  ossToken: '/api/oss/token',
  // 埋点
  track: '/api/track',
  trackStats: '/api/track/stats',
}

// 服务器连通性缓存
let _serverReachable = null
let _serverCheckTime = 0
const SERVER_CHECK_TTL = 30000

/**
 * 检测云托管服务是否可达
 * callContainer 与 HTTP 直连任一通即视为可达 —— callContainer 侧的 102002
 * 是网关系统错误，此时直连通常仍然正常，不能据此判定服务不可用。
 */
function checkServerReachable() {
  const now = Date.now()
  if (_serverReachable !== null && (now - _serverCheckTime) < SERVER_CHECK_TTL) {
    return Promise.resolve(_serverReachable)
  }
  // 探活不做重试：失败就直接走直连兜底，避免 800+1600ms 的无效等待
  const probe = { path: '/api/health', method: 'GET', timeout: 8000, _retry: 0 }
  return callContainer(probe)
    .catch(() => httpRequestDirect({ ...probe }))
    .then(() => {
      _serverReachable = true
      _serverCheckTime = Date.now()
      return true
    })
    .catch(() => {
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

  // 调试日志：确认真机环境ID和请求体大小
  if (attempt === 0 && !options.path.includes('/health')) {
    const bodySize = options.data ? JSON.stringify(options.data).length : 0
    console.log('[API] callContainer env=', currentConfig.envId, 'service=', currentConfig.serviceName, 'path=', options.path, 'bodySize=', bodySize, 'B')
  }

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
        // 命中冷启动/网关层错误才重试。注意不能用裸 `fail` 匹配 ——
        // 微信所有 errMsg 都形如 "cloud.callContainer:fail ..."，会导致任何错误都重试 3 次。
        const retriable = /102002|system\s*(error|fail)|-606001|timeout/i.test(msg)
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
 * HTTP 直连云托管（绕过 callContainer 1MB 限制）
 * 需要在小程序后台配置服务器域名白名单
 */
function httpRequestDirect(options) {
  const maxRetry = options._retry != null ? options._retry : 2
  const attempt = options._attempt || 0
  const url = CLOUDRUN_BASE_URL + (options.path || options.url)

  console.log('[API] httpRequestDirect url=', url, 'method=', options.method)

  return new Promise((resolve, reject) => {
    wx.request({
      url,
      method: options.method || 'GET',
      data: options.data || {},
      header: options.header || {},
      timeout: options.timeout || 300000,
      dataType: options.dataType || 'json',
      success(res) {
        // 统一返回格式与 callContainer 一致 { data, statusCode, header }
        resolve({
          data: res.data,
          statusCode: res.statusCode,
          header: res.header
        })
      },
      fail(err) {
        console.error('[API] httpRequestDirect 失败:', url, err.errMsg, 'attempt=', attempt)
        if (attempt < maxRetry) {
          const delay = 800 * (attempt + 1)
          setTimeout(() => {
            httpRequestDirect({ ...options, _attempt: attempt + 1, _retry: maxRetry })
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
 * 大请求自动切换到 HTTP 直连（绕过 callContainer 1MB 限制）
 * callContainer 102002 时自动 fallback 到 HTTP 直连
 */
function request(url, options = {}) {
  const token = wx.getStorageSync('token')
  const header = {
    'Content-Type': 'application/json',
    ...(options.header || {}),
  }
  if (token) header['Authorization'] = `Bearer ${token}`

  // 判断请求体大小，超过阈值使用 HTTP 直连
  const bodySize = options.data ? JSON.stringify(options.data).length : 0
  const useDirectHttp = bodySize > LARGE_REQUEST_THRESHOLD || options._useDirectHttp

  if (useDirectHttp) {
    console.log('[API] 使用 HTTP 直连模式 bodySize=', bodySize, 'B')
  }

  const requester = useDirectHttp ? httpRequestDirect : callContainer

  return requester({
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
      const errMsg = (err && (err.errMsg || err.message)) || ''
      // 102002 错误自动 fallback 到 HTTP 直连（如果还没试过）
      if (/102002/i.test(errMsg) && !useDirectHttp && !options._retried) {
        console.log('[API] callContainer 102002，自动 fallback 到 HTTP 直连')
        return request(url, { ...options, _useDirectHttp: true })
      }
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
// 主路径：offscreen canvas（无 2MB 限制）
// 失败直接回退原图（不再调用 wx.compressImage，因为 >2MB 必报 80051）
async function compressImageForUpload(filePath) {
  if (!filePath || /^https?:\/\//.test(filePath) || /^cloud:\/\//.test(filePath)) {
    return filePath
  }
  const MAX_SIDE = 1024
  const QUALITY = 80
  const t0 = Date.now()

  let w = 0, h = 0
  let canvasSrc = filePath
  try {
    const info = await new Promise((resolve, reject) => {
      wx.getImageInfo({ src: filePath, success: resolve, fail: reject })
    })
    w = info.width || 0
    h = info.height || 0
    // info.path 通常是 canvas 可直接加载的本地路径
    if (info.path) canvasSrc = info.path
  } catch (e) {
    console.warn('[compress] getImageInfo 失败:', e && e.errMsg)
  }

  if (wx.createOffscreenCanvas) {
    try {
      const out = await compressViaCanvas(canvasSrc, w, h, MAX_SIDE, QUALITY)
      console.log(`[compress] canvas ${w}x${h} -> ${MAX_SIDE} q${QUALITY} ${Date.now()-t0}ms`)
      return out
    } catch (e) {
      console.warn('[compress] canvas 失败，回退原图直传:', e && (e.errMsg || e.message))
      return filePath
    }
  }

  // 极老基础库（无 createOffscreenCanvas）：尝试 wx.compressImage（仅小图可用）
  try {
    const r = await new Promise((resolve, reject) => {
      wx.compressImage({ src: filePath, quality: QUALITY, success: resolve, fail: reject })
    })
    return (r && r.tempFilePath) || filePath
  } catch (e) {
    console.warn('[compress] compressImage 失败，回退原图:', e && e.errMsg)
    return filePath
  }
}

// 用 offscreen canvas 压缩：绕开 wx.compressImage 的 2MB 源大小限制
function compressViaCanvas(src, w, h, maxSide, quality) {
  return new Promise((resolve, reject) => {
    if (!wx.createOffscreenCanvas) {
      reject(new Error('createOffscreenCanvas not supported'))
      return
    }
    const longSide = Math.max(w, h) || maxSide
    const ratio = longSide > maxSide ? (maxSide / longSide) : 1
    const tw = Math.max(1, Math.round((w || maxSide) * ratio))
    const th = Math.max(1, Math.round((h || maxSide) * ratio))
    const canvas = wx.createOffscreenCanvas({ type: '2d', width: tw, height: th })
    const ctx = canvas.getContext('2d')
    const img = canvas.createImage()
    img.onload = () => {
      ctx.drawImage(img, 0, 0, tw, th)
      wx.canvasToTempFilePath({
        canvas,
        fileType: 'jpg',
        quality: (quality || 80) / 100,
        success: (r) => resolve(r.tempFilePath),
        fail: reject
      })
    }
    img.onerror = (e) => reject(e || new Error('image load fail'))
    img.src = src
  })
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
