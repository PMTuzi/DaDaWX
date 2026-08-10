#!/usr/bin/env node
/**
 * 云托管连通性测试脚本
 * 使用方式: node test-cloudrun.js
 * 
 * 测试内容:
 * 1. 直接 HTTP 调用健康检查接口
 * 2. 模拟 callContainer 调用
 */

const https = require('https')

// 配置
const ENV_ID = 'dada0810-d6g6aowp1aeffc3ce'
const SERVICE_NAME = 'dada-server'

console.log('=' .repeat(60))
console.log(`云托管连通性测试`)
console.log(`环境ID: ${ENV_ID}`)
console.log(`服务名: ${SERVICE_NAME}`)
console.log(`时间: ${new Date().toISOString()}`)
console.log('=' .repeat(60))

// 测试1: 通过微信云托管网关调用
function testHealthCheck() {
  return new Promise((resolve, reject) => {
    console.log('\n[测试1] 健康检查 /api/health')
    
    // 微信云托管内网地址格式
    const url = `https://${ENV_ID}.ap-shanghai.app.tcloudbase.com/api/health`
    console.log(`请求URL: ${url}`)
    
    const req = https.get(url, {
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'dada-test/1.0'
      },
      timeout: 10000
    }, (res) => {
      let data = ''
      res.on('data', chunk => data += chunk)
      res.on('end', () => {
        console.log(`✅ 状态码: ${res.statusCode}`)
        console.log(`响应: ${data}`)
        resolve({ status: res.statusCode, data: JSON.parse(data) })
      })
    })
    
    req.on('error', (err) => {
      console.error(`❌ 请求失败: ${err.message}`)
      reject(err)
    })
    
    req.on('timeout', () => {
      console.error('❌ 请求超时')
      req.destroy()
      reject(new Error('timeout'))
    })
  })
}

// 测试2: 测试 analyze-clothing-vision 接口（无鉴权，应该返回401）
function testVisionAPI() {
  return new Promise((resolve, reject) => {
    console.log('\n[测试2] 视觉分析接口 /api/consult/analyze-clothing-vision (预期返回401)')
    
    const url = `https://${ENV_ID}.ap-shanghai.app.tcloudbase.com/api/consult/analyze-clothing-vision`
    console.log(`请求URL: ${url}`)
    
    const postData = JSON.stringify({ images: [{ imageUrl: 'https://test.com/test.jpg' }] })
    
    const req = https.request(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
        'User-Agent': 'dada-test/1.0'
      },
      timeout: 15000
    }, (res) => {
      let data = ''
      res.on('data', chunk => data += chunk)
      res.on('end', () => {
        console.log(`状态码: ${res.statusCode}`)
        console.log(`响应: ${data.slice(0, 500)}`)
        
        if (res.statusCode === 401) {
          console.log('✅ 接口可达（返回401说明路由正确，只是缺少鉴权）')
          resolve({ status: res.statusCode, reachable: true })
        } else if (res.statusCode === 200 || res.statusCode === 400 || res.statusCode === 500) {
          console.log('✅ 接口可达')
          resolve({ status: res.statusCode, reachable: true })
        } else {
          console.log('⚠️ 异常状态码')
          resolve({ status: res.statusCode, reachable: false })
        }
      })
    })
    
    req.write(postData)
    req.end()
    
    req.on('error', (err) => {
      console.error(`❌ 请求失败: ${err.message}`)
      reject(err)
    })
    
    req.on('timeout', () => {
      console.error('❌ 请求超时')
      req.destroy()
      reject(new Error('timeout'))
    })
  })
}

// 运行所有测试
async function runTests() {
  try {
    // 测试1: 健康检查
    await testHealthCheck()
    
    // 测试2: Vision API
    await testVisionAPI()
    
    console.log('\n' + '='.repeat(60))
    console.log('测试完成!')
    console.log('如果两个测试都通过，说明云托管服务正常运行')
    console.log('如果失败，请检查:')
    console.log('  1. 云托管控制台的服务状态')
    console.log('  2. 容器日志是否有报错')
    console.log('  3. 环境变量是否正确设置')
    console.log('='.repeat(60))
  } catch (err) {
    console.error('\n测试出错:', err.message)
    process.exit(1)
  }
}

runTests()
