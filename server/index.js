// 云托管函数入口 - Express 应用代理
const http = require('http')
let server = null
let app = null

exports.main = async (event, context) => {
  // 懒加载 Express 应用
  if (!app) {
    app = require('./server')
  }

  // 将云托管事件转换为 HTTP 请求
  // 云托管函数型支持 HTTP 触发，event 结构与 API 网关类似
  return new Promise((resolve, reject) => {
    const handler = app
    
    // 构造模拟的 req/res 对象
    const method = event.httpMethod || 'GET'
    const path = event.path || event.url || '/'
    const headers = event.headers || {}
    const body = event.body ? (typeof event.body === 'string' ? event.body : JSON.stringify(event.body)) : ''
    
    // 直接使用 Express 的 callback 模式
    const mockReq = {
      method,
      url: path,
      path,
      headers,
      body,
      query: event.queryStringParameters || {},
      params: {},
      get: (name) => headers[name.toLowerCase()],
      _read: () => {},
      pipe: (dest) => dest,
      on: () => {}
    }
    
    let responseBody = ''
    let statusCode = 200
    let responseHeaders = {}
    
    const mockRes = {
      statusCode: 200,
      setHeader: (name, value) => { responseHeaders[name] = value },
      getHeader: (name) => responseHeaders[name],
      removeHeader: (name) => { delete responseHeaders[name] },
      writeHead: (code, hdrs) => { 
        statusCode = code
        if (hdrs) Object.assign(responseHeaders, hdrs)
      },
      write: (chunk) => { responseBody += chunk },
      end: (chunk) => {
        if (chunk) responseBody += chunk
        resolve({
          statusCode: statusCode || mockRes.statusCode,
          headers: { 'Content-Type': 'application/json', ...responseHeaders },
          body: responseBody
        })
      },
      json: (data) => {
        responseBody = JSON.stringify(data)
        mockRes.statusCode = mockRes.statusCode || 200
        resolve({
          statusCode: mockRes.statusCode,
          headers: { 'Content-Type': 'application/json', ...responseHeaders },
          body: responseBody
        })
      },
      status: (code) => {
        mockRes.statusCode = code
        return mockRes
      }
    }
    
    // 将请求传递给 Express
    try {
      handler(mockReq, mockRes)
    } catch (err) {
      resolve({
        statusCode: 500,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: -1, message: err.message })
      })
    }
  })
}
