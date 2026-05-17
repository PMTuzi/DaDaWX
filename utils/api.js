// API 基础配置
const ENV = 'development'

const CONFIG = {
  production: {
    baseUrl: 'https://api.dada.ai',
    aliyunOssBucket: 'dada-photos',
    aliyunOssRegion: 'oss-cn-hangzhou',
  },
  development: {
    baseUrl: 'http://192.168.110.85:3000',
    aliyunOssBucket: 'dada-photos-dev',
    aliyunOssRegion: 'oss-cn-hangzhou',
  }
}

const currentConfig = CONFIG[ENV]

// API 路径
const API = {
  // 获取 OSS 上传凭证
  getOssToken: '/api/oss/token',
  // AI 诊断（通义千问 VL 提取视觉特征）
  analyzeVision: '/api/ai/analyze-vision',
  // AI 生成报告（通义千问 4.0 结构化输出）
  generateReport: '/api/ai/generate-report',
  // 获取报告详情
  getReport: '/api/report/:id',
  // 报告列表
  getReportList: '/api/report/list',
  // 收藏/取消收藏
  toggleFavorite: '/api/favorite/toggle',
  // 收藏列表
  getFavorites: '/api/favorite/list',
  // 用户登录
  login: '/api/user/login',
  // 穿搭咨询
  analyzeClothingVision: '/api/consult/analyze-clothing-vision',
  generateSingleConsult: '/api/consult/generate-single-consult',
  generateCompareConsult: '/api/consult/generate-compare-consult',
  detectCategory: '/api/consult/detect-category',
}

// HTTP 请求封装
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
      timeout: options.timeout || 120000,
      success(res) {
        if (res.statusCode === 200) {
          resolve(res.data)
        } else if (res.statusCode === 401) {
          // token 过期，重新登录
          wx.removeStorageSync('token')
          reject({ code: 401, message: '请重新登录' })
        } else {
          reject(res.data || { code: res.statusCode, message: `请求失败(${res.statusCode})` })
        }
      },
      fail(err) {
        console.error('[API] 请求失败:', url, err.errMsg)
        reject({ code: -1, message: err.errMsg || '网络异常，请稍后重试' })
      }
    })
  })
}

// 上传图片（开发模式：直接上传到服务器；生产模式：上传到OSS）
// 统一策略：wx.uploadFile 优先 → 失败降级 base64 → 重试
async function uploadImage(filePath) {
  if (ENV === 'development') {
    // 开发模式：先尝试文件上传，失败则用 base64 上传
    try {
      return await uploadFileToServer(filePath)
    } catch (e) {
      console.warn('[API] wx.uploadFile 失败，降级为 base64 上传:', e.message)
      return await uploadImageViaBase64(filePath)
    }
  } else {
    // 生产模式：先上传到 OSS，失败则通过服务端 base64 中转
    try {
      return await uploadToOss(filePath)
    } catch (e) {
      console.warn('[API] OSS 上传失败，降级为服务端 base64 中转:', e.message)
      try {
        return await uploadImageViaBase64(filePath)
      } catch (e2) {
        console.error('[API] base64 中转也失败:', e2.message)
        throw new Error('图片上传失败，请检查网络后重试')
      }
    }
  }
}

// 开发模式：wx.uploadFile 直传服务器
function uploadFileToServer(filePath) {
  return new Promise((resolve, reject) => {
    wx.uploadFile({
      url: currentConfig.baseUrl + '/api/upload',
      filePath,
      name: 'image',
      timeout: 30000,
      success(res) {
        if (res.statusCode === 200) {
          try {
            const data = JSON.parse(res.data)
            if (data.code === 0) {
              resolve(data.data.url)
            } else {
              reject(new Error(data.message || '上传失败'))
            }
          } catch (e) {
            reject(new Error('上传响应解析失败'))
          }
        } else {
          reject(new Error(`上传失败(${res.statusCode})`))
        }
      },
      fail(err) {
        reject(new Error(err.errMsg || '上传失败'))
      }
    })
  })
}

// 将本地图片转为 base64
function imageToBase64(filePath) {
  return new Promise((resolve, reject) => {
    wx.getFileSystemManager().readFile({
      filePath,
      encoding: 'base64',
      success(res) {
        const ext = filePath.toLowerCase().match(/\.(jpg|jpeg|png|webp)$/)
        const mimeMap = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' }
        const mime = ext ? (mimeMap[ext[1]] || 'image/jpeg') : 'image/jpeg'
        resolve(`data:${mime};base64,${res.data}`)
      },
      fail(err) {
        reject(new Error(err.errMsg || '读取图片失败'))
      }
    })
  })
}

// 通过 base64 上传图片（更可靠，不受 wx.uploadFile 网络限制）
async function uploadImageViaBase64(filePath) {
  const imageBase64 = await imageToBase64(filePath)
  const ext = filePath.toLowerCase().match(/\.(jpg|jpeg|png|webp)$/)
  const result = await request('/api/upload-base64', {
    method: 'POST',
    data: { imageBase64, ext: ext ? '.' + ext[1] : '.jpg' },
    timeout: 30000
  })
  if (result.code === 0) {
    return result.data.url
  }
  throw new Error(result.message || 'base64上传失败')
}

// 上传图片到 OSS（生产模式，带重试）
function uploadToOss(filePath, retryCount = 0) {
  const MAX_RETRIES = 2
  return new Promise(async (resolve, reject) => {
    try {
      // 1. 获取 OSS 上传凭证
      const tokenData = await request(API.getOssToken)
      const { accessKeyId, accessKeySecret, securityToken, host, dir } = tokenData.data

      // 2. 生成唯一文件名
      const ext = filePath.split('.').pop()
      const fileName = `${dir}${Date.now()}_${Math.random().toString(36).substr(2, 8)}.${ext}`
      const ossUrl = `${host}/${fileName}`

      // 3. 上传到 OSS
      wx.uploadFile({
        url: host,
        filePath,
        name: 'file',
        formData: {
          key: fileName,
          policy: tokenData.data.policy,
          OSSAccessKeyId: accessKeyId,
          signature: tokenData.data.signature,
          'x-oss-security-token': securityToken,
          success_action_status: '200'
        },
        timeout: 30000,
        success(res) {
          if (res.statusCode === 200) {
            resolve(ossUrl)
          } else {
            reject(new Error(`OSS上传失败(${res.statusCode})`))
          }
        },
        fail(err) {
          reject(new Error(err.errMsg || 'OSS上传失败'))
        }
      })
    } catch (err) {
      reject(err)
    }
  }).catch(err => {
    // 重试逻辑
    if (retryCount < MAX_RETRIES) {
      console.warn(`[API] OSS 上传第 ${retryCount + 1} 次失败，重试中...`)
      return new Promise(resolve => setTimeout(resolve, 1000 * (retryCount + 1)))
        .then(() => uploadToOss(filePath, retryCount + 1))
    }
    throw err
  })
}

// AI 诊断主流程
function runDiagnosis(ossUrl, options = {}) {
  return new Promise(async (resolve, reject) => {
    try {
      // 步骤1: 通义千问-VL 提取视觉特征
      const visionResult = await request(API.analyzeVision, {
        method: 'POST',
        data: { imageUrl: ossUrl, ...options }
      })

      if (visionResult.code !== 0) {
        reject(new Error(visionResult.message || '视觉分析失败'))
        return
      }

      // 步骤2: 通义千问4.0 生成结构化报告
      const reportResult = await request(API.generateReport, {
        method: 'POST',
        data: {
          imageUrl: ossUrl,
          visualFeatures: visionResult.data.features,
          userTags: options.userTags || [],
          quantMetrics: visionResult.data.metrics
        }
      })

      if (reportResult.code !== 0) {
        reject(new Error(reportResult.message || '报告生成失败'))
        return
      }

      resolve(reportResult.data)
    } catch (err) {
      reject(err)
    }
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
            data: { code: res.code }
          }).then(data => {
            if (data.code === 0) {
              wx.setStorageSync('token', data.data.token)
              wx.setStorageSync('userInfo', data.data.userInfo)
              resolve(data.data)
            } else {
              reject(data)
            }
          }).catch(reject)
        } else {
          reject(new Error('微信登录失败'))
        }
      },
      fail: reject
    })
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
  runDiagnosis,
  wxLogin
}
