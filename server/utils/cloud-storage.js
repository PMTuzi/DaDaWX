// 图片 URL 解析工具
// 当前架构：图片由服务器本地托管（云托管公网域名 + /uploads 静态服务），无需调用云存储 SDK
// 保留 resolveImageUrl 接口以便 AI/Consult 路由透明调用

/**
 * 解析图片 URL：HTTPS 直接返回；其他协议（cloud:// 等遗留）返回 null 让调用方降级处理
 * @param {string} imageUrl
 * @returns {Promise<string|null>}
 */
async function resolveImageUrl(imageUrl) {
  if (!imageUrl) return null
  if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) return imageUrl
  if (imageUrl.startsWith('cloud://')) {
    console.warn('[cloud-storage] 收到 cloud:// URL 但当前架构不支持，请使用 base64 上传:', imageUrl)
    return null
  }
  return imageUrl
}

module.exports = {
  resolveImageUrl
}
