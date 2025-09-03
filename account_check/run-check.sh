#!/bin/bash

# Claude账号检查脚本 - 定时任务运行器
# 用途：通过crontab定时执行Claude账号可用性检查
# 功能：日志记录、错误处理、自动清理

# 设置脚本目录为工作目录
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# 创建必要目录
mkdir -p test-reports

# 检查必要文件
if [ ! -f "check-claude-cli-accounts.js" ]; then
    echo "错误: 找不到主脚本文件 check-claude-cli-accounts.js" >&2
    exit 1
fi

if [ ! -f "cc全员账号.csv" ]; then
    echo "错误: 找不到账号配置文件 cc全员账号.csv" >&2
    exit 1
fi

# 检查Node.js和Claude CLI
if ! command -v node &> /dev/null; then
    echo "错误: Node.js 未安装或不在PATH中" >&2
    exit 1
fi

if ! command -v claude &> /dev/null; then
    echo "错误: Claude CLI 未安装或不在PATH中" >&2
    exit 1
fi

# 执行主脚本
node check-claude-cli-accounts.js cc全员账号.csv --parallel 2 --timeout 60000

# 获取退出码
EXIT_CODE=$?

# 显示CSV文件信息
CSV_FILE="test-reports/claude-test-results-latest.csv"
if [ -f "$CSV_FILE" ]; then
    echo "📊 最新报告: $CSV_FILE"
    CSV_LINES=$(wc -l < "$CSV_FILE" 2>/dev/null || echo "0")
    echo "📋 报告行数: $CSV_LINES (包含标题和注释行)"
    
    # 显示文件修改时间
    if command -v stat > /dev/null 2>&1; then
        MODIFY_TIME=$(stat -f "%Sm" -t "%Y-%m-%d %H:%M:%S" "$CSV_FILE" 2>/dev/null)
        [ -n "$MODIFY_TIME" ] && echo "🕰️ 更新时间: $MODIFY_TIME"
    fi
else
    echo "⚠️ 未找到报告文件: $CSV_FILE"
fi

# 如果是交互式运行，显示简要信息
if [ -t 1 ]; then
    echo ""
    echo "=== 执行完成 ==="
    echo "退出码: $EXIT_CODE"
    if [ -f "$CSV_FILE" ]; then
        echo "最新报告: $CSV_FILE"
    fi
fi

exit $EXIT_CODE