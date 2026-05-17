// OSS 上传路由
const express = require('express')
const router = express.Router()
const crypto = require('crypto')

const OSS_ACCESS_KEY_ID = process.env.OSS_ACCESS_KEY_ID
const OSS_ACCESS_KEY_SECRET = process.env.OSS_ACCESS_KEY_SECRET
const OSS_BUCKET = process.env.OSS_BUCKET || 'dada-photos'
const OSS_REGION = process.env.OSS_REGION || 'oss-cn-hangzhou'
const OSS_DIR = process.env.OSS_DIR || 'uploads/'

/**
 * 获取OSS STS临时凭证（推荐方式）
 * 客户端直接上传到OSS，不经过服务器
 */
router.get('/token', async (req, res) => {
  try {
    // 简化实现：使用主账号生成签名policy
    // 生产环境建议使用STS临时凭证
    const expireTime = new Date()
    expireTime.setTime(expireTime.getTime() + 3600 * 1000) // 1小时有效

    const policy = {
      expiration: expireTime.toISOString(),
      conditions: [
        ['content-length-range', 0, 10485760], // 最大10MB
        ['starts-with', '$key', OSS_DIR]
      ]
    }

    const policyBase64 = Buffer.from(JSON.stringify(policy)).toString('base64')
    const signature = crypto
      .createHmac('sha1', OSS_ACCESS_KEY_SECRET)
      .update(policyBase64)
      .digest('base64')

    res.json({
      code: 0,
      data: {
        accessKeyId: OSS_ACCESS_KEY_ID,
        host: `https://${OSS_BUCKET}.${OSS_REGION}.aliyuncs.com`,
        policy: policyBase64,
        signature,
        dir: OSS_DIR,
        expire: Math.floor(expireTime.getTime() / 1000)
      }
    })
  } catch (err) {
    console.error('获取OSS凭证失败:', err)
    res.status(500).json({ code: -1, message: '获取上传凭证失败' })
  }
})

module.exports = router
