# Claude账号检查系统 - 服务器部署指南

## 概述

本文档提供Claude账号批量检查系统的完整服务器部署方案，包括环境准备、文件传输、定时任务配置和监控维护。

## 系统要求

### 服务器环境
- **操作系统**: Linux (CentOS 7+, Ubuntu 18.04+, 或其他主流发行版)
- **Node.js**: 版本 16.0+ (推荐 18.x LTS)
- **内存**: 最少 512MB (推荐 1GB+)
- **磁盘**: 最少 100MB 可用空间

### 网络要求
- 能够访问 Anthropic API (https://api.anthropic.com)
- 能够访问钉钉机器人API (https://oapi.dingtalk.com)
- 如使用代理服务，确保代理服务器可达

## 第一步：环境准备

### 1.1 安装 Node.js

**CentOS/RHEL:**
```bash
curl -fsSL https://rpm.nodesource.com/setup_18.x | sudo bash -
sudo yum install -y nodejs
```

**Ubuntu/Debian:**
```bash
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs
```

**验证安装:**
```bash
node --version  # 应显示 v18.x.x
npm --version   # 应显示对应版本
```

### 1.2 安装 Claude CLI

```bash
# 全局安装 Claude CLI
npm install -g @anthropic-ai/claude-cli

# 验证安装
claude --version
```

### 1.3 创建工作目录

```bash
# 创建专用目录
mkdir -p /home/$USER/claude-checker
cd /home/$USER/claude-checker

# 创建子目录
mkdir -p test-reports
```

## 第二步：文件部署

### 2.1 文件传输（推荐方案）

**本地打包和上传:**
```bash
# 在本地执行
cd /Users/abc/PycharmProjects/claude_service/account_check

# 打包必要文件
tar -czf claude-checker.tar.gz \
    check-claude-cli-accounts.js \
    cc全员账号.csv \
    run-check.sh \
    monitor.sh

# 上传到服务器
scp claude-checker.tar.gz user@your-server:/home/user/
```

**服务器端解压:**
```bash
# 登录服务器
ssh user@your-server

# 解压文件
cd /home/user
tar -xzf claude-checker.tar.gz -C claude-checker/

# 进入工作目录
cd claude-checker

# 设置脚本执行权限
chmod +x *.sh
chmod +x *.js
```

### 2.2 替代方案：rsync 同步

```bash
# 增量同步（适合频繁更新）
rsync -avz --exclude='test-reports/' \
    /Users/abc/PycharmProjects/claude_service/account_check/ \
    user@your-server:/home/user/claude-checker/
```

## 第三步：功能验证

### 3.1 手动测试

```bash
cd /home/user/claude-checker

# 测试主脚本
node check-claude-cli-accounts.js cc全员账号.csv --parallel 1 --timeout 30000

# 测试运行脚本
./run-check.sh

# 测试监控脚本
./monitor.sh
```

### 3.2 检查输出

成功运行后应该看到：
- ✅ CSV报告文件: `test-reports/claude-test-results-latest.csv`
- ✅ 备份文件: `test-reports/claude-test-results-backup.csv`
- ✅ 钉钉通知发送成功

## 第四步：定时任务配置

### 4.1 编辑 Crontab

```bash
crontab -e
```

### 4.2 添加定时任务

**推荐配置（每2小时执行）:**
```bash
# 设置环境变量
PATH=/usr/local/sbin:/usr/local/bin:/sbin:/bin:/usr/sbin:/usr/bin
SHELL=/bin/bash

# Claude账号检查 - 每2小时执行
0 */2 * * * /home/user/claude-checker/run-check.sh >/dev/null 2>&1

# 现在只会生成 latest.csv 和 backup.csv，不需要清理
# 0 2 * * 1 find /home/user/claude-checker/test-reports -name "*.csv" -mtime +30 -delete
```

**其他频率选项:**
```bash
# 每小时执行
0 * * * * /home/user/claude-checker/run-check.sh >/dev/null 2>&1

# 每天早晚各执行一次
0 8,20 * * * /home/user/claude-checker/run-check.sh >/dev/null 2>&1

# 仅工作日每4小时执行
0 8-18/4 * * 1-5 /home/user/claude-checker/run-check.sh >/dev/null 2>&1
```

### 4.3 验证定时任务

```bash
# 查看当前crontab
crontab -l

# 检查cron服务状态
sudo systemctl status crond  # CentOS
sudo systemctl status cron   # Ubuntu
```

## 第五步：监控和维护

### 5.1 日常监控

**查看系统状态:**
```bash
cd /home/user/claude-checker
./monitor.sh
```


**查看最新报告:**
```bash
ls -la test-reports/
# 显示 latest.csv 和 backup.csv 文件
```

### 5.2 日志管理

**查看报告文件:**
```bash
# 查看最新报告
cat test-reports/claude-test-results-latest.csv

# 对比上次结果
diff test-reports/claude-test-results-backup.csv test-reports/claude-test-results-latest.csv
```

### 5.3 故障排除

**常见问题检查:**
```bash
# 检查Node.js
node --version

# 检查Claude CLI
claude --version

# 检查文件权限
ls -la *.sh *.js

# 检查最近错误
# 检查最近错误需要手动查看控制台输出
```

**重新部署:**
```bash
# 停止可能运行的进程
pkill -f "check-claude-cli-accounts.js"

# 重新上传文件
# 重新设置权限
chmod +x run-check.sh monitor.sh check-claude-cli-accounts.js
```

## 第六步：安全和优化

### 6.1 安全考虑

**文件权限:**
```bash
# 确保只有所有者可以读取账号文件
chmod 600 cc全员账号.csv

# 脚本文件权限
chmod 755 *.sh *.js
```


### 6.2 性能优化

**调整并行数:**
- 服务器配置较低：`--parallel 1`
- 服务器配置中等：`--parallel 2-3` 
- 服务器配置较高：`--parallel 5`

**调整执行频率:**
- 测试环境：每小时执行
- 生产环境：每2-4小时执行
- 稳定环境：每天2次

### 6.3 监控告警

除了钉钉通知外，还可以添加：

**邮件告警（可选）:**
```bash
# 在run-check.sh中添加
if [ $EXIT_CODE -ne 0 ]; then
    echo "Claude账号检查失败" | mail -s "Claude检查告警" admin@company.com
fi
```


## 目录结构

部署完成后的目录结构：
```
/home/user/claude-checker/
├── check-claude-cli-accounts.js  # 主检查脚本
├── cc全员账号.csv                # 账号配置文件
├── run-check.sh                  # crontab运行脚本  
├── monitor.sh                    # 系统监控脚本
├── DEPLOY.md                     # 本部署文档
└── test-reports/                 # 测试结果目录
    ├── claude-test-results-latest.csv # 最新CSV测试报告
    └── claude-test-results-backup.csv # 上次报告备份
```

## 维护清单

### 日常检查（推荐每周）
- [ ] 运行 `./monitor.sh` 检查系统状态
- [ ] 检查钉钉群是否收到通知
- [ ] 查看最新的CSV报告

### 月度维护
- [ ] 检查报告文件是否正常更新
- [ ] 更新账号配置文件（如有变更）
- [ ] 检查服务器磁盘空间

### 故障处理
- [ ] 检查Node.js和Claude CLI版本
- [ ] 验证网络连通性
- [ ] 重新上传账号配置文件
- [ ] 重启cron服务

---

## 联系支持

如遇到问题，可以：
1. 运行 `./monitor.sh` 查看系统状态
2. 手动执行 `./run-check.sh` 进行调试