// 阿里云 OSS 上传工具（懒加载客户端）
// 环境变量：OSS_ACCESS_KEY_ID / OSS_ACCESS_KEY_SECRET / OSS_BUCKET / OSS_REGION / OSS_DIR
let _client = null
let _initError = null

function getClient() {
  if (_client) return _client
  if (_initError) throw _initError
  try {
    const OSS = require('ali-oss')
    const region = process.env.OSS_REGION || 'oss-cn-hangzhou'
    const bucket = process.env.OSS_BUCKET
    const accessKeyId = process.env.OSS_ACCESS_KEY_ID
    const accessKeySecret = process.env.OSS_ACCESS_KEY_SECRET
    if (!bucket || !accessKeyId || !accessKeySecret) {
      throw new Error('OSS 配置缺失：请检查环境变量 OSS_BUCKET/OSS_ACCESS_KEY_ID/OSS_ACCESS_KEY_SECRET')
    }
    _client = new OSS({ region, bucket, accessKeyId, accessKeySecret, secure: true })
    return _client
  } catch (err) {
    _initError = err
    throw err
  }
}

function isConfigured() {
  return !!(process.env.OSS_BUCKET && process.env.OSS_ACCESS_KEY_ID && process.env.OSS_ACCESS_KEY_SECRET)
}

/**
 * 上传 Buffer 到 OSS
 * @param {string} filename - 文件名（不含目录）
 * @param {Buffer} buffer
 * @returns {Promise<{url: string, key: string}>} 公网 HTTPS URL
 */
async function uploadBuffer(filename, buffer) {
  const client = getClient()
  const dir = (process.env.OSS_DIR || 'uploads').replace(/^\/|\/$/g, '')
  const key = `${dir}/${filename}`
  const result = await client.put(key, buffer, {
    headers: { 'Cache-Control': 'public, max-age=2592000' }
  })
  // 返回 https URL（确保是 https）
  const url = (result.url || '').replace(/^http:\/\//, 'https://')
  return { url, key }
}

module.exports = { uploadBuffer, isConfigured }
