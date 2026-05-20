// API 基础配置
const ENV = 'development'

const CONFIG = {
  production: {
    baseUrl: 'https://api.cyberpm.tech',
    aliyunOssBucket: 'dada-photos',
    aliyunOssRegion: 'oss-cn-hangzhou',
  },
  development: {
    baseUrl: 'http://172.21.242.182:3000',
    aliyunOssBucket: 'dada-photos-dev',
    aliyunOssRegion: 'oss-cn-hangzhou',
  }
}

const currentConfig = CONFIG[ENV]

// API 路径
const API = {
  // 完整分析（VL即时返回，图片按需生成）
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

// 服务器连通性缓存（避免重复探测）
let _serverReachable = null    // true/false/null(未知)
let _serverCheckTime = 0
const SERVER_CHECK_TTL = 30000  // 30秒内不重复检测

/**
 * 快速检测服务器是否可达（3秒超时HEAD请求）
 */
function checkServerReachable() {
  const now = Date.now()
  if (_serverReachable !== null && (now - _serverCheckTime) < SERVER_CHECK_TTL) {
    return Promise.resolve(_serverReachable)
  }
  return new Promise(resolve => {
    wx.request({
      url: currentConfig.baseUrl + '/api/health',
      method: 'HEAD',
      timeout: 3000,
      success() {
        _serverReachable = true
        _serverCheckTime = Date.now()
        resolve(true)
      },
      fail() {
        _serverReachable = false
        _serverCheckTime = Date.now()
        resolve(false)
      }
    })
  })
}

/**
 * 标记服务器不可达（当请求失败时调用，避免后续重复尝试）
 */
function markServerUnreachable() {
  _serverReachable = false
  _serverCheckTime = Date.now()
}

// 登录重试锁
let _loginPromise = null

/**
 * 确保已登录（自动静默登录）
 */
async function ensureLogin() {
  const token = wx.getStorageSync('token')
  if (token) return token

  if (_loginPromise) return _loginPromise

  _loginPromise = wxLogin().finally(() => {
    _loginPromise = null
  })
  return _loginPromise
}

// HTTP 请求封装（带401自动重登）
function request(url, options = {}) {
  return new Promise((resolve, reject) => {
    const token = wx.getStorageSync('token')
    wx.request({
      url: currentConfig.baseUrl + url,
      method: options.method || 'GET',
      data: options.data || {},
      header: {
        'Content-Type': 'application/json',
        'Authorization': token ? `Bearer ${token}` : '',
        ...options.header
      },
      timeout: options.timeout || 300000,
      success(res) {
        if (res.statusCode === 200) {
          resolve(res.data)
        } else if (res.statusCode === 401) {
          // Token 过期，自动重新登录后重试一次
          wx.removeStorageSync('token')
          if (options._retried) {
            // 已经重试过，不再重登
            reject({ code: 401, message: '请重新登录' })
          } else {
            ensureLogin().then(() => {
              request(url, { ...options, _retried: true }).then(resolve).catch(reject)
            }).catch(() => {
              reject({ code: 401, message: '登录失败，请重试' })
            })
          }
        } else {
          reject(res.data || { code: res.statusCode, message: `请求失败(${res.statusCode})` })
        }
      },
      fail(err) {
        console.error('[API] 请求失败:', url, err.errMsg)
        // 网络层失败时标记服务器不可达
        markServerUnreachable()
        reject({ code: -1, message: err.errMsg || '网络异常，请稍后重试' })
      }
    })
  })
}

// 上传图片（开发模式：直传服务器）
async function uploadImage(filePath) {
  // 先检测服务器是否可达，不可达直接跳过
  const reachable = await checkServerReachable()
  if (!reachable) {
    throw new Error('服务器不可达，跳过上传')
  }
  if (ENV === 'development') {
    try {
      return await uploadFileToServer(filePath)
    } catch (e) {
      console.warn('[API] wx.uploadFile 失败，降级为 base64:', e.message)
      return await uploadImageViaBase64(filePath)
    }
  } else {
    try {
      return await uploadToOss(filePath)
    } catch (e) {
      console.warn('[API] OSS 上传失败，降级:', e.message)
      try {
        return await uploadImageViaBase64(filePath)
      } catch (e2) {
        throw new Error('图片上传失败，请检查网络后重试')
      }
    }
  }
}

function uploadFileToServer(filePath) {
  return new Promise((resolve, reject) => {
    // 先检查文件是否存在
    try {
      wx.getFileSystemManager().accessSync(filePath)
    } catch (e) {
      reject(new Error('图片文件不存在或已被清理'))
      return
    }
    wx.uploadFile({
      url: currentConfig.baseUrl + '/api/upload',
      filePath,
      name: 'image',
      timeout: 60000,
      success(res) {
        if (res.statusCode === 200) {
          try {
            const data = JSON.parse(res.data)
            if (data.code === 0) resolve(data.data.url)
            else reject(new Error(data.message || '上传失败'))
          } catch (e) {
            reject(new Error('上传响应解析失败'))
          }
        } else {
          reject(new Error(`上传失败(${res.statusCode})`))
        }
      },
      fail(err) {
        markServerUnreachable()
        reject(new Error(err.errMsg || '上传失败'))
      }
    })
  })
}

function imageToBase64(filePath, maxKb = 500) {
  return new Promise((resolve, reject) => {
    wx.compressImage({
      src: filePath,
      quality: 80,
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
      const sizeKb = Math.ceil(base64Data.length * 0.75 / 1024)
      if (sizeKb > maxKb) {
        resolve('')
      } else {
        resolve(`data:${mime};base64,${base64Data}`)
      }
    },
    fail(err) {
      reject(new Error(err.errMsg || '读取图片失败'))
    }
  })
}

async function uploadImageViaBase64(filePath) {
  const imageBase64 = await imageToBase64(filePath)
  const ext = filePath.toLowerCase().match(/\.(jpg|jpeg|png|webp)$/)
  const result = await request('/api/upload-base64', {
    method: 'POST',
    data: { imageBase64, ext: ext ? '.' + ext[1] : '.jpg' },
    timeout: 30000
  })
  if (result.code === 0) return result.data.url
  throw new Error(result.message || 'base64上传失败')
}

function uploadToOss(filePath, retryCount = 0) {
  const MAX_RETRIES = 2
  return new Promise(async (resolve, reject) => {
    try {
      const tokenData = await request(API.getOssToken)
      const { accessKeyId, accessKeySecret, securityToken, host, dir } = tokenData.data
      const ext = filePath.split('.').pop()
      const fileName = `${dir}${Date.now()}_${Math.random().toString(36).substr(2, 8)}.${ext}`
      const ossUrl = `${host}/${fileName}`
      wx.uploadFile({
        url: host, filePath, name: 'file',
        formData: {
          key: fileName, policy: tokenData.data.policy,
          OSSAccessKeyId: accessKeyId, signature: tokenData.data.signature,
          'x-oss-security-token': securityToken, success_action_status: '200'
        },
        timeout: 30000,
        success(res) { res.statusCode === 200 ? resolve(ossUrl) : reject(new Error(`OSS上传失败(${res.statusCode})`)) },
        fail(err) { reject(new Error(err.errMsg || 'OSS上传失败')) }
      })
    } catch (err) { reject(err) }
  }).catch(err => {
    if (retryCount < MAX_RETRIES) {
      return new Promise(resolve => setTimeout(resolve, 1000 * (retryCount + 1)))
        .then(() => uploadToOss(filePath, retryCount + 1))
    }
    throw err
  })
}

// 微信登录
function wxLogin() {
  return new Promise((resolve, reject) => {
    wx.login({
      success(res) {
        if (res.code) {
          // 登录接口不带 token
          wx.request({
            url: currentConfig.baseUrl + API.login,
            method: 'POST',
            data: { code: res.code },
            header: { 'Content-Type': 'application/json' },
            timeout: 10000,
            success(loginRes) {
              if (loginRes.statusCode === 200 && loginRes.data.code === 0) {
                wx.setStorageSync('token', loginRes.data.data.token)
                wx.setStorageSync('userInfo', loginRes.data.data.userInfo)
                resolve(loginRes.data.data)
              } else {
                reject({ code: -1, message: loginRes.data?.message || '登录失败' })
              }
            },
            fail(err) {
              reject({ code: -1, message: err.errMsg || '登录请求失败' })
            }
          })
        } else { reject(new Error('微信登录失败')) }
      },
      fail: reject
    })
  })
}

// 运行诊断（封装完整流程）
async function runDiagnosis(imageUrl, imageBase64, photoType, gender, options = {}) {
  return request(API.fullAnalysis, {
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
    timeout: 300000
  })
}

module.exports = {
  CONFIG: currentConfig,
  API,
  request,
  uploadImage,
  uploadImageViaBase64,
  imageToBase64,
  uploadToOss,
  wxLogin,
  ensureLogin,
  runDiagnosis,
  checkServerReachable,
  markServerUnreachable
}
