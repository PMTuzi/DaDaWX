#!/usr/bin/env node
// 一次性脚本：扫描指定目录下的明星头像，上传到 OSS，生成 server/data/celeb-images.json 映射表
//
// 用法：
//   node server/scripts/upload-celebs.js [目录]
//   默认目录：~/Desktop/明星
//
// 文件名规则：基础名（去掉扩展名）作为明星中文名 key，例如 刘亦菲.png → 刘亦菲

const path = require('path')
const fs = require('fs')
const crypto = require('crypto')

require('dotenv').config({ path: path.join(__dirname, '..', '.env.production') })

const oss = require('../utils/oss')

const SRC_DIR = process.argv[2] || path.join(process.env.HOME || '', 'Desktop', '明星')
const MAP_FILE = path.join(__dirname, '..', 'data', 'celeb-images.json')
const OSS_SUBDIR = 'celeb' // 上传到 ${OSS_DIR}/celeb/

const VALID_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp'])
const SKIP_PATTERNS = [/^图片\s*\d/, /^image\s*\d/i, /^IMG_/i, /^Screen\s*Shot/i]

function isCelebFile(name) {
  // 跳过明显的非命名文件
  for (const re of SKIP_PATTERNS) if (re.test(name)) return false
  return true
}

function md5Short(s) {
  return crypto.createHash('md5').update(s).digest('hex').slice(0, 12)
}

async function main() {
  if (!fs.existsSync(SRC_DIR)) {
    console.error('源目录不存在:', SRC_DIR)
    process.exit(1)
  }
  if (!oss.isConfigured()) {
    console.error('OSS 未配置，请检查 .env.production')
    process.exit(1)
  }

  // 读取已有映射，做增量
  let map = {}
  if (fs.existsSync(MAP_FILE)) {
    try { map = JSON.parse(fs.readFileSync(MAP_FILE, 'utf-8')) || {} } catch (_) {}
  }

  const files = fs.readdirSync(SRC_DIR)
    .filter(f => VALID_EXT.has(path.extname(f).toLowerCase()))
    .filter(f => isCelebFile(path.parse(f).name))

  console.log(`发现 ${files.length} 个候选文件，开始上传到 OSS...`)
  console.log(`OSS Bucket: ${process.env.OSS_BUCKET}@${process.env.OSS_REGION}`)
  console.log(`Bucket 子目录: ${process.env.OSS_DIR || 'uploads'}/${OSS_SUBDIR}/\n`)

  let success = 0, skipped = 0, failed = 0

  for (const file of files) {
    const name = path.parse(file).name.trim()
    const ext = path.extname(file).toLowerCase()

    // 已存在且 URL 还在，跳过（用 hash 做幂等：同名重复运行不重传）
    if (map[name] && map[name].url) {
      console.log(`  ⏭  ${name}（已有缓存）`)
      skipped++
      continue
    }

    const buffer = fs.readFileSync(path.join(SRC_DIR, file))
    const hash = md5Short(name + buffer.length)
    const filename = `${OSS_SUBDIR}/${hash}${ext}`

    try {
      const { url } = await oss.uploadBuffer(filename, buffer)
      map[name] = { url, filename, size: buffer.length, ts: Date.now() }
      console.log(`  ✓  ${name} → ${url}`)
      success++
    } catch (e) {
      console.warn(`  ✗  ${name}: ${e.message}`)
      failed++
    }
  }

  // 写映射表（保持紧凑：name → { url, ... }）
  fs.mkdirSync(path.dirname(MAP_FILE), { recursive: true })
  fs.writeFileSync(MAP_FILE, JSON.stringify(map, null, 2))

  console.log(`\n完成：成功 ${success} · 跳过 ${skipped} · 失败 ${failed}`)
  console.log(`映射表已写入：${MAP_FILE}`)
  console.log(`总条目：${Object.keys(map).length}`)

  // 输出名单，供 Prompt 使用
  const names = Object.keys(map).filter(k => map[k] && map[k].url)
  console.log(`\n映射表内可用明星名单（${names.length}）：`)
  console.log(names.join('、'))
}

main().catch(e => { console.error(e); process.exit(1) })
