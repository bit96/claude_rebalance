# Claude 账号批量检查工具

## 工具说明

根据你的日常测试习惯（在命令行通过 `claude` 命令问"你是什么模型，速度快不快"），提供了三种批量检查方案：

### 方案1: Node.js 版本（推荐）
`check-claude-cli-accounts.js` - 功能全面，支持并行测试

**特点:**
- ✅ 支持并行测试，速度快
- ✅ 详细的性能分析和错误分类
- ✅ 生成 JSON 和文本报告
- ✅ 自动保存可用账号列表

### 方案2: Shell 版本（简单）
`check-claude-cli-simple.sh` - 简单易用，适合快速检查

**特点:**
- ✅ 简单直接，无需安装依赖
- ✅ 真实模拟你的测试过程
- ✅ 适合日常快速检查

## 使用方法

### 1. 准备账号配置文件

#### JSON 格式 (用于 Node.js 版本)
```json
[
  {
    "name": "账号1-免费版",
    "url": "https://api.anthropic.com",
    "key": "sk-ant-api03-xxxxx"
  },
  {
    "name": "账号2-Pro版", 
    "url": "https://api.anthropic.com",
    "key": "sk-ant-api03-yyyyy"
  }
]
```

#### 文本格式 (用于 Shell 版本)
```
# 格式: 账号名称|API_URL|API_KEY
账号1-免费版|https://api.anthropic.com|sk-ant-api03-xxxxx
账号2-Pro版|https://api.anthropic.com|sk-ant-api03-yyyyy
```

### 2. 运行测试

#### Node.js 版本
```bash
# 基本用法
node scripts/check-claude-cli-accounts.js accounts.json

# 高级用法
node scripts/check-claude-cli-accounts.js accounts.json \
  --timeout 30000 \
  --model claude-3-5-sonnet-20241022 \
  --parallel 5 \
  --verbose
```

#### Shell 版本
```bash
# 运行测试
./scripts/check-claude-cli-simple.sh accounts.txt
```

### 3. 参数说明

| 参数 | 说明 | 默认值 |
|------|------|--------|
| `--timeout` | 请求超时时间(ms) | 30000 |
| `--model` | 测试使用的模型 | claude-3-5-sonnet-20241022 |
| `--parallel` | 并行测试数量 | 1 |
| `--verbose` | 显示详细错误信息 | false |

## 测试报告

### 输出示例
```
🚀 Claude 账号批量测试工具

配置文件: accounts.json
账号数量: 4
测试模型: claude-3-5-sonnet-20241022
超时时间: 30000ms
并行数量: 5

🔄 测试账号: 账号1-免费版
✅ 账号1-免费版 - ⚡ 极快 (1234ms)

🔄 测试账号: 账号2-Pro版
❌ 账号2-Pro版 - 认证失败: Invalid API key

============================================================
📊 测试报告
============================================================

📈 统计概览:
  总账号数: 4
  可用: 2 (50.0%)
  失败: 2 (50.0%)

✅ 可用账号 (2):
  账号1-免费版 - ⚡ 极快 (1234ms) - claude-3-5-sonnet-20241022
  账号3-团队版 - 🚀 快速 (3456ms) - claude-3-5-sonnet-20241022

❌ 失败账号 (2):

  认证失败 (1):
    - 账号2-Pro版: Invalid API key

  网络错误 (1):
    - 账号4-测试: Connection timeout

🏆 性能排行 (响应时间):
  1. 账号1-免费版: 1234ms ⚡ 极快
  2. 账号3-团队版: 3456ms 🚀 快速

💾 可用账号已保存至: test-reports/valid-accounts-2024-08-29T10-30-45-123Z.json
📁 完整报告已保存至: test-reports/claude-test-2024-08-29T10-30-45-123Z.json
```

### 生成的文件

1. **完整测试报告** (`claude-test-*.json`)
   - 包含所有测试结果和统计信息
   - JSON 格式，便于进一步分析

2. **可用账号列表** (`valid-accounts-*.json` / `valid-accounts-*.txt`)
   - 只包含测试通过的账号
   - 可直接用于后续配置

## 错误类型说明

| 错误类型 | 说明 | 解决方案 |
|----------|------|----------|
| 认证失败 | API Key 无效或过期 | 检查 API Key 是否正确 |
| 限流 | 请求过于频繁 | 稍后重试或降低并发数 |
| 无权限 | 账号无访问权限 | 检查账号订阅状态 |
| 超时 | 请求响应超时 | 增加超时时间或检查网络 |
| 连接被拒绝 | URL 无法访问 | 检查 API URL 是否正确 |
| 网络错误 | 其他网络问题 | 检查网络连接和代理设置 |

## 速度等级

| 等级 | 响应时间 | 说明 |
|------|----------|------|
| ⚡ 极快 | < 2秒 | 优秀的响应速度 |
| 🚀 快速 | 2-5秒 | 良好的响应速度 |
| 🐢 较慢 | 5-10秒 | 可接受的响应速度 |
| 🐌 很慢 | > 10秒 | 需要优化或更换 |

## 最佳实践

1. **定期检查**: 建议每周运行一次完整检查
2. **并行测试**: 对于大量账号，使用 `--parallel 5-10` 提高效率
3. **保存记录**: 保留测试报告，便于追踪账号状态变化
4. **分类管理**: 根据测试结果对账号进行分类管理
5. **及时处理**: 对失败的账号及时处理，避免影响业务

## 故障排除

### 1. `claude` 命令未找到
```bash
# 安装 Claude CLI
npm install -g @anthropic-ai/claude-cli

# 或使用 pip (如果是 Python 版本)
pip install anthropic-claude-cli
```

### 2. 权限错误
```bash
# 给脚本添加执行权限
chmod +x scripts/check-claude-cli-simple.sh
```

### 3. Node.js 依赖问题
```bash
# 安装依赖
npm install axios chalk
```

### 4. 超时问题
- 增加 `--timeout` 参数值
- 减少 `--parallel` 参数值
- 检查网络连接

## 集成到 CI/CD

可以将测试集成到持续集成流程中：

```bash
# 在 CI 中运行测试
node scripts/check-claude-cli-accounts.js accounts.json --parallel 1 --timeout 60000

# 检查退出码
if [ $? -eq 0 ]; then
  echo "所有账号测试通过"
else
  echo "有账号测试失败，请检查"
  exit 1
fi
```