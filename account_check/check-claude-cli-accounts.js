#!/usr/bin/env node

/**
 * 批量测试Claude账号双模型可用性 - 基于Claude CLI的深度验证
 * 
 * 核心优势: 
 * - 直接通过 Claude CLI 进行真实测试，避免假阳性
 * - 验证完整的调用链路：环境变量 → Claude CLI → 模型响应
 * - 分步测试：Sonnet 4 成功后再测试 Opus 4.1
 * 
 * 使用方法:
 * 1. 准备账号配置文件 accounts.csv 或 accounts.json:
 *    CSV格式: 账号名称,url,token
 *    JSON格式: [{"name": "账号1", "url": "http://...", "key": "cr_xxx"}]
 * 
 * 2. 确保已安装 Claude CLI:
 *    npm install -g @anthropic-ai/claude-cli
 * 
 * 3. 运行测试:
 *    node check-claude-cli-accounts.js accounts.csv
 * 
 * 4. 测试流程:
 *    每个账号 → 设置环境变量 → claude --model sonnet-4 → "你是什么模型，有什么优势？"
 *    成功则继续测试 claude --model opus-4.1 → 分类结果
 * 
 * 5. 可选参数:
 *    --timeout 45000  设置超时时间（毫秒，CLI测试需要更长时间）
 *    --parallel 2  并行测试数量（建议较少，避免CLI冲突）
 *    --verbose  显示详细错误信息
 *    --dingtalk-webhook URL  钉钉机器人webhook地址
 *    --dingtalk-secret SECRET  钉钉机器人签名密钥（可选）
 *    --dingtalk-at-all  失败时@所有人
 *    --dingtalk-always  总是发送通知（默认只在失败时发送）
 */

const fs = require('fs')
const path = require('path')
const { spawn } = require('child_process')
const https = require('https')
const crypto = require('crypto')

// 简单的颜色输出函数
const colors = {
  red: (text) => `\x1b[31m${text}\x1b[0m`,
  green: (text) => `\x1b[32m${text}\x1b[0m`,
  yellow: (text) => `\x1b[33m${text}\x1b[0m`,
  blue: (text) => `\x1b[34m${text}\x1b[0m`,
  cyan: (text) => `\x1b[36m${text}\x1b[0m`,
  bold: (text) => `\x1b[1m${text}\x1b[0m`
}


// 解析命令行参数
function parseArgs() {
  const args = process.argv.slice(2)
  const options = {
    configFile: null,
    timeout: 45000, // CLI测试需要更长时间
    parallel: 1, // 默认单线程，避免CLI冲突
    verbose: false,
    dingTalkWebhook: "https://oapi.dingtalk.com/robot/send?access_token=6f26248ec006cdd90c2886d956b7570cb9b06a24ef5065497658472ca43942b5",
    dingTalkSecret: null,
    dingTalkAtAll: false,
    dingTalkAlways: false
  }

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--timeout' && args[i + 1]) {
      options.timeout = parseInt(args[i + 1])
      i++
    } else if (args[i] === '--parallel' && args[i + 1]) {
      options.parallel = parseInt(args[i + 1])
      i++
    } else if (args[i] === '--verbose') {
      options.verbose = true
    } else if (args[i] === '--dingtalk-webhook' && args[i + 1]) {
      options.dingTalkWebhook = args[i + 1]
      i++
    } else if (args[i] === '--dingtalk-secret' && args[i + 1]) {
      options.dingTalkSecret = args[i + 1]
      i++
    } else if (args[i] === '--dingtalk-at-all') {
      options.dingTalkAtAll = true
    } else if (args[i] === '--dingtalk-always') {
      options.dingTalkAlways = true
    } else if (!args[i].startsWith('--')) {
      options.configFile = args[i]
    }
  }

  if (!options.configFile) {
    console.error('❌ 请提供账号配置文件路径')
    console.log('用法: node check-claude-cli-accounts.js <accounts.csv>')
    console.log('示例: node check-claude-cli-accounts.js accounts.csv --timeout 45000 --parallel 2')
    console.log('钉钉通知: --dingtalk-webhook "https://oapi.dingtalk.com/robot/send?access_token=xxx"')
    process.exit(1)
  }

  // 从环境变量读取钉钉配置（如果命令行未提供）
  if (!options.dingTalkWebhook && process.env.DINGTALK_WEBHOOK) {
    options.dingTalkWebhook = process.env.DINGTALK_WEBHOOK
  }
  if (!options.dingTalkSecret && process.env.DINGTALK_SECRET) {
    options.dingTalkSecret = process.env.DINGTALK_SECRET
  }

  return options
}

// 发送钉钉消息
async function sendDingTalkMessage(webhook, secret, message) {
  return new Promise((resolve) => {
    try {
      let url = webhook
      let postData = JSON.stringify(message)
      
      // 如果启用了签名验证
      if (secret) {
        const timestamp = Date.now()
        const stringToSign = timestamp + '\n' + secret
        const sign = crypto.createHmac('sha256', secret)
          .update(stringToSign, 'utf8')
          .digest('base64')
        
        // 添加签名参数
        const separator = webhook.includes('?') ? '&' : '?'
        url += `${separator}timestamp=${timestamp}&sign=${encodeURIComponent(sign)}`
      }
      
      const urlObj = new URL(url)
      const options = {
        hostname: urlObj.hostname,
        port: urlObj.port || 443,
        path: urlObj.pathname + urlObj.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData)
        },
        timeout: 10000 // 10秒超时
      }
      
      const req = https.request(options, (res) => {
        let data = ''
        res.on('data', (chunk) => {
          data += chunk
        })
        
        res.on('end', () => {
          try {
            const response = JSON.parse(data)
            if (response.errcode === 0) {
              console.log(`📱 钉钉消息发送成功`)
              resolve({ success: true, data: response })
            } else {
              console.log(`⚠️ 钉钉消息发送失败: ${response.errmsg}`)
              resolve({ success: false, error: response.errmsg })
            }
          } catch (error) {
            console.log(`⚠️ 钉钉响应解析失败: ${error.message}`)
            resolve({ success: false, error: error.message })
          }
        })
      })
      
      req.on('error', (error) => {
        console.log(`⚠️ 钉钉消息发送网络错误: ${error.message}`)
        resolve({ success: false, error: error.message })
      })
      
      req.on('timeout', () => {
        req.destroy()
        console.log(`⚠️ 钉钉消息发送超时`)
        resolve({ success: false, error: '请求超时' })
      })
      
      req.write(postData)
      req.end()
      
    } catch (error) {
      console.log(`⚠️ 钉钉消息构建失败: ${error.message}`)
      resolve({ success: false, error: error.message })
    }
  })
}

// 构建钉钉通知消息
function buildNotificationMessage(results, stats) {
  const timestamp = new Date().toLocaleString('zh-CN')
  const bothFailedAccounts = results.filter(r => r.overallStatus === 'both_failed')
  const sonnetOnlyAccounts = results.filter(r => r.overallStatus === 'sonnet_only')
  
  // 如果没有失败账号，返回成功消息
  if (bothFailedAccounts.length === 0 && sonnetOnlyAccounts.length === 0) {
    return {
      msgtype: "markdown",
      markdown: {
        title: "Claude账号测试全部通过",
        text: `## ✅ Claude账号测试全部通过

📅 **测试时间**: ${timestamp}  
📊 **测试结果**: 
- 总账号数: ${stats.total}个
- 双模型通过: ${stats.both_success}个 🎉

🎯 所有账号运行正常！`
      }
    }
  }
  
  // 构建失败通知消息
  let messageText = `## 🚨 Claude账号测试告警报告

📅 **测试时间**: ${timestamp}  
📊 **测试概况**: 
- 总账号数: ${stats.total}个
- 双模型通过: ${stats.both_success}个 ✅
- 仅Sonnet4通过: ${stats.sonnet_only}个 ⚠️  
- 完全失败: ${stats.both_failed}个 ❌

---`

  // 添加完全失败账号信息
  if (bothFailedAccounts.length > 0) {
    messageText += `\n❌ **完全失败账号** (${bothFailedAccounts.length}个):`
    bothFailedAccounts.slice(0, 10).forEach(acc => {
      const errorMsg = acc.sonnet4.error ? acc.sonnet4.error.substring(0, 30) : '未知错误'
      messageText += `\n• **${acc.name}**: ${acc.url} → ${errorMsg}`
    })
    if (bothFailedAccounts.length > 10) {
      messageText += `\n• 还有 ${bothFailedAccounts.length - 10} 个账号失败...`
    }
  }

  // 添加部分失败账号信息
  if (sonnetOnlyAccounts.length > 0) {
    messageText += `\n\n⚠️ **部分失败账号** (${sonnetOnlyAccounts.length}个):`
    sonnetOnlyAccounts.slice(0, 10).forEach(acc => {
      const errorMsg = acc.opus41.error ? acc.opus41.error.substring(0, 30) : '未知错误'
      messageText += `\n• **${acc.name}**: Opus4.1 ${errorMsg}`
    })
    if (sonnetOnlyAccounts.length > 10) {
      messageText += `\n• 还有 ${sonnetOnlyAccounts.length - 10} 个账号部分失败...`
    }
  }

  messageText += `\n\n⏰ 请及时处理失败账号！`

  return {
    msgtype: "markdown",
    markdown: {
      title: "Claude账号测试告警",
      text: messageText
    }
  }
}

// 判断是否需要为仅Sonnet可用的情况发送告警
function shouldAlertForSonnetOnly(results, stats) {
  // 如果没有仅Sonnet可用的账号，不需要告警
  if (stats.sonnet_only === 0) return false
  
  // 如果同时有完全失败的账号，需要告警
  if (stats.both_failed > 0) return true
  
  // 有仅Sonnet可用的账号时需要告警
  return true
}

// 发送钉钉通知 - 主控制函数
async function sendDingTalkNotification(results, stats, options) {
  // 检查是否配置了钉钉webhook
  if (!options.dingTalkWebhook) {
    return
  }

  try {
    // 判断是否需要发送通知
    const hasFailures = stats.both_failed > 0 || shouldAlertForSonnetOnly(results, stats)
    const shouldSend = options.dingTalkAlways || hasFailures

    if (!shouldSend) {
      console.log('📱 无失败账号，跳过钉钉通知')
      return
    }

    console.log('📱 准备发送钉钉通知...')
    
    // 构建消息内容
    const message = buildNotificationMessage(results, stats)
    
    // 添加@功能
    if (options.dingTalkAtAll && (stats.both_failed > 0)) {
      message.at = { isAtAll: true }
    }
    
    // 发送消息
    const result = await sendDingTalkMessage(
      options.dingTalkWebhook, 
      options.dingTalkSecret, 
      message
    )
    
    if (!result.success) {
      console.log(`⚠️ 钉钉通知发送失败，但不影响主程序运行`)
    }
    
  } catch (error) {
    console.log(`⚠️ 钉钉通知处理异常: ${error.message}`)
  }
}

// 测试单个模型 - 通过 Claude CLI
async function testSingleModel(account, modelName, options) {
  return new Promise((resolve) => {
    const startTime = Date.now()
    const result = {
      model: modelName,
      status: 'testing',
      responseTime: 0,
      error: null,
      response: null,
      speed: null,
      actualModel: null
    }

    console.log(`    🔧 启动 Claude CLI 测试 ${modelName}...`)

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
    const timeout = setTimeout(() => {
      if (!hasResponded) {
        claude.kill()
        result.status = 'failed'
        result.error = '响应超时'
        result.errorType = '超时'
        result.responseTime = Date.now() - startTime
        hasResponded = true
        resolve(result)
      }
    }, options.timeout)

    claude.on('close', (code) => {
      if (hasResponded) return
      hasResponded = true
      clearTimeout(timeout)
      result.responseTime = Date.now() - startTime

      if (code === 0 && output.length > 0 && !output.includes('Error') && !output.includes('error')) {
        // 成功：收到了有效回复
        result.status = 'success'
        result.response = output.trim().substring(0, 200)
        
        // 尝试从回复中提取模型信息
        if (output.toLowerCase().includes('sonnet') || output.toLowerCase().includes('claude-3')) {
          result.actualModel = 'detected-from-response'
        }
        
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
        // 失败：分析错误原因
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
        } else if (combinedError.includes('model') || combinedError.includes('not found')) {
          result.errorType = '模型不存在'
          result.error = '指定的模型不存在或不可用'
        } else if (code !== 0) {
          result.errorType = 'CLI错误'
          result.error = `Claude CLI 退出码: ${code}`
        } else {
          result.errorType = '未知错误'
          result.error = combinedError.trim() || '没有收到有效响应'
        }
      }

      resolve(result)
    })

    claude.on('error', (error) => {
      if (hasResponded) return
      hasResponded = true
      clearTimeout(timeout)
      
      result.status = 'failed'
      result.responseTime = Date.now() - startTime
      result.errorType = 'CLI启动失败'
      result.error = `无法启动 Claude CLI: ${error.message}`
      resolve(result)
    })

    // 发送测试问题
    setTimeout(() => {
      if (!hasResponded) {
        try {
          claude.stdin.write('你是什么模型，有什么优势？\n')
          claude.stdin.end()
        } catch (error) {
          // 忽略写入错误，让其他错误处理机制处理
        }
      }
    }, 1000) // 等待1秒让CLI启动完成
  })
}

// 测试单个账号 - 分步测试 Sonnet 4 和 Opus 4.1
async function testAccountDirect(account, options) {
  const overallResult = {
    name: account.name,
    url: account.url,
    key: account.key.substring(0, 10) + '...',
    fullKey: account.key, // 保存完整key用于后续保存配置
    sonnet4: null,
    opus41: null,
    overallStatus: 'testing'
  }

  console.log(`🔄 测试账号: ${colors.cyan(account.name)} (${account.url})`)
  
  // 第一步：测试 Sonnet 4
  console.log(`  📋 测试 Sonnet 4 模型 (通过 Claude CLI)...`)
  overallResult.sonnet4 = await testSingleModel(account, 'claude-sonnet-4-20250514', options)
  
  if (overallResult.sonnet4.status === 'success') {
    console.log(`    ✅ Sonnet 4: ${colors.green('成功')} - ${overallResult.sonnet4.speed} (${overallResult.sonnet4.responseTime}ms)`)
    console.log(`    💬 响应预览: ${colors.cyan(overallResult.sonnet4.response.substring(0, 80))}...`)
    
    // 第二步：测试 Opus 4.1
    console.log(`  📋 测试 Opus 4.1 模型 (通过 Claude CLI)...`)
    overallResult.opus41 = await testSingleModel(account, 'claude-opus-4-1-20250805', options)
    
    if (overallResult.opus41.status === 'success') {
      console.log(`    ✅ Opus 4.1: ${colors.green('成功')} - ${overallResult.opus41.speed} (${overallResult.opus41.responseTime}ms)`)
      console.log(`    💬 响应预览: ${colors.cyan(overallResult.opus41.response.substring(0, 80))}...`)
      overallResult.overallStatus = 'both_success'
      console.log(`📊 ${colors.green('账号结果')}: ${colors.bold(account.name)} - 支持双模型 🎉`)
    } else {
      console.log(`    ❌ Opus 4.1: ${colors.yellow('失败')} - ${overallResult.opus41.errorType}: ${overallResult.opus41.error}`)
      overallResult.overallStatus = 'sonnet_only'
      console.log(`📊 ${colors.yellow('账号结果')}: ${colors.bold(account.name)} - 仅支持 Sonnet 4`)
    }
  } else {
    console.log(`    ❌ Sonnet 4: ${colors.red('失败')} - ${overallResult.sonnet4.errorType}: ${overallResult.sonnet4.error}`)
    overallResult.opus41 = { 
      model: 'claude-opus-4-1-20250805', 
      status: 'skipped', 
      responseTime: 0, 
      error: 'Sonnet 4 测试失败，跳过此测试',
      errorType: '跳过测试'
    }
    overallResult.overallStatus = 'both_failed'
    console.log(`📊 ${colors.red('账号结果')}: ${colors.bold(account.name)} - 两个模型都不支持`)
  }

  return overallResult
}

// 测试单个账号 - 方式2: 通过Claude CLI（更真实但更慢）
async function testAccountViaCLI(account, options) {
  return new Promise((resolve) => {
    const startTime = Date.now()
    const result = {
      name: account.name,
      url: account.url,
      key: account.key.substring(0, 10) + '...',
      status: 'testing',
      responseTime: 0,
      error: null
    }

    console.log(`🔄 通过CLI测试: ${colors.cyan(account.name)}`)

    // 设置环境变量
    const env = {
      ...process.env,
      ANTHROPIC_API_URL: account.url,
      ANTHROPIC_API_KEY: account.key
    }

    // 执行claude命令
    const claude = spawn('claude', [], {
      env,
      timeout: options.timeout
    })

    let output = ''
    let errorOutput = ''

    claude.stdout.on('data', (data) => {
      output += data.toString()
    })

    claude.stderr.on('data', (data) => {
      errorOutput += data.toString()
    })

    // 发送测试问题
    setTimeout(() => {
      claude.stdin.write('你是什么模型？速度快不快？\n')
      claude.stdin.end()
    }, 1000)

    // 设置超时
    const timeout = setTimeout(() => {
      claude.kill()
      result.status = 'timeout'
      result.error = '响应超时'
      result.responseTime = Date.now() - startTime
      console.log(`⏱️ ${colors.yellow(account.name)} - 超时`)
      resolve(result)
    }, options.timeout)

    claude.on('close', (code) => {
      clearTimeout(timeout)
      result.responseTime = Date.now() - startTime

      if (code === 0 && output.length > 0) {
        result.status = 'success'
        result.response = output.substring(0, 200)
        
        // 判断速度
        if (result.responseTime < 3000) {
          result.speed = '⚡ 极快'
        } else if (result.responseTime < 6000) {
          result.speed = '🚀 快速'
        } else if (result.responseTime < 12000) {
          result.speed = '🐢 较慢'
        } else {
          result.speed = '🐌 很慢'
        }
        
        console.log(`✅ ${colors.green(account.name)} - ${result.speed} (${result.responseTime}ms)`)
      } else {
        result.status = 'failed'
        result.error = errorOutput || '无响应'
        console.log(`❌ ${colors.red(account.name)} - ${result.error}`)
      }

      resolve(result)
    })
  })
}

// 批量测试账号
async function batchTest(accounts, options) {
  const results = []
  const chunks = []
  
  // 分组进行并行测试
  for (let i = 0; i < accounts.length; i += options.parallel) {
    chunks.push(accounts.slice(i, i + options.parallel))
  }

  console.log(`\n📊 开始双模型 CLI 深度测试 ${accounts.length} 个账号 (并行数: ${options.parallel})`)
  console.log(`🔄 测试流程: Claude CLI + Sonnet 4 → (成功则继续) → Claude CLI + Opus 4.1`)
  console.log(`❓ 测试问题: "你是什么模型，有什么优势？"\n`)

  for (const chunk of chunks) {
    const chunkResults = await Promise.all(
      chunk.map(account => testAccountDirect(account, options))
    )
    results.push(...chunkResults)
  }

  return results
}

// 生成测试报告
function generateReport(results) {
  console.log('\n' + '='.repeat(80))
  console.log(colors.bold('📊 双模型测试报告 (Sonnet 4 + Opus 4.1)'))
  console.log('='.repeat(80))

  // 统计
  const stats = {
    total: results.length,
    both_success: results.filter(r => r.overallStatus === 'both_success').length,
    sonnet_only: results.filter(r => r.overallStatus === 'sonnet_only').length,
    both_failed: results.filter(r => r.overallStatus === 'both_failed').length
  }

  console.log('\n📈 统计概览:')
  console.log(`  总账号数: ${stats.total}`)
  console.log(`  🎉 ${colors.green('双模型支持')}: ${stats.both_success} (${(stats.both_success / stats.total * 100).toFixed(1)}%)`)
  console.log(`  📋 ${colors.yellow('仅支持Sonnet 4')}: ${stats.sonnet_only} (${(stats.sonnet_only / stats.total * 100).toFixed(1)}%)`)
  console.log(`  ❌ ${colors.red('都不支持')}: ${stats.both_failed} (${(stats.both_failed / stats.total * 100).toFixed(1)}%)`)

  // 双模型支持账号
  const bothSupportAccounts = results.filter(r => r.overallStatus === 'both_success')
  if (bothSupportAccounts.length > 0) {
    console.log(`\n🎉 ${colors.green('双模型支持账号')} (${bothSupportAccounts.length}):`)
    bothSupportAccounts
      .sort((a, b) => (a.sonnet4.responseTime + a.opus41.responseTime) - (b.sonnet4.responseTime + b.opus41.responseTime))
      .forEach(acc => {
        console.log(`  ${colors.bold(acc.name)}:`)
        console.log(`    🔸 Sonnet 4: ${acc.sonnet4.speed} (${acc.sonnet4.responseTime}ms)`)
        console.log(`    🔸 Opus 4.1: ${acc.opus41.speed} (${acc.opus41.responseTime}ms)`)
        console.log(`    🔸 总耗时: ${acc.sonnet4.responseTime + acc.opus41.responseTime}ms`)
      })
  }

  // 仅支持Sonnet 4的账号
  const sonnetOnlyAccounts = results.filter(r => r.overallStatus === 'sonnet_only')
  if (sonnetOnlyAccounts.length > 0) {
    console.log(`\n📋 ${colors.yellow('仅支持Sonnet 4的账号')} (${sonnetOnlyAccounts.length}):`)
    sonnetOnlyAccounts
      .sort((a, b) => a.sonnet4.responseTime - b.sonnet4.responseTime)
      .forEach(acc => {
        console.log(`  ${colors.bold(acc.name)}:`)
        console.log(`    ✅ Sonnet 4: ${acc.sonnet4.speed} (${acc.sonnet4.responseTime}ms)`)
        console.log(`    ❌ Opus 4.1: ${acc.opus41.errorType} - ${acc.opus41.error}`)
      })
  }

  // 都不支持的账号
  const failedAccounts = results.filter(r => r.overallStatus === 'both_failed')
  if (failedAccounts.length > 0) {
    console.log(`\n❌ ${colors.red('都不支持的账号')} (${failedAccounts.length}):`)
    
    // 按Sonnet 4错误类型分组
    const errorGroups = {}
    failedAccounts.forEach(acc => {
      const type = acc.sonnet4.errorType || '未知错误'
      if (!errorGroups[type]) {
        errorGroups[type] = []
      }
      errorGroups[type].push(acc)
    })

    Object.entries(errorGroups).forEach(([type, accounts]) => {
      console.log(`\n  ${colors.yellow(type)} (${accounts.length}):`)
      accounts.forEach(acc => {
        console.log(`    - ${colors.bold(acc.name)}: ${acc.sonnet4.error}`)
      })
    })
  }

  // 模型详细统计
  console.log(`\n📊 ${colors.cyan('模型详细统计')}:`)
  const sonnet4Success = results.filter(r => r.sonnet4.status === 'success').length
  const opus41Success = results.filter(r => r.opus41.status === 'success').length
  
  console.log(`  🔸 Sonnet 4 成功率: ${sonnet4Success}/${stats.total} (${(sonnet4Success / stats.total * 100).toFixed(1)}%)`)
  console.log(`  🔸 Opus 4.1 成功率: ${opus41Success}/${stats.total} (${(opus41Success / stats.total * 100).toFixed(1)}%)`)

  // 性能排行（双模型支持的账号）
  if (bothSupportAccounts.length > 0) {
    console.log(`\n🏆 ${colors.cyan('双模型性能排行')} (总响应时间):`)
    bothSupportAccounts
      .sort((a, b) => (a.sonnet4.responseTime + a.opus41.responseTime) - (b.sonnet4.responseTime + b.opus41.responseTime))
      .slice(0, Math.min(5, bothSupportAccounts.length))
      .forEach((acc, index) => {
        const totalTime = acc.sonnet4.responseTime + acc.opus41.responseTime
        console.log(`  ${index + 1}. ${acc.name}: ${totalTime}ms (Sonnet:${acc.sonnet4.responseTime}ms + Opus:${acc.opus41.responseTime}ms)`)
      })
  }

  return { results, stats }
}

// 保存结果到CSV文件
function saveResults(results, stats) {
  const reportDir = path.join(process.cwd(), 'test-reports')
  
  // 创建报告目录
  if (!fs.existsSync(reportDir)) {
    fs.mkdirSync(reportDir, { recursive: true })
  }

  const csvPath = path.join(reportDir, 'claude-test-results-latest.csv')
  const backupPath = path.join(reportDir, 'claude-test-results-backup.csv')
  
  // 如果当前文件存在，创建备份
  if (fs.existsSync(csvPath)) {
    try {
      fs.copyFileSync(csvPath, backupPath)
      console.log(`🔄 已备份上次结果到: ${colors.yellow('claude-test-results-backup.csv')}`)
    } catch (error) {
      console.log(`⚠️ 备份文件时出现错误: ${error.message}`)
    }
  }

  // 生成CSV内容
  const timestamp = new Date().toLocaleString('zh-CN')
  const csvHeaders = `# 生成时间: ${timestamp}\n用户名称,url,key,sonnet4通过性,opus4通过性\n`
  const csvRows = results.map(result => {
    const sonnet4Status = result.sonnet4.status === 'success' ? '通过' : '失败'
    const opus4Status = result.opus41.status === 'success' ? '通过' : 
                       result.opus41.status === 'skipped' ? '跳过' : '失败'
    
    // 处理可能包含逗号的字段，用双引号包围
    const name = result.name.includes(',') ? `"${result.name}"` : result.name
    const url = result.url.includes(',') ? `"${result.url}"` : result.url
    const key = result.fullKey.includes(',') ? `"${result.fullKey}"` : result.fullKey
    
    return `${name},${url},${key},${sonnet4Status},${opus4Status}`
  }).join('\n')

  const csvContent = csvHeaders + csvRows
  
  // 保存CSV文件
  fs.writeFileSync(csvPath, csvContent, 'utf-8')
  
  console.log(`\n📊 测试结果已更新至: ${colors.cyan('claude-test-results-latest.csv')}`)
  console.log(`📁 文件包含字段: 用户名称, url, key, sonnet4通过性, opus4通过性`)
  
  // 显示统计概要
  const passedSonnet4 = results.filter(r => r.sonnet4.status === 'success').length
  const passedOpus4 = results.filter(r => r.opus41.status === 'success').length
  
  console.log(`\n📈 CSV统计概要:`)
  console.log(`  📋 Sonnet 4 通过: ${passedSonnet4}/${results.length} 个账号`)
  console.log(`  📋 Opus 4.1 通过: ${passedOpus4}/${results.length} 个账号`)
  console.log(`  🎉 双模型通过: ${stats.both_success} 个账号`)
}

// 解析CSV文件
function parseCSV(content) {
  const lines = content.trim().split('\n')
  const accounts = []
  
  // 跳过标题行
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue
    
    // 处理CSV格式（考虑可能包含逗号的字段）
    const parts = line.split(',')
    if (parts.length >= 3) {
      accounts.push({
        name: parts[0].trim(),
        url: parts[1].trim(),
        key: parts[2].trim()
      })
    }
  }
  
  return accounts
}

// 主函数
async function main() {
  try {
    const options = parseArgs()
    
    // 读取账号配置
    if (!fs.existsSync(options.configFile)) {
      console.error(`❌ 配置文件不存在: ${options.configFile}`)
      process.exit(1)
    }

    const configContent = fs.readFileSync(options.configFile, 'utf-8')
    let accounts

    // 根据文件扩展名选择解析方式
    const fileExt = path.extname(options.configFile).toLowerCase()
    
    if (fileExt === '.csv') {
      // CSV格式
      accounts = parseCSV(configContent)
      if (accounts.length === 0) {
        console.error('❌ CSV文件中没有找到有效的账号数据')
        process.exit(1)
      }
    } else if (fileExt === '.json') {
      // JSON格式
      try {
        accounts = JSON.parse(configContent)
      } catch (e) {
        console.error('❌ JSON文件格式错误')
        process.exit(1)
      }
    } else {
      // 尝试作为JSON解析（向后兼容）
      try {
        accounts = JSON.parse(configContent)
      } catch (e) {
        console.error('❌ 配置文件格式错误，支持.json或.csv格式')
        process.exit(1)
      }
    }

    if (!Array.isArray(accounts) || accounts.length === 0) {
      console.error('❌ 配置文件应包含账号数据')
      process.exit(1)
    }

    // 验证账号格式
    for (const account of accounts) {
      if (!account.name || !account.url || !account.key) {
        console.error(`❌ 账号配置格式错误，需要包含: name, url, key`)
        console.error('问题账号:', account)
        process.exit(1)
      }
    }

    console.log(colors.bold(`\n🚀 Claude CLI 双模型深度测试工具\n`))
    console.log(`配置文件: ${options.configFile}`)
    console.log(`账号数量: ${accounts.length}`)
    console.log(`测试方式: 真实 Claude CLI 调用`)
    console.log(`测试模型: claude-sonnet-4-20250514 → claude-opus-4-1-20250805`)
    console.log(`超时时间: ${options.timeout}ms`)
    console.log(`并行数量: ${options.parallel}`)
    console.log(colors.yellow(`\n✨ 优势: 直接通过 Claude CLI 验证，确保账号真实可用`))

    // 执行批量测试
    const results = await batchTest(accounts, options)

    // 生成报告
    const { stats } = generateReport(results)

    // 保存结果
    saveResults(results, stats)

    // 发送钉钉通知
    await sendDingTalkNotification(results, stats, options)

    // 设置退出码
    process.exit(stats.both_failed > 0 ? 1 : 0)

  } catch (error) {
    console.error('\n❌ 测试过程出错:', error.message)
    if (options.verbose) {
      console.error(error.stack)
    }
    process.exit(1)
  }
}

// 运行主函数
main()