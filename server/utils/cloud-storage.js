// CloudBase 云存储工具（懒加载 SDK，避免启动时初始化失败）
let _app = null
let _initError = null

function getApp() {
  if (_app) return _app
  if (_initError) throw _initError
  try {
    const cloudbase = require('@cloudbase/node-sdk')
    const ENV_ID = process.env.CLOUDBASE_ENV_ID || 'dada-d9gw8x8fb426caba5'
    _app = cloudbase.init({ env: ENV_ID })
    return _app
  } catch (err) {
    _initError = err
    throw err
  }
}

/**
 * 上传文件到云存储
 * @param {string} cloudPath - 云端路径，如 'uploads/xxx.jpg'
 * @param {Buffer|string} fileContent - 文件内容（Buffer 或本地路径）
 * @returns {Promise<{fileID: string, url: string}>}
 */
async function uploadToCloud(cloudPath, fileContent) {
  try {
    const app = getApp()
    const result = await app.uploadFile({ cloudPath, fileContent })
    console.log('[CloudStorage] 上传成功:', cloudPath)
    return {
      fileID: result.fileID,
      url: result.download_url || result.fileID
    }
  } catch (err) {
    console.error('[CloudStorage] 上传失败:', err.message)
    throw err
  }
}

/**
 * 获取文件的临时访问链接
 */
async function getTempUrl(fileID, maxAge = 7200) {
  try {
    const app = getApp()
    const result = await app.getTempFileURL({
      fileList: [{ fileID, maxAge }]
    })
    const item = result.fileList?.[0]
    if (item && item.tempFileURL) return item.tempFileURL
    if (item && item.download_url) return item.download_url
    throw new Error('获取临时链接失败')
  } catch (err) {
    console.error('[CloudStorage] 获取临时链接失败:', err.message)
    throw err
  }
}

/**
 * 删除云存储文件
 */
async function deleteFiles(fileIDs) {
  try {
    const app = getApp()
    await app.deleteFile({ fileList: fileIDs })
    console.log('[CloudStorage] 删除成功:', fileIDs.length, '个文件')
  } catch (err) {
    console.error('[CloudStorage] 删除失败:', err.message)
  }
}

/**
 * 从 imageUrl 解析可访问链接
 */
async function resolveImageUrl(imageUrl) {
  if (!imageUrl) return null
  if (imageUrl.startsWith('cloud://')) {
    return await getTempUrl(imageUrl)
  }
  if (imageUrl.startsWith('http')) return imageUrl
  return imageUrl
}

module.exports = {
  uploadToCloud,
  getTempUrl,
  deleteFiles,
  resolveImageUrl
}
