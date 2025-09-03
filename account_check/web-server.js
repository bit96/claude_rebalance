#!/usr/bin/env node

const express = require('express')
const cors = require('cors')
const { spawn } = require('child_process')
const path = require('path')

const app = express()
const PORT = 3001

// 中间件
app.use(cors())
app.use(express.json())
app.use(express.static(__dirname))

// 测试单个模型
async function testSingleModel(account, modelName, timeout = 60000) {
  return new Promise((resolve) => {
    const startTime = Date.now()
    const result = {
      model: modelName,
      status: 'testing',
      responseTime: 0,
      error: null,
      response: null,
      speed: null
    }

    // 设置环境变量
    const env = {
      ...process.env,
      ANTHROPIC_BASE_URL: account.url,
      ANTHROPIC_API_KEY: account.key
    }

    // 启动 Claude CLI
    const claude = spawn('claude', ['--model', modelName], {
      env,
      stdio: ['pipe', 'pipe', 'pipe']
    })

    let output = ''
    let errorOutput = ''
    let hasResponded = false

    claude.stdout.on('data', (data) => {
      output += data.toString()
    })

    claude.stderr.on('data', (data) => {
      errorOutput += data.toString()
    })

    // 设置超时
    const timeoutId = setTimeout(() => {
      if (!hasResponded) {
        claude.kill()
        result.status = 'failed'
        result.error = '响应超时'
        result.errorType = '超时'
        result.responseTime = Date.now() - startTime
        hasResponded = true
        resolve(result)
      }
    }, timeout)

    claude.on('close', (code) => {
      if (hasResponded) return
      hasResponded = true
      clearTimeout(timeoutId)
      result.responseTime = Date.now() - startTime

      if (code === 0 && output.length > 0 && !output.includes('Error') && !output.includes('error')) {
        // 成功
        result.status = 'success'
        result.response = output.trim().substring(0, 200)
        
        // 判断速度
        if (result.responseTime < 3000) {
          result.speed = '⚡ 极快'
        } else if (result.responseTime < 8000) {
          result.speed = '🚀 快速'
        } else if (result.responseTime < 15000) {
          result.speed = '🐢 较慢'
        } else {
          result.speed = '🐌 很慢'
        }
      } else {
        // 失败
        result.status = 'failed'
        const combinedError = errorOutput + output
        
        if (combinedError.includes('authentication') || combinedError.includes('unauthorized') || combinedError.includes('401')) {
          result.errorType = '认证失败'
          result.error = 'API Key 无效或过期'
        } else if (combinedError.includes('rate limit') || combinedError.includes('429')) {
          result.errorType = '限流'
          result.error = '请求过于频繁'
        } else if (combinedError.includes('permission') || combinedError.includes('403')) {
          result.errorType = '无权限'
          result.error = '无权限访问该模型'
        } else if (combinedError.includes('connection') || combinedError.includes('network')) {
          result.errorType = '连接错误'
          result.error = '网络连接失败'
        } else {
          result.errorType = '未知错误'
          result.error = combinedError.substring(0, 100) || '未知错误'
        }
      }
      
      resolve(result)
    })

    // 发送测试问题
    setTimeout(() => {
      claude.stdin.write('你是什么模型，有什么优势？\n')
      claude.stdin.end()
    }, 1000)
  })
}

// 测试账号（双模型）
async function testAccount(account) {
  const result = {
    name: account.name || 'Test Account',
    url: account.url,
    sonnet4: null,
    opus41: null,
    overallStatus: 'testing'
  }

  // 测试 Sonnet 4
  result.sonnet4 = await testSingleModel(account, 'claude-sonnet-4-20250514')
  
  if (result.sonnet4.status === 'success') {
    // 测试 Opus 4.1
    result.opus41 = await testSingleModel(account, 'claude-opus-4-1-20250805')
    
    if (result.opus41.status === 'success') {
      result.overallStatus = 'both_success'
    } else {
      result.overallStatus = 'sonnet_only'
    }
  } else {
    result.opus41 = { 
      model: 'claude-opus-4-1-20250805', 
      status: 'skipped', 
      error: 'Sonnet 4 测试失败，跳过此测试'
    }
    result.overallStatus = 'both_failed'
  }

  return result
}

// 主页面
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'))
})

// 验证API
app.post('/api/validate', async (req, res) => {
  const { url, key } = req.body

  if (!url || !key) {
    return res.status(400).json({ error: 'URL和API Key都是必需的' })
  }

  try {
    const account = { url, key, name: 'Web测试账号' }
    const result = await testAccount(account)
    res.json({ success: true, data: result })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// 启动服务器
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Claude账号Web验证服务已启动`)
  console.log(`📱 访问地址: http://localhost:${PORT}`)
  console.log(`🌐 外网访问: http://47.99.45.175:${PORT}`)
})