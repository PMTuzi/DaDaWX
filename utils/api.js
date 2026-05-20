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
  // 图片上传
  upload: '/api/upload',
  uploadBase64: '/api/upload-base64',
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
        console.error('[API] callContainer 失败:', options.path, err.errMsg || err.message)
        reject(err)
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

// 上传图片（云存储直传，无需域名白名单）
async function uploadImage(filePath) {
  try {
    return await uploadToCloudStorage(filePath)
  } catch (e) {
    console.warn('[API] 云存储上传失败，降级为 base64:', e.message)
    try {
      return await uploadImageViaBase64(filePath)
    } catch (e2) {
      throw new Error('图片上传失败: ' + (e2.message || '未知错误'))
    }
  }
}

// 通过云存储直传（不需要域名白名单）
function uploadToCloudStorage(filePath) {
  return new Promise((resolve, reject) => {
    try {
      wx.getFileSystemManager().accessSync(filePath)
    } catch (e) {
      reject(new Error('图片文件不存在或已被清理'))
      return
    }
    const ext = filePath.toLowerCase().match(/\.(jpg|jpeg|png|webp)$/)
    const extStr = ext ? ext[1] : 'jpg'
    const cloudPath = `uploads/${Date.now()}_${Math.random().toString(36).substr(2, 8)}.${extStr}`
    wx.cloud.uploadFile({
      cloudPath,
      filePath,
      success(res) {
        if (res.fileID) {
          resolve(res.fileID) // cloud:// URL，服务器可解析
        } else {
          reject(new Error('云存储上传未返回 fileID'))
        }
      },
      fail(err) {
        reject(new Error(err.errMsg || '云存储上传失败'))
      }
    })
  })
}

function imageToBase64(filePath, maxKb = 3000) {
  return new Promise((resolve, reject) => {
    wx.compressImage({
      src: filePath,
      quality: 60,
      success: (compressRes) => {
        _readAndCheckBase64(compressRes.tempFilePath, maxKb, resolve, reject)
      },
      fail: () => {
        _readAndCheckBase64(filePath, maxKb, resolve, reject)
      }
    })
  })
}

function _readAndCheckBase64(filePath, maxKb, resolve, reject) {
  wx.getFileSystemManager().readFile({
    filePath,
    encoding: 'base64',
    success(res) {
      const ext = filePath.toLowerCase().match(/\.(jpg|jpeg|png|webp)$/)
      const mimeMap = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' }
      const mime = ext ? (mimeMap[ext[1]] || 'image/jpeg') : 'image/jpeg'
      const base64Data = res.data
      resolve(`data:${mime};base64,${base64Data}`)
    },
    fail(err) {
      reject(new Error(err.errMsg || '读取图片失败'))
    }
  })
}

async function uploadImageViaBase64(filePath) {
  const imageBase64 = await imageToBase64(filePath)
  if (!imageBase64) {
    throw new Error('图片base64转换失败')
  }
  const ext = filePath.toLowerCase().match(/\.(jpg|jpeg|png|webp)$/)
  try {
    const result = await callContainer({
      path: '/api/upload-base64',
      method: 'POST',
      data: { imageBase64, ext: ext ? '.' + ext[1] : '.jpg' },
      header: { 'Content-Type': 'application/json' },
      timeout: 60000
    })
    const data = result.data
    if (result.statusCode === 200 && data && data.code === 0) return data.data.url
    throw new Error((data && data.message) || 'base64上传失败')
  } catch (err) {
    // 不标记服务器不可达，避免影响后续 API 调用
    throw new Error(err.errMsg || err.message || 'base64上传失败')
  }
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
async function runDiagnosis(imageUrl, imageBase64, photoType, gender, options = {}) {
  // 确保已登录
  const token = await ensureLogin()

  // 1. 提交分析任务
  const startResult = await request(API.startAnalysis, {
    method: 'POST',
    data: {
      imageUrl,
      imageBase64,
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
  uploadImageViaBase64,
  imageToBase64,
  wxLogin,
  ensureLogin,
  runDiagnosis,
  checkServerReachable,
  markServerUnreachable
}
