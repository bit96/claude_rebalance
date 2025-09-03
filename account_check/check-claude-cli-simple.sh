#!/bin/bash

# 简单的Claude账号批量测试脚本
# 使用方法: ./check-claude-cli-simple.sh accounts.txt
# 
# accounts.txt 格式（每行一个账号）:
# 账号名称|API_URL|API_KEY
# 例如:
# 账号1|https://api.anthropic.com|sk-ant-api03-xxxxx

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 检查参数
if [ $# -eq 0 ]; then
    echo "用法: $0 <accounts.txt>"
    echo "账号文件格式: 账号名称|API_URL|API_KEY"
    exit 1
fi

ACCOUNTS_FILE=$1
REPORT_FILE="test-report-$(date +%Y%m%d-%H%M%S).txt"
VALID_ACCOUNTS_FILE="valid-accounts-$(date +%Y%m%d-%H%M%S).txt"

# 检查文件是否存在
if [ ! -f "$ACCOUNTS_FILE" ]; then
    echo -e "${RED}❌ 账号文件不存在: $ACCOUNTS_FILE${NC}"
    exit 1
fi

# 检查claude命令是否存在
if ! command -v claude &> /dev/null; then
    echo -e "${RED}❌ claude命令未安装${NC}"
    echo "请先安装Claude CLI: npm install -g @anthropic-ai/claude-cli"
    exit 1
fi

# 统计变量
TOTAL=0
SUCCESS=0
FAILED=0

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}🚀 Claude 账号批量测试${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# 创建报告文件
echo "Claude账号测试报告 - $(date)" > "$REPORT_FILE"
echo "================================" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"

# 测试函数
test_account() {
    local name=$1
    local url=$2
    local key=$3
    local test_question="你是什么模型？请用一句话回答。"
    
    echo -e "${YELLOW}🔄 测试账号: $name${NC}"
    
    # 设置环境变量
    export ANTHROPIC_API_URL="$url"
    export ANTHROPIC_API_KEY="$key"
    
    # 创建临时文件存储响应
    TEMP_RESPONSE=$(mktemp)
    
    # 使用timeout限制执行时间，并捕获输出
    if timeout 30s bash -c "echo '$test_question' | claude" > "$TEMP_RESPONSE" 2>&1; then
        # 检查响应内容
        RESPONSE=$(cat "$TEMP_RESPONSE")
        if [[ -n "$RESPONSE" ]] && [[ ! "$RESPONSE" =~ "error" ]]; then
            echo -e "${GREEN}✅ $name - 测试成功${NC}"
            echo "   响应摘要: $(echo "$RESPONSE" | head -n 1 | cut -c 1-50)..."
            
            # 记录到报告
            echo "✅ $name - 成功" >> "$REPORT_FILE"
            echo "   URL: $url" >> "$REPORT_FILE"
            echo "   响应: $(echo "$RESPONSE" | head -n 1)" >> "$REPORT_FILE"
            echo "" >> "$REPORT_FILE"
            
            # 保存有效账号
            echo "$name|$url|$key" >> "$VALID_ACCOUNTS_FILE"
            
            ((SUCCESS++))
            return 0
        else
            echo -e "${RED}❌ $name - 响应异常${NC}"
            echo "   错误: $RESPONSE"
            
            echo "❌ $name - 响应异常" >> "$REPORT_FILE"
            echo "   错误: $RESPONSE" >> "$REPORT_FILE"
            echo "" >> "$REPORT_FILE"
            
            ((FAILED++))
            return 1
        fi
    else
        echo -e "${RED}❌ $name - 测试失败（超时或错误）${NC}"
        
        echo "❌ $name - 失败" >> "$REPORT_FILE"
        echo "   可能原因: API Key无效、网络问题或超时" >> "$REPORT_FILE"
        echo "" >> "$REPORT_FILE"
        
        ((FAILED++))
        return 1
    fi
    
    # 清理临时文件
    rm -f "$TEMP_RESPONSE"
}

# 读取账号文件并测试
while IFS='|' read -r name url key || [ -n "$name" ]; do
    # 跳过空行和注释行
    [[ -z "$name" || "$name" =~ ^# ]] && continue
    
    ((TOTAL++))
    test_account "$name" "$url" "$key"
    echo ""
done < "$ACCOUNTS_FILE"

# 生成统计报告
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}📊 测试统计${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo "总账号数: $TOTAL"
echo -e "${GREEN}成功: $SUCCESS ($((SUCCESS * 100 / TOTAL))%)${NC}"
echo -e "${RED}失败: $FAILED ($((FAILED * 100 / TOTAL))%)${NC}"
echo ""

# 追加统计到报告文件
echo "================================" >> "$REPORT_FILE"
echo "统计汇总" >> "$REPORT_FILE"
echo "总账号数: $TOTAL" >> "$REPORT_FILE"
echo "成功: $SUCCESS ($((SUCCESS * 100 / TOTAL))%)" >> "$REPORT_FILE"
echo "失败: $FAILED ($((FAILED * 100 / TOTAL))%)" >> "$REPORT_FILE"

# 显示文件位置
echo -e "${BLUE}📁 报告文件:${NC} $REPORT_FILE"
if [ -f "$VALID_ACCOUNTS_FILE" ]; then
    echo -e "${BLUE}✅ 有效账号:${NC} $VALID_ACCOUNTS_FILE"
fi

# 设置退出码
if [ $FAILED -gt 0 ]; then
    exit 1
else
    exit 0
fi